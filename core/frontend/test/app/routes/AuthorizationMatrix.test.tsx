import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Role } from "../../../client";
import {
  LabelContainer,
  loader as labelLoader,
} from "../../../app/layouts/label";
import { ProjectContainer } from "../../../app/layouts/project";
import { ProtectedNavBar } from "../../../app/layouts/protected";
import {
  SourceContainer,
  loader as sourceLoader,
} from "../../../app/layouts/source";
import { TaskContainer } from "../../../app/layouts/task";
import { loadAuthorizedSession } from "../../../app/loaders";
import { commitSession, getSession } from "../../../app/sessions";
import {
  PRINCIPAL_ROLES,
  buildPrincipal,
  type PrincipalProfile,
} from "../../fixtures/authorization";

const sdk = vi.hoisted(() => ({ whoami: vi.fn() }));

vi.mock("../../../client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../client/sdk.gen")>()),
  whoamiAuthWhoamiGet: sdk.whoami,
}));

const PROFILES = Object.keys(PRINCIPAL_ROLES) as PrincipalProfile[];

async function authenticatedRequest(profile: PrincipalProfile, path = "/") {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  session.set("user", buildPrincipal(profile));
  return new Request(`http://localhost${path}`, {
    headers: { Cookie: await commitSession(session) },
  });
}

function markup(element: React.ReactNode) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/projects"]}>{element}</MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("application-role authorization oracle", () => {
  const cases: [Role, PrincipalProfile[]][] = [
    ["admin", ["administrator"]],
    ["data-manager", ["dataManager", "dualRole"]],
    ["project-manager", ["projectManager", "dualRole"]],
    ["annotator", ["annotator"]],
    ["supervisor", ["supervisor"]],
  ];

  for (const [requiredRole, permittedProfiles] of cases) {
    describe(`${requiredRole} boundary`, () => {
      it("redirects an anonymous request to login", async () => {
        const result = await loadAuthorizedSession(
          new Request("http://localhost/protected"),
          requiredRole,
        );

        expect(result).toBeInstanceOf(Response);
        expect((result as Response).status).toBe(302);
        expect((result as Response).headers.get("Location")).toBe("/login");
      });

      for (const profile of PROFILES) {
        const permitted = permittedProfiles.includes(profile);
        it(`${permitted ? "permits" : "refuses"} ${profile}`, async () => {
          const result = await loadAuthorizedSession(
            await authenticatedRequest(profile),
            requiredRole,
          );

          if (permitted) {
            expect(result).not.toBeInstanceOf(Response);
            if (!(result instanceof Response)) {
              expect(result.user.roles).toEqual([...PRINCIPAL_ROLES[profile]]);
            }
          } else {
            expect(result).toBeInstanceOf(Response);
            expect((result as Response).status).toBe(302);
            expect((result as Response).headers.get("Location")).toBe("/");
          }
        });
      }
    });
  }
});

describe("source and label direct-route guards", () => {
  for (const [profile, permitted] of [
    ["noRoles", false],
    ["annotator", false],
    ["supervisor", false],
    ["projectManager", true],
    ["dataManager", true],
    ["administrator", false],
    ["dualRole", true],
  ] as const) {
    it(`${permitted ? "loads" : "refuses"} both data sections for ${profile}`, async () => {
      const user = buildPrincipal(profile);
      sdk.whoami.mockResolvedValue({ data: user });

      for (const loader of [sourceLoader, labelLoader]) {
        const result = await loader({
          request: await authenticatedRequest(profile, "/source"),
        } as never);
        if (permitted) {
          expect(result).not.toBeInstanceOf(Response);
          expect((result as { data: { user: unknown } }).data.user).toEqual(
            user,
          );
        } else {
          expect(result).toBeInstanceOf(Response);
          expect((result as Response).headers.get("Location")).toBe("/");
        }
      }
    });
  }
});

describe("rendered navigation capability matrix", () => {
  it.each([
    ["noRoles", false, false, false],
    ["annotator", false, false, false],
    ["supervisor", false, false, false],
    ["projectManager", true, false, false],
    ["dataManager", true, true, false],
    ["administrator", false, false, true],
    ["dualRole", true, true, false],
  ] as const)(
    "%s exposes only its global capabilities",
    (profile, dataRead, jobs, accounts) => {
      const html = markup(<ProtectedNavBar user={buildPrincipal(profile)} />);
      expect(html.includes('href="/source"')).toBe(dataRead);
      expect(html.includes('href="/label"')).toBe(dataRead);
      expect(html.includes('href="/jobs"')).toBe(jobs);
      expect(html.includes('href="/admin/accounts"')).toBe(accounts);
      expect(html).toContain('href="/projects"');
      expect(html).toContain('href="/profile"');
    },
  );

  it("keeps project managers' data views while hiding data-manager commands", () => {
    const user = buildPrincipal("projectManager");
    const source = markup(
      <SourceContainer user={user}>content</SourceContainer>,
    );
    const label = markup(<LabelContainer user={user}>content</LabelContainer>);

    expect(source).toContain('href="/source/groups"');
    expect(source).toContain('href="/source/data"');
    expect(source).toContain('href="/source/specs"');
    expect(source).not.toContain('href="/source/files"');
    expect(label).toContain('href="/label/groups"');
    expect(label).toContain('href="/label/repos"');
    expect(label).toContain('href="/label/data"');
  });

  it("gives a mixed annotate/review principal exactly the union of work links", () => {
    const user = buildPrincipal("noRoles", {
      roles: ["annotator", "supervisor"],
    });
    const project = markup(
      <ProjectContainer user={user} projectId="3">
        content
      </ProjectContainer>,
    );
    const task = markup(
      <TaskContainer user={user} projectId="3" taskId="8">
        content
      </TaskContainer>,
    );

    for (const html of [project, task]) {
      expect(html).toContain("Annotate");
      expect(html).toContain("Review");
      expect(html).not.toContain("Background Jobs");
      expect(html).not.toContain("Manage accounts");
    }
  });
});
