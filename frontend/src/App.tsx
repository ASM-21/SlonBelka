import { useEffect, useState } from "react";
import { token } from "./lib/api";
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

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!token.get());
  const [view, setView] = useState<View>("home");
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  // The API layer fires this when a refresh fails (session fully expired).
  useEffect(() => {
    const onExpired = () => setAuthed(false);
    window.addEventListener("slonbelka:auth-expired", onExpired);
    return () => window.removeEventListener("slonbelka:auth-expired", onExpired);
  }, []);

  // Legal docs render above the auth gate so Terms/Privacy open pre-login
  // (the signup checkbox links to them).
  if (legalDoc)
    return (
      <main className="min-h-screen bg-neutral-50 text-neutral-900">
        <LegalPage doc={legalDoc} onBack={() => setLegalDoc(null)} />
      </main>
    );

  if (!authed)
    return (
      <AuthScreen
        onAuthed={() => {
          setView("home");
          setAuthed(true);
        }}
        onShowLegal={setLegalDoc}
      />
    );

  const home = () => setView("home");

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
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
      {view === "upgrade" && <UpgradePage onDone={home} />}
      {view === "extra" && <ExtraStudyPage onDone={home} />}
      {view === "burned" && <BurnedPage onDone={home} />}
      {view === "stats" && <StatsPage onDone={home} />}
    </main>
  );
}
