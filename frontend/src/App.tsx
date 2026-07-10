import { useEffect, useState } from "react";
import { token, verifyEmail } from "./lib/api";
import { AppParams, parseAppParams } from "./lib/urlParams";
import AuthScreen from "./components/AuthScreen";
import Home from "./components/Home";
import LessonSession from "./components/LessonSession";
import ReviewSession from "./components/ReviewSession";
import LeechesPage from "./components/LeechesPage";
import ItemBrowser from "./components/ItemBrowser";
import SettingsPage from "./components/SettingsPage";
import UpgradePage from "./components/UpgradePage";
import ExtraStudyPage from "./components/ExtraStudyPage";
import BurnedPage from "./components/BurnedPage";
import StatsPage from "./components/StatsPage";
import LegalPage, { LegalDoc } from "./components/LegalPage";

type View = "home" | "lessons" | "reviews" | "leeches" | "browse" | "settings" | "upgrade" | "extra" | "burned" | "stats";

// Entry params arrive from Stripe checkout returns and email links (the SPA
// has no path routing, so everything external lands on the root URL). Parsed
// once at module evaluation, then the URL is cleaned so tokens leave the
// address bar and refreshes stay stable.
function readEntryParams(): AppParams {
  const params = parseAppParams(window.location.search);
  if (window.location.search) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  return params;
}

export default function App() {
  const [entry] = useState<AppParams>(readEntryParams);
  const [authed, setAuthed] = useState<boolean>(() => !!token.get());
  const [view, setView] = useState<View>(entry.billing ? "upgrade" : "home");
  const [billingResult, setBillingResult] = useState<"success" | "cancel" | null>(entry.billing ?? null);
  const [verifyState, setVerifyState] = useState<"pending" | "ok" | "failed" | null>(
    entry.verifyToken ? "pending" : null,
  );
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  // The API layer fires this when a refresh fails (session fully expired).
  useEffect(() => {
    const onExpired = () => setAuthed(false);
    window.addEventListener("slonbelka:auth-expired", onExpired);
    return () => window.removeEventListener("slonbelka:auth-expired", onExpired);
  }, []);

  // Email verification links work logged in or out (the endpoint is public).
  useEffect(() => {
    if (!entry.verifyToken) return;
    verifyEmail(entry.verifyToken)
      .then(() => setVerifyState("ok"))
      .catch(() => setVerifyState("failed"));
  }, [entry.verifyToken]);

  const verifyBanner =
    verifyState === "ok" ? (
      <p className="mx-auto mt-3 w-full max-w-md rounded-xl border border-sb-line bg-sb-card px-4 py-2.5 text-center text-sm text-sb-ink">
        Почта подтверждена. <span className="text-sb-muted">Email verified, thank you!</span>
      </p>
    ) : verifyState === "failed" ? (
      <p className="mx-auto mt-3 w-full max-w-md rounded-xl border border-sb-line bg-sb-card px-4 py-2.5 text-center text-sm text-sb-ink">
        That verification link is invalid or expired.
      </p>
    ) : null;

  // Legal docs render above the auth gate so Terms/Privacy open pre-login
  // (the signup checkbox links to them).
  if (legalDoc)
    return (
      <main className="min-h-screen bg-sb-bg text-sb-ink">
        <LegalPage doc={legalDoc} onBack={() => setLegalDoc(null)} />
      </main>
    );

  if (!authed)
    return (
      <main className="min-h-screen bg-sb-bg text-sb-ink">
        {verifyBanner}
        <AuthScreen
          onAuthed={() => {
            // Keep the entry view (e.g. the billing result) if one was set.
            setView(entry.billing ? "upgrade" : "home");
            setAuthed(true);
          }}
          onShowLegal={setLegalDoc}
          initialMode={entry.resetToken ? "reset" : undefined}
          initialResetToken={entry.resetToken}
        />
      </main>
    );

  const home = () => setView("home");

  return (
    <main className="min-h-screen bg-sb-bg text-sb-ink">
      {verifyBanner}
      {view === "home" && (
        <Home
          onStartLessons={() => setView("lessons")}
          onStartReviews={() => setView("reviews")}
          onOpenLeeches={() => setView("leeches")}
          onBrowse={() => setView("browse")}
          onExtraStudy={() => setView("extra")}
          onBurned={() => setView("burned")}
          onStats={() => setView("stats")}
          onSettings={() => setView("settings")}
          onUpgrade={() => setView("upgrade")}
          onLogout={() => setAuthed(false)}
        />
      )}
      {view === "lessons" && <LessonSession onDone={home} />}
      {view === "reviews" && <ReviewSession onDone={home} />}
      {view === "leeches" && <LeechesPage onDone={home} />}
      {view === "browse" && <ItemBrowser onDone={home} />}
      {view === "settings" && <SettingsPage onDone={home} onShowLegal={setLegalDoc} />}
      {view === "upgrade" && (
        <UpgradePage
          onDone={() => {
            setBillingResult(null);
            home();
          }}
          result={billingResult ?? undefined}
        />
      )}
      {view === "extra" && <ExtraStudyPage onDone={home} />}
      {view === "burned" && <BurnedPage onDone={home} />}
      {view === "stats" && <StatsPage onDone={home} />}
    </main>
  );
}
