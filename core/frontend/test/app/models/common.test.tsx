/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { ConstrainedString } from "../../../app/models/common.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("ConstrainedString", () => {
  const spec = ConstrainedString("*.!", 4, 31);

  it("builds a regex accepting letters, digits, and the listed special characters", () => {
    expect(spec.regex.test("abcd")).toBe(true);
    expect(spec.regex.test("user.name!1")).toBe(true);
    expect(spec.regex.test("abc")).toBe(false);
    expect(spec.regex.test("has space")).toBe(false);
    expect(spec.regex.test("x".repeat(32))).toBe(false);
  });

  it("keeps helperText free of markup so it is safe in plain-text contexts", () => {
    expect(spec.helperText).not.toContain("<code>");
    expect(spec.helperText).toContain("4-31 characters");
    expect(spec.helperText).toContain("*.!");
  });

  it("renders the special characters inside a code element", async () => {
    const container = document.createElement("div");
    await act(async () => {
      createRoot(container).render(<spec.HelperText />);
    });

    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("*.!");
    expect(container.textContent).toContain("4-31 characters");
  });
});
