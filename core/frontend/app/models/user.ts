import type { Role } from "../../client";

import { ConstrainedString } from "./common";

export const Username = ConstrainedString(
  "*.!@$%^&(){}[]:;<>,.?/~_+-=|\\",
  4,
  31,
);
export const Password = ConstrainedString(
  "*.!@$%^&(){}[]:;<>,.?/~_+-=|\\",
  4,
  31,
);

export const ALL_ROLES = [
  "admin",
  "data-manager",
  "project-manager",
  "supervisor",
  "annotator",
] as const satisfies readonly Role[];

/**
 * Proves the converse of `satisfies`: every role the backend defines is listed here.
 *
 * A role missing from this list is not just an absent checkbox. Role writes replace a
 * user's whole set, and the forms seed that set from the stored row, so the first save
 * of any account would silently strip the unlisted role and report success. Once the
 * generated `Role` union outgrows the list this declaration stops being `true`, and
 * the typecheck fails on it with "Type 'true' is not assignable to type 'never'".
 */
export const ALL_ROLES_ARE_EXHAUSTIVE: [
  Exclude<Role, (typeof ALL_ROLES)[number]>,
] extends [never]
  ? true
  : never = true;
