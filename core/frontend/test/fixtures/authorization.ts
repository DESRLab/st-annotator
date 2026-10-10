import type { Role, UserPublic } from "../../client";
import { getSession } from "../../app/sessions";

export const PRINCIPAL_ROLES = {
  noRoles: [],
  annotator: ["annotator"],
  supervisor: ["supervisor"],
  projectManager: ["project-manager"],
  dataManager: ["data-manager"],
  administrator: ["admin"],
  dualRole: ["project-manager", "data-manager"],
} as const satisfies Record<string, readonly Role[]>;

export type PrincipalProfile = keyof typeof PRINCIPAL_ROLES;

export function buildPrincipal(
  profile: PrincipalProfile,
  overrides: Partial<UserPublic> = {},
): UserPublic {
  return {
    id: 100,
    username: `authz_${profile}`,
    roles: [...PRINCIPAL_ROLES[profile]],
    ...overrides,
  };
}

export async function buildSession(profile?: PrincipalProfile) {
  const session = await getSession();
  if (profile !== undefined) {
    session.set("user", buildPrincipal(profile));
  }
  return session;
}
