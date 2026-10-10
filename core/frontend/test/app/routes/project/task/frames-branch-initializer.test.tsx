/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { LabelBranchInitializer } from "../../../../../app/routes/project/task/frames";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

describe("label branch initializer", () => {
  it("offers every repository for a new task with no existing branches", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <LabelBranchInitializer
            account={{ id: 5, username: "maral" } as never}
            currentUser={
              {
                id: 1,
                username: "manager",
                roles: ["project-manager", "data-manager"],
              } as never
            }
            workType="annotate"
            labelGroups={
              [
                { id: 31, name: "Existing labels" },
                { id: 32, name: "New labels" },
              ] as never
            }
            labelBranches={[]}
          />
        ),
      },
    ]);

    await act(async () => root.render(<RouterProvider router={router} />));

    const repository = container.querySelector<HTMLSelectElement>(
      'select[name="group_id"]',
    );
    expect(repository).not.toBeNull();
    expect([...repository!.options].map((option) => option.text)).toEqual([
      "Existing labels",
      "New labels",
    ]);
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Initialize",
      ),
    ).toBe(true);

    await act(async () => root.unmount());
  });
});
