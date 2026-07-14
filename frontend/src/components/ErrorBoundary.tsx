import { Component, ErrorInfo, ReactNode } from "react";
import { reportError } from "../lib/errorReporting";

/**
 * Catches render/runtime errors anywhere in the tree and shows a recoverable
 * fallback instead of a blank screen. Errors are forwarded to the backend
 * error reporter. There is no path routing, so recovery is a full reload.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { kind: "react", componentStack: info.componentStack ?? undefined });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto mt-24 max-w-md px-6 text-center">
        <div className="font-display text-3xl font-extrabold text-sb-ink">Что-то сломалось</div>
        <p className="mt-1 text-sm text-sb-muted">Something went wrong on this screen.</p>
        <p className="mt-4 text-[15px] text-sb-ink">
          Your progress is saved. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 w-full rounded-xl bg-sb-accent py-3 font-bold text-white"
        >
          Перезагрузить · Reload
        </button>
      </div>
    );
  }
}
