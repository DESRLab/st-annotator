import { describe, expect, it } from "vitest";

import { normalizeError } from "../../app/errors";

describe("normalizeError", () => {
  it("returns string errors unchanged", () => {
    expect(normalizeError("Something failed")).toBe("Something failed");
  });

  it("returns the message of Error instances", () => {
    expect(normalizeError(new Error("Network down"))).toBe("Network down");
  });

  it("extracts FastAPI string details", () => {
    expect(normalizeError({ detail: "Incorrect username or password" })).toBe(
      "Incorrect username or password",
    );
  });

  it("joins FastAPI validation detail messages", () => {
    const error = {
      detail: [
        {
          loc: ["body", "username"],
          msg: "Field required",
          type: "missing",
        },
        {
          loc: ["body", "password"],
          msg: "Field required",
          type: "missing",
        },
      ],
    };

    expect(normalizeError(error)).toBe("Field required; Field required");
  });

  it("falls back for empty details", () => {
    expect(normalizeError({ detail: "" })).toBe(
      "An unexpected error occurred.",
    );
    expect(normalizeError({ detail: [] })).toBe(
      "An unexpected error occurred.",
    );
  });

  it("stringifies objects without a detail field", () => {
    expect(normalizeError({ code: "boom" })).toBe('{"code":"boom"}');
  });

  it("falls back for values with no renderable content", () => {
    expect(normalizeError(null)).toBe("An unexpected error occurred.");
    expect(normalizeError(undefined)).toBe("An unexpected error occurred.");
    expect(normalizeError("")).toBe("An unexpected error occurred.");
    expect(normalizeError({})).toBe("An unexpected error occurred.");
  });

  it("serializes non-object, non-string values", () => {
    expect(normalizeError(42)).toBe("42");
  });
});
