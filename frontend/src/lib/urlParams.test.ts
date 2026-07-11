import { describe, expect, it } from "vitest";
import { parseAppParams } from "./urlParams";

describe("parseAppParams", () => {
  it("returns nothing for an empty or unrelated query", () => {
    expect(parseAppParams("")).toEqual({});
    expect(parseAppParams("?utm_source=x")).toEqual({});
  });

  it("parses billing results and rejects unknown values", () => {
    expect(parseAppParams("?billing=success").billing).toBe("success");
    expect(parseAppParams("?billing=cancel").billing).toBe("cancel");
    expect(parseAppParams("?billing=paid").billing).toBeUndefined();
  });

  it("parses verify and reset tokens", () => {
    expect(parseAppParams("?verify=abc123").verifyToken).toBe("abc123");
    expect(parseAppParams("?reset=tok-456").resetToken).toBe("tok-456");
  });

  it("ignores empty token values", () => {
    expect(parseAppParams("?verify=").verifyToken).toBeUndefined();
    expect(parseAppParams("?reset=").resetToken).toBeUndefined();
  });

  it("parses combined params", () => {
    const p = parseAppParams("?billing=success&verify=v1");
    expect(p.billing).toBe("success");
    expect(p.verifyToken).toBe("v1");
  });

  it("parses goto and rejects unknown views", () => {
    expect(parseAppParams("?goto=reviews").goto).toBe("reviews");
    expect(parseAppParams("?goto=lessons").goto).toBe("lessons");
    expect(parseAppParams("?goto=settings").goto).toBeUndefined();
  });
});
