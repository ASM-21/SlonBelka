// The SPA has no path routing, so anything arriving from outside lands on
// the root URL with query params: Stripe checkout returns (?billing=success
// or ?billing=cancel) and email links (?verify=<token>, ?reset=<token>).
// App.tsx parses them once on mount and then cleans the URL.

export interface AppParams {
  billing?: "success" | "cancel";
  verifyToken?: string;
  resetToken?: string;
}

export function parseAppParams(search: string): AppParams {
  const params = new URLSearchParams(search);
  const out: AppParams = {};
  const billing = params.get("billing");
  if (billing === "success" || billing === "cancel") out.billing = billing;
  const verify = params.get("verify");
  if (verify) out.verifyToken = verify;
  const reset = params.get("reset");
  if (reset) out.resetToken = reset;
  return out;
}
