const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { getDB } = require("./database");
const COOKIE_NAME = "arynexa_session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
function getCookieOptions() {
  const production = process.env.NODE_ENV === "production";
  const sameSite = process.env.COOKIE_SAME_SITE || (production ? "none" : "lax");
  return {
    httpOnly: true,
    secure: production || sameSite === "none",
    sameSite,
    path: "/",
    maxAge: SESSION_DURATION
  };
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    authProvider: user.authProvider || "email"
  };
}
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes."
  }
});
async function ensureSessionIndexes() {
  const sessions = getDB().collection("sessions");
  await sessions.createIndex(
    { tokenHash: 1 },
    { unique: true, name: "unique_session_token" }
  );
  await sessions.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "session_expiry" }
  );
}
function registerAuthRoutes(app) {
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required."
        });
      }
      const user = await getDB().collection("users").findOne({ email });
      if (!user || !user.passwordHash) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password."
        });
      }
      const passwordMatches = await bcrypt.compare(
        password,
        user.passwordHash
      );
      if (!passwordMatches) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password."
        });
      }
      if (!user.emailVerified) {
        return res.status(403).json({
          success: false,
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email before logging in."
        });
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_DURATION);
      await getDB().collection("sessions").insertOne({
        tokenHash,
        userId: user._id,
        createdAt: now,
        expiresAt
      });
      res.cookie(COOKIE_NAME, token, getCookieOptions());
      return res.json({
        success: true,
        message: "Login successful.",
        user: publicUser(user)
      });
    } catch (error) {
      console.error("LOGIN ERROR:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to log in right now."
      });
    }
  });
  app.get("/api/auth/me", async (req, res) => {
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated."
        });
      }
      const tokenHash = hashToken(token);
      const session = await getDB().collection("sessions").findOne({
        tokenHash,
        expiresAt: { $gt: new Date() }
      });
      if (!session) {
        res.clearCookie(COOKIE_NAME, getCookieOptions());
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again."
        });
      }
      const user = await getDB().collection("users").findOne({
        _id: session.userId
      });
      if (!user) {
        await getDB().collection("sessions").deleteOne({ _id: session._id });
        res.clearCookie(COOKIE_NAME, getCookieOptions());
        return res.status(401).json({
          success: false,
          message: "Account not found."
        });
      }
      return res.json({
        success: true,
        user: publicUser(user)
      });
    } catch (error) {
      console.error("SESSION CHECK ERROR:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to verify session."
      });
    }
  });
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (token) {
        await getDB().collection("sessions").deleteOne({
          tokenHash: hashToken(token)
        });
      }
      res.clearCookie(COOKIE_NAME, getCookieOptions());
      return res.json({
        success: true,
        message: "Logged out successfully."
      });
    } catch (error) {
      console.error("LOGOUT ERROR:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to log out right now."
      });
    }
  });
}
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Please log in to continue."
      });
    }
    const session = await getDB().collection("sessions").findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() }
    });
    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again."
      });
    }
    const user = await getDB().collection("users").findOne({
      _id: session.userId
    });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found."
      });
    }
    req.user = publicUser(user);
    req.userId = user._id;
    next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Authentication check failed."
    });
  }
}
module.exports = {
  registerAuthRoutes,
  ensureSessionIndexes,
  requireAuth
};
