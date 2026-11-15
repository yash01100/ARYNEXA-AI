const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");
const { getDB } = require("./database");
const TOKEN_DURATION = 60 * 60 * 1000;
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
async function ensureVerificationIndexes() {
  const tokens = getDB().collection("verificationTokens");
  await tokens.createIndex(
    { tokenHash: 1 },
    { unique: true, name: "unique_verification_token" }
  );
  await tokens.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "verification_token_expiry" }
  );
  await tokens.createIndex(
    { userId: 1 },
    { name: "verification_user_lookup" }
  );
}
async function sendVerificationEmail(user) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const tokens = getDB().collection("verificationTokens");
  await tokens.deleteMany({ userId: user._id });
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_DURATION);
  await tokens.insertOne({
    tokenHash,
    userId: user._id,
    createdAt: new Date(),
    expiresAt
  });
  const apiBaseUrl = (
    process.env.API_BASE_URL || "http://localhost:5050"
  ).replace(/\/+$/, "");
  const verificationUrl =
    `${apiBaseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const sender = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  try {
    const result = await resend.emails.send({
      from: sender,
      to: [user.email],
      subject: "Verify your ARYNEXA AI account",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
          <h2>Welcome to ARYNEXA AI, ${String(user.name).replace(/[<>&"]/g, "")}!</h2>
          <p>Please verify your email address to activate your account.</p>
          <p>
            <a href="${verificationUrl}"
               style="display:inline-block;padding:12px 22px;background:#6546d7;color:white;text-decoration:none;border-radius:8px">
              Verify Email Address
            </a>
          </p>
          <p>This link expires in 1 hour.</p>
          <p>If you did not create this account, you can ignore this email.</p>
        </div>
      `
    });
    if (result.error) {
      throw new Error(result.error.message || "Email delivery failed.");
    }
  } catch (error) {
    await tokens.deleteOne({ tokenHash });
    throw error;
  }
}
function registerVerificationRoutes(app) {
  const resendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later."
    }
  });
  const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.get("/api/auth/verify-email", verifyLimiter, async (req, res) => {
    try {
      const token = String(req.query?.token || "");
      if (!/^[a-f0-9]{64}$/i.test(token)) {
        return res.status(400).json({
          success: false,
          message: "Invalid verification link."
        });
      }
      const tokens = getDB().collection("verificationTokens");
      const tokenHash = hashToken(token);
      const verification = await tokens.findOne({
        tokenHash,
        expiresAt: { $gt: new Date() }
      });
      if (!verification) {
        return res.status(400).json({
          success: false,
          message: "Verification link is invalid or expired. Please request a new one."
        });
      }
      const result = await getDB().collection("users").updateOne(
        { _id: verification.userId },
        {
          $set: {
            emailVerified: true,
            emailVerifiedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      await tokens.deleteMany({ userId: verification.userId });
      if (!result.matchedCount) {
        return res.status(404).json({
          success: false,
          message: "Account not found."
        });
      }
      return res.json({
        success: true,
        message: "Email verified successfully. You can now log in."
      });
    } catch (error) {
      console.error("EMAIL VERIFICATION ERROR:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to verify email right now."
      });
    }
  });
  app.post("/api/auth/resend-verification", resendLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email || email.length > 254) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid email address."
        });
      }
      const user = await getDB().collection("users").findOne({ email });
      if (!user || user.emailVerified) {
        return res.json({
          success: true,
          message: "If the account exists and needs verification, an email will be sent."
        });
      }
      await sendVerificationEmail(user);
      return res.json({
        success: true,
        message: "Verification email sent. Please check your inbox."
      });
    } catch (error) {
      console.error("RESEND VERIFICATION ERROR:", error.message);
      return res.status(503).json({
        success: false,
        message: "Unable to send verification email right now."
      });
    }
  });
}
module.exports = {
  sendVerificationEmail,
  registerVerificationRoutes,
  ensureVerificationIndexes
};
