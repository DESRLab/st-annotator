import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  formatFormError,
  identifierArraySchema,
  identifierSchema,
  jsonFormValueSchema,
  jsonObjectSchema,
  nullableDateTimeSchema,
  nullableNumberSchema,
  submittedBooleanSchema,
} from "../../app/forms";

describe("form schemas", () => {
  it("validates identifiers and identifier arrays without coercing values", () => {
    expect(identifierSchema.parse("42")).toBe(42);
    expect(identifierArraySchema.parse("[1, 2]")).toEqual([1, 2]);
    expect(identifierSchema.safeParse("2x").success).toBe(false);
    expect(identifierArraySchema.safeParse('[1, "2"]').success).toBe(false);
    expect(identifierArraySchema.safeParse("not json").success).toBe(false);
  });

  it("accepts only JSON objects for object fields", () => {
    expect(jsonObjectSchema.parse('{"theme":"dark"}')).toEqual({
      theme: "dark",
    });
    expect(jsonObjectSchema.safeParse("[]").success).toBe(false);
    expect(jsonObjectSchema.safeParse("null").success).toBe(false);
  });

  it("validates submitted booleans including hidden checkbox values", () => {
    expect(submittedBooleanSchema.parse(["false"])).toBe(false);
    expect(submittedBooleanSchema.parse(["false", "true"])).toBe(true);
    expect(submittedBooleanSchema.safeParse(["yes"]).success).toBe(false);
  });

  it("parses optional numbers and dates without accepting malformed values", () => {
    expect(nullableNumberSchema.parse("")).toBeNull();
    expect(nullableNumberSchema.parse(" 1.5 ")).toBe(1.5);
    expect(nullableNumberSchema.safeParse("1.5px").success).toBe(false);
    expect(nullableDateTimeSchema.parse("")).toBeNull();
    expect(nullableDateTimeSchema.parse("2026-08-21T12:30")).toBe(
      "2026-08-21T12:30:00.000Z",
    );
    expect(nullableDateTimeSchema.safeParse("not a date").success).toBe(false);
  });

  it("validates decoded JSON with the supplied schema and formats errors", () => {
    const result = jsonFormValueSchema(
      z.object({ enabled: z.boolean() }),
    ).safeParse('{"enabled":"yes"}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatFormError(result.error, "preferences")).toContain(
        "Invalid preferences: enabled:",
      );
    }
  });
});
