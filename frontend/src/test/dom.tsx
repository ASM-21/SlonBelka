// Minimal DOM test harness built on react-dom/client and React's act(), so
// component tests need no dependencies beyond what the app already ships.
// The API is a small subset of Testing Library: render/cleanup, text and
// button/field queries scoped to the mounted container, and event helpers
// that wrap dispatch in act() and flush pending microtasks.

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

let container: HTMLElement | null = null;
let root: Root | null = null;

export async function render(ui: ReactElement): Promise<void> {
  cleanup();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(ui);
  });
  await flush();
}

export function cleanup(): void {
  if (root) {
    const r = root;
    act(() => {
      r.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
}

/** Let queued promise chains resolve and the resulting renders flush. */
export async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** Wait real time (for debounce timers), then flush. */
export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
  await flush();
}

function scope(): HTMLElement {
  return container ?? document.body;
}

function matches(match: string | RegExp, text: string | null | undefined): boolean {
  if (text == null) return false;
  return typeof match === "string" ? text.includes(match) : match.test(text);
}

/** Innermost rendered element whose text matches; throws with the page text. */
export function getByText(match: string | RegExp): HTMLElement {
  const el = queryByText(match);
  if (!el) {
    throw new Error(`No element matching ${String(match)}. Page text: ${scope().textContent}`);
  }
  return el;
}

export function queryByText(match: string | RegExp): HTMLElement | null {
  const hits = Array.from(scope().querySelectorAll<HTMLElement>("*")).filter((el) =>
    matches(match, el.textContent),
  );
  const innermost = hits.filter((el) => !hits.some((other) => other !== el && el.contains(other)));
  return innermost[0] ?? null;
}

/** Button whose visible text or aria-label matches. */
export function getButton(match: string | RegExp): HTMLButtonElement {
  const buttons = Array.from(scope().querySelectorAll<HTMLButtonElement>("button"));
  const hit = buttons.find(
    (b) => matches(match, b.textContent) || matches(match, b.getAttribute("aria-label")),
  );
  if (!hit) {
    const labels = buttons.map((b) => b.textContent || b.getAttribute("aria-label")).join(" | ");
    throw new Error(`No button matching ${String(match)}. Buttons: ${labels}`);
  }
  return hit;
}

export function queryButton(match: string | RegExp): HTMLButtonElement | null {
  try {
    return getButton(match);
  } catch {
    return null;
  }
}

/** Input, select, or textarea found by aria-label or placeholder. */
export function getField(match: string | RegExp): HTMLInputElement {
  const fields = Array.from(
    scope().querySelectorAll<HTMLInputElement>("input, select, textarea"),
  );
  const hit = fields.find(
    (f) =>
      matches(match, f.getAttribute("aria-label")) || matches(match, f.getAttribute("placeholder")),
  );
  if (!hit) {
    const labels = fields
      .map((f) => f.getAttribute("aria-label") || f.getAttribute("placeholder"))
      .join(" | ");
    throw new Error(`No field matching ${String(match)}. Fields: ${labels}`);
  }
  return hit;
}

export async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

/** Set a controlled field's value the way a user would, firing React onChange. */
export async function typeInto(el: HTMLElement, value: string): Promise<void> {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
}

export async function keyDown(el: Element, key: string): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await flush();
}
