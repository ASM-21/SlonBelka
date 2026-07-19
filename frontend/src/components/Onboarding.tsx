import { useState } from "react";
import { updateSettings } from "../lib/api";
import { Layout } from "./CyrillicKeyboard";
import ProductionInput from "./ProductionInput";
import { MascotPlaceholder } from "./ui";

/**
 * First-run walkthrough, shown once per account (the `onboarded` settings
 * flag). Three short slides: what the app is, how the SRS works, and a
 * hands-on try of the Cyrillic input, which is the first real cliff for
 * new learners. Finishing (or skipping) persists the flag.
 */
export default function Onboarding({
  onFinish,
}: {
  onFinish: (startLessons: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [tryInput, setTryInput] = useState("");
  const [kbLayout, setKbLayout] = useState<Layout>("jcuken");

  const finish = (startLessons: boolean) => {
    updateSettings({ onboarded: true }).catch(() => {
      /* worst case the tour shows again next launch */
    });
    onFinish(startLessons);
  };

  const typedOk = tryInput.trim().toLowerCase() === "да";
  const last = step === 2;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="text-center">
        {step === 0 && (
          <>
            <div className="mb-4 flex justify-center">
              <MascotPlaceholder />
            </div>
            <h1 className="font-display text-3xl font-extrabold text-sb-ink">
              Добро пожаловать!
            </h1>
            <p className="mt-1 text-sm text-sb-muted">Welcome to Slonbelka.</p>
            <p className="mt-5 text-[15px] leading-relaxed text-sb-ink">
              You'll learn the most useful Russian words first, in small daily lessons, with real
              native pronunciation. Words are grouped into levels; clear a level to unlock the
              next.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="font-display text-3xl font-extrabold text-sb-ink">Как это работает</h1>
            <p className="mt-1 text-sm text-sb-muted">How reviews work.</p>
            <div className="mt-5 space-y-3 text-left text-[15px] leading-relaxed text-sb-ink">
              <p>
                <span className="font-bold">1 · Lessons</span> introduce new words and quiz you
                right away.
              </p>
              <p>
                <span className="font-bold">2 · Reviews</span> come back at growing intervals:
                4 hours, then a day, a week, a month. Every word moves through five stages:
                Apprentice (still learning it), Guru (you know it), Master, Enlightened, and
                finally Burned. Each correct answer pushes the next review further away and the
                word one step up.
              </p>
              <p>
                <span className="font-bold">3 · Burned</span> words are done: reviewed enough
                times that they're yours for good and leave the review queue.
              </p>
              <p className="text-sm text-sb-muted">
                Miss a word and it simply comes back sooner. Short sessions every day beat long
                ones once a week.
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="font-display text-3xl font-extrabold text-sb-ink">Печатаем по-русски</h1>
            <p className="mt-1 text-sm text-sb-muted">Typing in Russian.</p>
            <p className="mt-4 text-[15px] leading-relaxed text-sb-ink">
              Some answers are typed in Cyrillic. Use the on-screen keyboard below, or your own
              keyboard: Latin keys map to Russian letters automatically.
            </p>
            <p className="mt-3 text-sm text-sb-muted">
              Try it now: type <span className="font-bold text-sb-ink">да</span> (yes).
            </p>
            <div className="mt-3">
              <ProductionInput
                value={tryInput}
                onChange={setTryInput}
                onSubmit={() => undefined}
                layout={kbLayout}
                onToggleLayout={() => setKbLayout(kbLayout === "jcuken" ? "phonetic" : "jcuken")}
              />
            </div>
            {typedOk && (
              <p className="mt-3 text-sm font-bold text-[#2E6B45]">Отлично! · You've got it.</p>
            )}
          </>
        )}
      </div>

      <div className="mt-8 flex justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-sb-accent" : "bg-sb-line"}`}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={() => (last ? finish(true) : setStep(step + 1))}
          className="w-full rounded-xl bg-sb-accent px-3 py-3 font-semibold text-white shadow-lg shadow-sb-accent/30"
        >
          {last ? (
            <>
              Начать первый урок
              <span className="block text-xs font-medium opacity-85">Start my first lesson</span>
            </>
          ) : (
            <>
              Далее
              <span className="block text-xs font-medium opacity-85">Next</span>
            </>
          )}
        </button>
        <button
          onClick={() => finish(false)}
          className="w-full py-2 text-sm text-sb-muted hover:text-sb-ink"
        >
          пропустить · skip the tour
        </button>
      </div>
    </div>
  );
}
