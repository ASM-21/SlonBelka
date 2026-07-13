// Lightweight client error reporting. Forwards uncaught errors to the backend,
// which captures them in Sentry (the backend already has the SDK, so this
// avoids a second frontend dependency). Best-effort and heavily throttled so a
// render loop can never flood the endpoint.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface Context {
  kind?: string;
  componentStack?: string;
}

let sentInWindow = 0;
let windowStart = 0;
const recent = new Set<string>();

function allowed(signature: string): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    sentInWindow = 0;
    recent.clear();
  }
  if (recent.has(signature)) return false; // de-dupe identical errors
  if (sentInWindow >= 10) return false; // cap per minute
  recent.add(signature);
  sentInWindow += 1;
  return true;
}

export function reportError(error: unknown, context: Context = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const signature = `${context.kind ?? "error"}:${message}`;
  if (!allowed(signature)) return;

  const body = JSON.stringify({
    message: message.slice(0, 2000),
    stack: stack?.slice(0, 4000),
    kind: context.kind,
    component_stack: context.componentStack?.slice(0, 4000),
    url: typeof location !== "undefined" ? location.href : undefined,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  });

  // keepalive lets the report survive a page that is unloading after a crash.
  fetch(`${API_URL}/client-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* reporting is best-effort */
  });
}

export function initErrorReporting(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    reportError(e.error ?? e.message, { kind: "window" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, { kind: "unhandledrejection" });
  });
}
