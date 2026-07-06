import { useEffect, useState } from "react";
import { BillingStatus, billingPortal, checkout, getBillingStatus } from "../lib/api";

// Display prices only; Stripe charges what the configured price IDs say.
// PLACEHOLDER values: update to the real Stripe amounts before launch.
const PLANS = [
  { id: "monthly", name: "Monthly", blurb: "Billed every month", price: "$5", cadence: "/ month" },
  { id: "yearly", name: "Yearly", blurb: "Best value, billed annually", price: "$48", cadence: "/ year" },
  { id: "lifetime", name: "Lifetime", blurb: "One payment, forever", price: "$120", cadence: "once" },
];

export default function UpgradePage({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getBillingStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

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
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Slonbelka Premium</h2>
        <button onClick={onDone} className="text-sm text-neutral-400 hover:text-neutral-700">
          done
        </button>
      </div>

      {status?.is_premium ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="text-lg font-medium text-emerald-800">You're on Premium</div>
          <div className="mt-1 text-sm text-emerald-700">
            {status.plan ? `${status.plan} plan` : "active"}
            {status.cancel_at_period_end ? " · cancels at period end" : ""}
          </div>
          <button
            onClick={manage}
            disabled={busy}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Manage subscription
          </button>
        </div>
      ) : (
        <>
          <p className="text-neutral-600">
            Free covers levels 1–{status?.free_level_limit ?? 3}. Premium unlocks every level and all future content.
          </p>
          <div className="mt-5 space-y-3">
            {PLANS.map((p) => (
              <button
                key={p.id}
                onClick={() => startCheckout(p.id)}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-4 py-4 text-left hover:border-neutral-900 disabled:opacity-40"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-neutral-500">{p.blurb}</div>
                </div>
                <span className="text-right">
                  <span className="font-semibold">{p.price}</span>{" "}
                  <span className="text-sm text-neutral-500">{p.cadence}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-neutral-500">
            Monthly and yearly plans renew automatically at the then-current price until you
            cancel. Cancel anytime from Manage subscription on this screen; you keep access
            through the end of the paid period. Lifetime is a single payment and never renews.
          </p>
        </>
      )}

      {note && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</p>}

      {status && (
        <p className="mt-6 text-center text-xs text-neutral-400">
          Currently at level {status.current_level} · access through level {status.accessible_level}
        </p>
      )}
    </div>
  );
}
