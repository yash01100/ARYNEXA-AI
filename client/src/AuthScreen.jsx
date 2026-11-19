import { useState } from "react";
import "./AuthScreen.css";
const initialResetToken =
  new URLSearchParams(window.location.search).get("resetToken") || "";
export default function AuthScreen({ api, onLogin, onGuest }) {
  const [mode, setMode] = useState(initialResetToken ? "reset" : "login");
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = async (path, body) => {
    const response = await fetch(`${api}/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(
        data.message || data.detail || "Request failed."
      );
      err.code = data.code || data.error;
      throw err;
    }
    return data;
  };
  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (mode === "reset" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const data = await request("register", {
          name,
          email,
          password,
        });
        setNotice(
          data.message ||
          "Account created. Please check your email to verify your account."
        );
        changeMode("login");
        setPassword("");
      } else if (mode === "forgot") {
        const data = await request("forgot-password", { email });
        setNotice(
          data.message ||
          "If an account exists with this email, reset instructions will be sent."
        );
      } else if (mode === "reset") {
        const data = await request("reset-password", {
          token: resetToken,
          password,
        });
        setNotice(
          data.message ||
          "Password reset successful. Please log in with your new password."
        );
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        setResetToken("");
        changeMode("login");
      } else {
        const data = await request("login", { email, password });
        if (data.user) {
          onLogin(data.user);
        } else {
          throw new Error("Login response did not contain a user.");
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const resendVerification = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = await request("resend-verification", { email });
      setNotice(
        data.message ||
        "If your account needs verification, an email has been sent."
      );
    } catch (err) {
      setError(err.message || "Could not resend verification email.");
    } finally {
      setBusy(false);
    }
  };
  const heading = {
    login: "Welcome back.",
    register: "Create your account.",
    forgot: "Forgot password?",
    reset: "Set a new password.",
  };
  const description = {
    login: "Sign in to continue to your personal AI workspace.",
    register: "Sign up to get started with your AI workspace.",
    forgot: "Enter your registered email address to receive a password reset link.",
    reset: "Choose a new password for your ARYNEXA AI account.",
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">A</div>
          <div>
            <h1>ARYNEXA</h1>
            <span>YOUR AI WORKSPACE</span>
          </div>
        </div>
        <div className="auth-heading">
          <p className="auth-eyebrow">WELCOME TO ARYNEXA AI</p>
          <h2>{heading[mode]}</h2>
          <p>{description[mode]}</p>
        </div>
        {(mode === "login" || mode === "register") && (
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "selected" : ""}
              onClick={() => changeMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === "register" ? "selected" : ""}
              onClick={() => changeMode("register")}
            >
              Sign Up
            </button>
          </div>
        )}
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <label>
              Full name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
                maxLength={80}
                required
              />
            </label>
          )}
          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <label>
              {mode === "reset" ? "New password" : "Password"}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "login"
                    ? "Enter your password"
                    : "At least 8 characters"
                }
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "login" ? undefined : 8}
                maxLength={72}
                required
              />
            </label>
          )}
          {mode === "reset" && (
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
            </label>
          )}
          {error && (
            <div className="auth-message auth-error">{error}</div>
          )}
          {notice && (
            <div className="auth-message auth-success">{notice}</div>
          )}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Sign In"
                : mode === "register"
                  ? "Create Account"
                  : mode === "forgot"
                    ? "Send Reset Link"
                    : "Reset Password"}
          </button>
        </form>
        {mode === "login" && (
          <>
            <button
              type="button"
              className="auth-link"
              onClick={() => changeMode("forgot")}
              disabled={busy}
            >
              Forgot password?
            </button>
            <button
              type="button"
              className="auth-resend"
              onClick={resendVerification}
              disabled={busy || !email.trim()}
            >
              Resend verification email
            </button>
          </>
        )}
        {mode === "forgot" && (
          <button
            type="button"
            className="auth-link"
            onClick={() => changeMode("login")}
            disabled={busy}
          >
            Back to Login
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setResetToken("");
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname
              );
              changeMode("login");
            }}
            disabled={busy}
          >
            Back to Login
          </button>
        )}
        {mode === "login" && onGuest && (
          <button
            type="button"
            className="auth-guest-button"
            onClick={onGuest}
            disabled={busy}
          >
            Continue as Guest — text chat only
          </button>
        )}
        <p className="auth-footer">
          Secure access to your personal AI workspace.
        </p>
      </div>
    </div>
  );
}
