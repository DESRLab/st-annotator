/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  createLabelClassSelectionPaneElementFactory,
  getLabelClassSelectionOutputData,
  labelClassSelectionPaneDataProcessor,
} from "../../../../../app/routes/editor/plugin-widgets/LabelClassSelectionPane.ts";
import { TweakpanePaneHost } from "../../../../../app/routes/editor/widgets/TweakpanePaneHost.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const classes = new Map([
  [1, { id: 1, name: "Car" }],
  [2, { id: 2, name: "Pedestrian" }],
]);

const definition = {
  dataProcessor: labelClassSelectionPaneDataProcessor,
  factory: createLabelClassSelectionPaneElementFactory(),
};

afterEach(() => document.body.replaceChildren());

describe("label class selection pane", () => {
  it("sanitizes selected IDs that are no longer present", () => {
    expect(
      getLabelClassSelectionOutputData({
        inputtedData: { classId: 99 },
        computedData: { classes },
        settings: { disabled: false, hidden: false },
      }),
    ).toEqual({ classId: null });
  });

  it("renders and emits numeric selections through the native production host", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const changes: unknown[] = [];

    await act(async () =>
      root.render(
        <TweakpanePaneHost
          definition={definition}
          onInputChange={(change) => changes.push(change)}
          paneParams={{
            inputtedData: { classId: 1 },
            internalData: { classes },
            settings: { disabled: false, hidden: false },
          }}
        />,
      ),
    );

    const select = container.querySelector("select")!;
    expect(select.value).toBe("Car");
    expect(container.textContent).toContain("Object Class");
    expect(container.textContent).toContain("Pedestrian");

    await act(async () => {
      select.value = "Pedestrian";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(changes).toEqual([{ classId: 2 }]);

    await act(async () => root.unmount());
  });

  it("reconciles disabled and hidden settings through the native production host", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const paneParams = {
      inputtedData: { classId: null },
      internalData: { classes },
      settings: { disabled: true, hidden: false },
    };

    await act(async () =>
      root.render(
        <TweakpanePaneHost
          definition={definition}
          onInputChange={() => {}}
          paneParams={paneParams}
        />,
      ),
    );
    expect(container.querySelector("select")?.disabled).toBe(true);

    await act(async () =>
      root.render(
        <TweakpanePaneHost
          definition={definition}
          onInputChange={() => {}}
          paneParams={{
            ...paneParams,
            settings: { disabled: false, hidden: true },
          }}
        />,
      ),
    );
    expect(container.querySelector(".tp-v-hidden")).not.toBeNull();

    await act(async () => root.unmount());
  });
});
