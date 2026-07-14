import { useOnline } from "../lib/useOnline";

/**
 * A thin fixed bar shown while the browser is offline. Reviews and lessons
 * keep working (answers queue in IndexedDB); this just reassures the user
 * their work is not lost.
 */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-sb-ink px-4 py-1.5 text-center text-xs font-semibold text-white"
    >
      Нет соединения · Offline. Your answers are saved and will sync when you reconnect.
    </div>
  );
}
