/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectPaneView } from "../../../../../../app/routes/editor/app/widgets/ProjectPane.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function getTweakpaneTab(container, title) {
  return [...container.querySelectorAll(".tp-tbiv")].find(
    (tab) => tab.querySelector(".tp-tbiv_t")?.textContent === title,
  );
}

function isTweakpaneContentVisible(element) {
  return element.closest(".tp-v-hidden") == null;
}

function paneParams(
  overrides: Partial<{
    settings: Partial<{ disabled: boolean; hidden: boolean }>;
  }> = {},
) {
  return {
    settings: {
      disabled: false,
      hidden: false,
      ...overrides.settings,
    },
  };
}

async function renderView(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ProjectPaneView {...props} />);
  });

  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ProjectPaneView", () => {
  it("hosts direct React children in stable Task, Scene, and Frame tabs", async () => {
    const view = await renderView({
      paneParams: paneParams(),
      tabChildren: {
        Task: (
          <span data-test="project-task-react-child">React task content</span>
        ),
        Scene: (
          <span data-test="project-scene-react-child">React scene content</span>
        ),
        Frame: (
          <span data-test="project-frame-react-child">React frame content</span>
        ),
      },
    });

    expect(view.container.querySelector(".tp-tabv")).not.toBeNull();
    const taskChild = view.container.querySelector<HTMLElement>(
      '[data-test="project-task-react-child"]',
    );
    const sceneChild = view.container.querySelector<HTMLElement>(
      '[data-test="project-scene-react-child"]',
    );
    const frameChild = view.container.querySelector<HTMLElement>(
      '[data-test="project-frame-react-child"]',
    );
    expect(taskChild?.textContent).toBe("React task content");
    expect(frameChild?.textContent).toBe("React frame content");
    expect(taskChild?.closest(".tp-htmlcontainerv_t")).not.toBeNull();
    expect(sceneChild?.closest(".tp-htmlcontainerv_t")).not.toBeNull();
    expect(frameChild?.closest(".tp-htmlcontainerv_t")).not.toBeNull();
    expect(isTweakpaneContentVisible(taskChild!)).toBe(true);
    expect(isTweakpaneContentVisible(sceneChild!)).toBe(false);

    await act(async () => {
      getTweakpaneTab(view.container, "Scene").querySelector("button").click();
    });

    expect(isTweakpaneContentVisible(taskChild!)).toBe(false);
    expect(isTweakpaneContentVisible(sceneChild!)).toBe(true);

    await view.unmount();
  });

  it("disables tab buttons through settings", async () => {
    const view = await renderView({
      paneParams: paneParams({ settings: { disabled: true } }),
    });

    expect(
      [
        ...view.container.querySelectorAll<HTMLButtonElement>(".tp-tbiv_b"),
      ].every((button) => button.disabled),
    ).toBe(true);

    await view.unmount();
  });
});
