/** Read a submitted text field without coercing file uploads. */
export function trimFormValue(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Validate ids at the form boundary before issuing a bulk write. */
export function parseBatchIds(value: string): number[] | null {
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids) &&
      ids.length > 1 &&
      ids.every((id) => Number.isSafeInteger(id) && id > 0)
      ? (ids as number[])
      : null;
  } catch {
    return null;
  }
}
