const FALLBACK_MESSAGE = "An unexpected error occurred.";

/**
 * Errors the user has already been shown. Layers that surface a failure mark it
 * here so an outer handler can report it without reporting it twice; identity is
 * tracked rather than a property written, so a rejection is never mutated.
 */
const surfacedErrors = new WeakSet<object>();

export function markErrorSurfaced(error: unknown): void {
  if (error != null && typeof error === "object") surfacedErrors.add(error);
}

export function isErrorSurfaced(error: unknown): boolean {
  return (
    error != null && typeof error === "object" && surfacedErrors.has(error)
  );
}

interface ValidationDetailEntry {
  msg?: unknown;
}

function normalizeDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail.trim() !== "" ? detail : null;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((entry) => {
        if (
          entry != null &&
          typeof entry === "object" &&
          typeof (entry as ValidationDetailEntry).msg === "string"
        ) {
          return (entry as ValidationDetailEntry).msg as string;
        }
        return normalizeError(entry);
      })
      .join("; ");
  }

  return null;
}

/**
 * Renders an error from the generated API client (or any thrown value) as a
 * human-readable message. Understands FastAPI `{"detail": ...}` bodies —
 * string details and `HTTPValidationError` detail arrays, instead of
 * flashing them as raw JSON.
 */
export function normalizeError(error: unknown): string {
  if (error == null) return FALLBACK_MESSAGE;
  if (typeof error === "string")
    return error.trim() !== "" ? error : FALLBACK_MESSAGE;
  if (error instanceof Error) return error.message;

  if (typeof error === "object") {
    const { detail } = error as { detail?: unknown };
    if (detail !== undefined) {
      return normalizeDetail(detail) ?? FALLBACK_MESSAGE;
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized != null && serialized !== "{}") return serialized;
    } catch {
      return FALLBACK_MESSAGE;
    }

    return FALLBACK_MESSAGE;
  }

  if (
    typeof error === "number" ||
    typeof error === "boolean" ||
    typeof error === "bigint"
  ) {
    return String(error);
  }

  if (typeof error === "symbol" || typeof error === "function") {
    return error.toString();
  }

  return FALLBACK_MESSAGE;
}
