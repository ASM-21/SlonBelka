import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { Fetch, useFetch } from "./useFetch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal hook harness (no testing-library dependency).
function renderHook<T>(use: () => T): { result: { current: T }; unmount: () => void } {
  const result = { current: undefined as unknown as T };
  function Probe() {
    result.current = use();
    return null;
  }
  const root: Root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { result, unmount: () => act(() => root.unmount()) };
}

const flush = () => act(async () => {});

describe("useFetch", () => {
  it("resolves to ready with data", async () => {
    const { result } = renderHook<Fetch<string>>(() => useFetch(() => Promise.resolve("hi")));
    expect(result.current.status).toBe("loading");
    await flush();
    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe("hi");
  });

  it("reports error instead of loading forever", async () => {
    const { result } = renderHook<Fetch<string>>(() => useFetch(() => Promise.reject(new Error("net"))));
    await flush();
    expect(result.current.status).toBe("error");
    expect(result.current.data).toBeNull();
  });

  it("retry refetches after an error", async () => {
    let calls = 0;
    const fn = () => (++calls === 1 ? Promise.reject(new Error("net")) : Promise.resolve(42));
    const { result } = renderHook<Fetch<number>>(() => useFetch(fn));
    await flush();
    expect(result.current.status).toBe("error");
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await flush();
    expect(result.current.status).toBe("ready");
    expect(result.current.data).toBe(42);
    expect(calls).toBe(2);
  });

  it("ignores results after unmount", async () => {
    let resolve: (v: string) => void = () => {};
    const { result, unmount } = renderHook<Fetch<string>>(() =>
      useFetch(() => new Promise<string>((r) => (resolve = r))),
    );
    unmount();
    resolve("late");
    await flush();
    // No crash and no state change; the hook result stays as last rendered.
    expect(result.current.status).toBe("loading");
  });

  it("setData applies local updates", async () => {
    const { result } = renderHook<Fetch<number[]>>(() => useFetch(() => Promise.resolve([1, 2, 3])));
    await flush();
    act(() => result.current.setData((cur) => (cur ? cur.filter((n) => n !== 2) : cur)));
    expect(result.current.data).toEqual([1, 3]);
  });
});
