import { useEffect, useState } from "react";
import { BillingStatus, billingPortal, checkout, getBillingStatus } from "../lib/api";
import { PageHeader } from "./ui";

// Display prices only; Stripe charges what the configured price IDs say.
// PLACEHOLDER values: update to the real Stripe amounts before launch.
const PLANS = [
  { id: "monthly", name: "Monthly", blurb: "Billed every month", price: "$5", cadence: "/ month" },
  { id: "yearly", name: "Yearly", blurb: "Best value, billed annually", price: "$48", cadence: "/ year" },
  { id: "lifetime", name: "Lifetime", blurb: "One payment, forever", price: "$120", cadence: "once" },
];

export default function UpgradePage({
  onDone,
  result,
}: {
  onDone: () => void;
  // Set when the user just returned from Stripe Checkout (?billing=...).
  result?: "success" | "cancel";
}) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getBillingStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  // After a successful checkout the webhook can lag behind the redirect, so
  // poll briefly until the entitlement shows up.
  useEffect(() => {
    if (result !== "success") return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      getBillingStatus()
        .then((s) => {
          setStatus(s);
          if (s.is_premium || tries >= 5) clearInterval(id);
        })
        .catch(() => {
          if (tries >= 5) clearInterval(id);
        });
    }, 2000);
    return () => clearInterval(id);
  }, [result]);

  const startCheckout = async (plan: string) => {
    setBusy(true);
    setNote(null);
    try {
      const { url } = await checkout(plan);
      window.location.href = url; // off to Stripe Checkout
    } catch (e) {
      // 503 when Stripe keys aren't configured yet.
      setNote("Checkout isn't available yet. Billing needs to be configured.");
      setBusy(false);
    }
  };

  const manage = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { url } = await billingPortal();
      window.location.href = url;
    } catch {
      setNote("The billing portal isn't available yet.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <PageHeader ru="Слонбелка Премиум" en="Slonbelka Premium" onBack={onDone} />

      {result === "success" && (
        <p className="mb-4 rounded-xl border border-sb-line bg-sb-card px-4 py-2.5 text-center text-sm text-sb-ink">
          Оплата прошла, спасибо!{" "}
          <span className="text-sb-muted">
            {status?.is_premium ? "Premium is active." : "Payment received, activating Premium…"}
          </span>
        </p>
      )}
      {result === "cancel" && (
        <p className="mb-4 rounded-xl border border-sb-line bg-sb-card px-4 py-2.5 text-center text-sm text-sb-muted">
          Checkout was canceled. Nothing was charged.
        </p>
      )}

      {status?.is_premium ? (
        <div className="rounded-3xl border border-sb-line bg-sb-card p-6 text-center">
          <div className="text-lg font-bold text-sb-ink">You're on Premium</div>
          <div className="mt-1 text-sm text-sb-muted">
            {status.plan ? `${status.plan} plan` : "active"}
            {status.cancel_at_period_end ? " · cancels at period end" : ""}
          </div>
          <button
            onClick={manage}
            disabled={busy}
            className="mt-4 rounded-lg bg-sb-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Manage subscription
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-sb-muted">
            Free covers levels 1–{status?.free_level_limit ?? 3}. Premium unlocks every level and
            all future content.
          </p>
          <div className="mt-5 space-y-2.5">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => startCheckout(p.id)}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-2xl border border-sb-line bg-sb-card px-4 py-4 text-left hover:border-sb-accent disabled:opacity-40"
              >
                <div>
                  <div className="font-semibold text-sb-ink">{p.name}</div>
                  <div className="text-sm text-sb-muted">{p.blurb}</div>
                </div>
                <span className="text-right">
                  <span className="font-display text-lg font-extrabold text-sb-ink">{p.price}</span>{" "}
                  <span className="text-sm text-sb-muted">{p.cadence}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-sb-muted">
            Monthly and yearly plans renew automatically at the then-current price until you
            cancel. Cancel anytime from Manage subscription on this screen; you keep access
            through the end of the paid period. Lifetime is a single payment and never renews.
          </p>
        </>
      )}

      {note && <p className="mt-4 rounded-xl bg-sb-gold-soft px-3 py-2 text-sm text-[#7A5F1E]">{note}</p>}

      {status && (
        <p className="mt-6 text-center text-xs text-sb-muted">
          Currently at level {status.current_level} · access through level {status.accessible_level}
        </p>
      )}
    </div>
  );
}
