import { useState } from "react";
import { forgotPassword, login, register, resetPassword, token } from "../lib/api";
import { LegalDoc } from "./LegalPage";

type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthScreen({
  onAuthed,
  onShowLegal,
}: {
  onAuthed: () => void;
  onShowLegal: (doc: LegalDoc) => void;
}) {
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setError(null);
    setInfo(null);
  };

  const submit = async () => {
    setBusy(true);
    reset();
    try {
      if (mode === "register" || mode === "login") {
        const { access_token, refresh_token } =
          mode === "register" ? await register(email, password, agreed) : await login(email, password);
        token.set(access_token, refresh_token);
        onAuthed();
      } else if (mode === "forgot") {
        await forgotPassword(email);
        setInfo("If that email is registered, a reset link is on its way.");
        setMode("reset");
      } else {
        await resetPassword(resetToken, password);
        setInfo("Password reset. You can log in now.");
        setMode("login");
        setPassword("");
      }
    } catch {
      if (mode === "register") setError("Could not register (email taken, or password under 8 characters?)");
      else if (mode === "login") setError("Invalid credentials");
      else if (mode === "reset") setError("That reset link is invalid or expired");
      else setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    mode === "forgot"
      ? !!email
      : mode === "reset"
        ? !!resetToken && password.length >= 8
        : mode === "register"
          ? !!email && !!password && agreed
          : !!email && !!password;

  return (
    <div className="mx-auto mt-24 w-full max-w-sm px-6">
      <h1 className="mb-1 text-center text-4xl font-semibold tracking-tight">Slonbelka</h1>
      <p className="mb-8 text-center text-neutral-500">Russian, one word at a time.</p>

      <div className="flex flex-col gap-3">
        {mode === "reset" ? (
          <input
            placeholder="reset code from email"
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
        ) : (
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
        )}

        {mode !== "forgot" && (
          <input
            type="password"
            placeholder={mode === "reset" ? "new password (8+ chars)" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
        )}

        {mode === "register" && (
          <label className="flex items-start gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
            />
            <span>
              I agree to the{" "}
              <button
                type="button"
                onClick={() => onShowLegal("terms")}
                className="underline hover:text-neutral-900"
              >
                Terms of Service
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={() => onShowLegal("privacy")}
                className="underline hover:text-neutral-900"
              >
                Privacy Policy
              </button>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}

        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-40"
        >
          {mode === "register" ? "Create account" : mode === "login" ? "Log in" : mode === "forgot" ? "Send reset link" : "Set new password"}
        </button>

        <div className="flex flex-col gap-1 text-center text-sm text-neutral-500">
          {mode === "login" && (
            <>
              <button onClick={() => { reset(); setMode("register"); }} className="hover:text-neutral-800">
                New here? Create an account
              </button>
              <button onClick={() => { reset(); setMode("forgot"); }} className="hover:text-neutral-800">
                Forgot password?
              </button>
            </>
          )}
          {mode === "register" && (
            <button onClick={() => { reset(); setMode("login"); }} className="hover:text-neutral-800">
              Have an account? Log in
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button onClick={() => { reset(); setMode("login"); }} className="hover:text-neutral-800">
              Back to log in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
