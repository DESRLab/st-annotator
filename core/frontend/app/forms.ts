import { z } from "zod";

const trimmedStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string(),
);

const finiteNumberStringSchema = trimmedStringSchema
  .refine(
    (value) => value !== "" && Number.isFinite(Number(value)),
    "Expected a finite number",
  )
  .transform(Number);

const emptyFormValueSchema = z
  .union([z.null(), z.undefined(), z.literal("")])
  .transform(() => null);

/** A text field submitted through FormData. File values are rejected. */
export const formStringSchema = z.string();

/** A trimmed text field submitted through FormData. File values are rejected. */
export const trimmedFormStringSchema = trimmedStringSchema;

/** A positive integer identifier submitted as text. */
export const identifierSchema = trimmedStringSchema
  .refine(
    (value) => /^[1-9]\d*$/.test(value),
    "Expected a positive integer identifier",
  )
  .transform(Number);

/** An empty value or a positive integer identifier submitted as text. */
export const nullableIdentifierSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.union([emptyFormValueSchema, identifierSchema]),
);

/** An empty value or a finite number submitted as text. */
export const nullableNumberSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.union([emptyFormValueSchema, finiteNumberStringSchema]),
);

/** An empty value or a valid date/time submitted as text, normalized to ISO 8601. */
export const nullableDateTimeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.union([
    emptyFormValueSchema,
    z
      .string()
      .refine(
        (value) => !Number.isNaN(new Date(value).getTime()),
        "Expected a valid date and time",
      )
      .transform((value) => new Date(value).toISOString()),
  ]),
);

/** Values emitted by SubmittedCheckbox, including its hidden unchecked value. */
export const submittedBooleanSchema = z
  .array(z.enum(["false", "true"]))
  .transform((values) => values.includes("true"));

/** Decode a JSON text field and validate the decoded value with `schema`. */
export function jsonFormValueSchema<T extends z.ZodTypeAny>(schema: T) {
  return z
    .string()
    .transform((value, context): unknown => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Expected valid JSON",
        });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

export const identifierArraySchema = jsonFormValueSchema(
  z.array(z.number().int().positive()),
);

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

export const jsonObjectSchema = jsonFormValueSchema(z.record(jsonValueSchema));

/** Read and trim a text FormData field, treating missing and File values as empty. */
export function trimFormValue(formData: FormData, name: string) {
  const result = trimmedFormStringSchema.safeParse(formData.get(name));
  return result.success ? result.data : "";
}

/** Return a concise, field-aware message for an invalid form submission. */
export function formatFormError(error: z.ZodError, label = "form data") {
  const issue = error.issues[0];
  const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return `Invalid ${label}: ${field}${issue?.message ?? "validation failed"}`;
}
