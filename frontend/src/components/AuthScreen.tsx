import { useState } from "react";
import { forgotPassword, login, register, resetPassword, token } from "../lib/api";
import { LegalDoc } from "./LegalPage";
import { MascotPlaceholder } from "./ui";

export type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthScreen({
  onAuthed,
  onShowLegal,
  initialMode,
  initialResetToken,
}: {
  onAuthed: () => void;
  onShowLegal: (doc: LegalDoc) => void;
  // Set when the user arrives via a password-reset email link, so they land
  // directly on the new-password form with the code prefilled.
  initialMode?: Mode;
  initialResetToken?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState(initialResetToken ?? "");
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

  const inputClass =
    "w-full rounded-xl border border-sb-line bg-sb-card px-4 py-3.5 text-[15px] text-sb-ink outline-none focus:border-sb-muted";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-7 py-10">
      <div className="mb-4 flex justify-center">
        <MascotPlaceholder />
      </div>
      <h1 className="text-center font-display text-4xl font-extrabold tracking-tight text-sb-ink">
        Слонбелка
      </h1>
      <p className="mt-1 text-center font-mono text-[13px] tracking-wider text-sb-muted">SLONBELKA</p>
      <p className="mb-8 mt-2 text-center text-[15px] text-sb-muted">
        Русский язык, по одному слову.
        <br />
        <span className="text-[13px] opacity-85">Russian, one word at a time.</span>
      </p>

      <div className="flex flex-col gap-3">
        {mode === "reset" ? (
          <input
            aria-label="Reset code from email"
            placeholder="reset code from email"
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
            className={inputClass}
          />
        ) : (
          <input
            type="email"
            autoComplete="email"
            aria-label="Email"
            placeholder="эл. почта — email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        )}

        {mode !== "forgot" && (
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-label="Password"
            placeholder={mode === "reset" ? "new password (8+ chars)" : "пароль — password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            className={inputClass}
          />
        )}

        {mode === "register" && (
          <label className="flex items-start gap-2 text-sm text-sb-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-sb-accent"
            />
            <span>
              I agree to the{" "}
              <button
                type="button"
                onClick={() => onShowLegal("terms")}
                className="underline hover:text-sb-ink"
              >
                Terms of Service
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={() => onShowLegal("privacy")}
                className="underline hover:text-sb-ink"
              >
                Privacy Policy
              </button>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}
        {info && <p className="text-sm text-sb-enl">{info}</p>}

        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className="rounded-xl bg-sb-accent px-3 py-3 font-semibold leading-tight text-white shadow-lg shadow-sb-accent/30 disabled:opacity-40"
        >
          {mode === "register" ? (
            <>
              Создать аккаунт
              <span className="block text-xs font-medium opacity-85">Create account</span>
            </>
          ) : mode === "login" ? (
            <>
              Войти
              <span className="block text-xs font-medium opacity-85">Log in</span>
            </>
          ) : mode === "forgot" ? (
            "Send reset link"
          ) : (
            "Set new password"
          )}
        </button>

        <div className="mt-1 flex flex-col gap-2 text-center text-sm text-sb-muted">
          {mode === "login" && (
            <>
              <button onClick={() => { reset(); setMode("register"); }} className="hover:text-sb-ink">
                Впервые здесь? <span className="font-semibold text-sb-accent">Создать аккаунт</span>
                <span className="block text-xs">New here? Create an account</span>
              </button>
              <button onClick={() => { reset(); setMode("forgot"); }} className="hover:text-sb-ink">
                Forgot password?
              </button>
            </>
          )}
          {mode === "register" && (
            <button onClick={() => { reset(); setMode("login"); }} className="hover:text-sb-ink">
              Уже есть аккаунт? <span className="font-semibold text-sb-accent">Войти</span>
              <span className="block text-xs">Already have an account? Log in</span>
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button onClick={() => { reset(); setMode("login"); }} className="hover:text-sb-ink">
              Back to log in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
