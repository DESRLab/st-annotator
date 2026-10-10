import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { ProtectedNavBar } from "../../../app/layouts/protected";

describe("protected navigation", () => {
  it("renders dropdown contents before the application hydrates", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/projects"]}>
        <ProtectedNavBar
          user={{ id: 1, username: "admin", roles: ["admin"] }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Manage accounts");
    expect(markup).toContain("Signed in as");
  });

  it("shows Background Jobs only to data managers", () => {
    const renderForRoles = (roles: ("data-manager" | "project-manager")[]) =>
      renderToStaticMarkup(
        <MemoryRouter initialEntries={["/projects"]}>
          <ProtectedNavBar user={{ id: 1, username: "manager", roles }} />
        </MemoryRouter>,
      );

    const dataManagerMarkup = renderForRoles(["data-manager"]);
    expect(dataManagerMarkup).toContain('href="/jobs"');
    expect(dataManagerMarkup).toContain("Background Jobs");
    expect(renderForRoles(["project-manager"])).not.toContain(
      "Background Jobs",
    );
  });
});
