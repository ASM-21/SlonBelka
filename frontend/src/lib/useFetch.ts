import { useCallback, useEffect, useRef, useState } from "react";

export type FetchStatus = "loading" | "error" | "ready";

export interface Fetch<T> {
  status: FetchStatus;
  data: T | null;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  retry: () => void;
}

/**
 * Fetch-on-mount with explicit loading and error states plus a retry, so a
 * failed request surfaces an error instead of loading forever. Refetches when
 * `deps` change; `setData` lets a page apply local updates after actions.
 */
export function useFetch<T>(fn: () => Promise<T>, deps: readonly unknown[] = []): Fetch<T> {
  const [status, setStatus] = useState<FetchStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setStatus("loading");
    setData(null);
    fnRef.current().then(
      (d) => {
        if (live) {
          setData(d);
          setStatus("ready");
        }
      },
      () => {
        if (live) setStatus("error");
      },
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { status, data, setData, retry };
}
