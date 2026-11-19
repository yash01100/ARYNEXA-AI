const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");
const { getDB } = require("./database");
const TOKEN_DURATION = 30 * 60 * 1000;
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});
async function ensurePasswordResetIndexes() {
  const tokens = getDB().collection("passwordResetTokens");
  await tokens.createIndex(
    { tokenHash: 1 },
    { unique: true, name: "unique_password_reset_token" }
  );
  await tokens.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "password_reset_expiry" }
  );
  await tokens.createIndex(
    { userId: 1 },
    { name: "password_reset_user" }
  );
}
function registerPasswordResetRoutes(app) {
  app.post("/api/auth/forgot-password", forgotLimiter, async (req, res) => {
    const genericMessage =
      "If an account exists with this email, password reset instructions will be sent.";
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address."
        });
      }
      const user = await getDB().collection("users").findOne({ email });
      if (!user || !user.passwordHash) {
        return res.json({ success: true, message: genericMessage });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const now = new Date();
      const tokens = getDB().collection("passwordResetTokens");
      await tokens.deleteMany({ userId: user._id });
      await tokens.insertOne({
        tokenHash,
        userId: user._id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + TOKEN_DURATION)
      });
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        await tokens.deleteOne({ tokenHash });
        console.error("PASSWORD RESET EMAIL ERROR: RESEND_API_KEY is not configured.");
        return res.json({ success: true, message: genericMessage });
      }
      const clientUrl = (
        process.env.CLIENT_URL || "http://localhost:5173"
      ).replace(/\/+$/, "");
      const resetUrl =
        `${clientUrl}/?resetToken=${encodeURIComponent(token)}`;
      const resend = new Resend(apiKey);
      try {
        const emailResult = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
          to: user.email,
          subject: "Reset your ARYNEXA AI password",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222">
              <h2>Reset your ARYNEXA AI password</h2>
              <p>Hello ${String(user.name || "there").replace(/[&<>"']/g, c => ({
                "&": "&amp;", "<": "&lt;", ">": "&gt;",
                '"': "&quot;", "'": "&#39;"
              })[c])},</p>
              <p>We received a request to reset your password.</p>
              <p>
                <a href="${resetUrl}"
                   style="display:inline-block;padding:12px 20px;background:#6d5dfc;color:white;text-decoration:none;border-radius:6px">
                  Reset Password
                </a>
              </p>
              <p>This link expires in 30 minutes and can only be used once.</p>
              <p>If you did not request this, you can ignore this email.</p>
            </div>
          `
        });
        if (emailResult.error) {
          await tokens.deleteOne({ tokenHash });
          console.error(
            "PASSWORD RESET EMAIL ERROR:",
            emailResult.error.message
          );
        }
      } catch (emailError) {
        await tokens.deleteOne({ tokenHash });
        console.error("PASSWORD RESET EMAIL ERROR:", emailError.message);
      }
      return res.json({ success: true, message: genericMessage });
    } catch (error) {
      console.error("FORGOT PASSWORD ERROR:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to process your request right now."
      });
    }
  });
  app.post("/api/auth/reset-password", resetLimiter, async (req, res) => {
    try {
      const token = String(req.body?.token || "");
      const password = String(req.body?.password || "");
      if (!/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset link."
        });
      }
      if (
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters and no more than 72 bytes."
        });
      }
      const tokens = getDB().collection("passwordResetTokens");
      const resetRecord = await tokens.findOne({
        tokenHash: hashToken(token),
        expiresAt: { $gt: new Date() }
      });
      if (!resetRecord) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset link. Please request a new one."
        });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const updateResult = await getDB().collection("users").updateOne(
        { _id: resetRecord.userId },
        { $set: { passwordHash, updatedAt: new Date() } }
      );
      if (!updateResult.matchedCount) {
        await tokens.deleteOne({ _id: resetRecord._id });
        return res.status(400).json({
          success: false,
          message: "Account not found. Please contact support."
        });
      }
      await tokens.deleteMany({ userId: resetRecord.userId });
      // Invalidate all existing sessions after a password change.
      await getDB().collection("sessions").deleteMany({
        userId: resetRecord.userId
      });
      return res.json({
        success: true,
        message: "Password reset successful. Please log in with your new password."
      });
    } catch (error) {
      console.error("RESET PASSWORD ERROR:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to reset your password right now."
      });
    }
  });
}
module.exports = {
  registerPasswordResetRoutes,
  ensurePasswordResetIndexes
};

