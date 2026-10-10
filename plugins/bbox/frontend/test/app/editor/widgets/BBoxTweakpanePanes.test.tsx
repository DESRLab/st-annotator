/* @vitest-environment jsdom */

import { act, default as React, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  bboxSettingsPaneFactoryParams,
  BBoxSettingsPaneView,
} from "../../../../app/editor/scene/widgets/BBoxSettingsPane.react.tsx";
import {
  drawModePaneFactoryParams as bboxDrawModePaneFactoryParams,
  DrawModePaneView as BBoxDrawModePaneView,
} from "../../../../app/editor/scene/widgets/DrawModePane.react.tsx";
import type { DrawMode } from "../../../../app/editor/scene/widgets/DrawModePane.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => null,
});

const panes = [
  [
    "bbox draw mode",
    { FACTORY_PARAMS: bboxDrawModePaneFactoryParams },
    BBoxDrawModePaneView,
  ],
  [
    "bbox settings",
    { FACTORY_PARAMS: bboxSettingsPaneFactoryParams },
    BBoxSettingsPaneView,
  ],
];

function clone(value: any): any {
  if (value == null || typeof value !== "object") return value;
  if (typeof value.clone === "function") return value.clone();
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, clone(entry)]),
  );
}

interface PaneLikeProps {
  onInputChange: (value: any) => void;
  paneParams: { inputtedData: any; settings: any };
}

async function render(
  View: (props: PaneLikeProps) => React.JSX.Element,
  Controller: { FACTORY_PARAMS: { inputtedData: any; settings: any } },
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const changes: any[] = [];

  await act(async () => {
    root.render(
      <View
        onInputChange={(value) => changes.push(value)}
        paneParams={{
          inputtedData: clone(Controller.FACTORY_PARAMS.inputtedData),
          settings: clone(Controller.FACTORY_PARAMS.settings),
        }}
      />,
    );
  });

  return {
    changes,
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function ControlledBBoxDrawModePane({
  changes,
}: {
  changes: { drawMode: string }[];
}): React.JSX.Element {
  const [paneParams, setPaneParams] = useState<{
    inputtedData: { drawMode: DrawMode };
    settings: { disabled: boolean; hidden: boolean };
  }>({
    inputtedData: { drawMode: "corner2corner" },
    settings: { disabled: false, hidden: false },
  });

  return (
    <BBoxDrawModePaneView
      onInputChange={(inputtedData) => {
        changes.push(inputtedData);
        setPaneParams((current) => ({ ...current, inputtedData }));
      }}
      paneParams={paneParams}
    />
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("TweakpanePaneHost", () => {
  it.each(panes as any[])(
    "hosts %s through React while retaining native Tweakpane DOM",
    async (_, Controller, View) => {
      const view = await render(View, Controller);

      expect(view.container.querySelector(".tp-rotv")).not.toBeNull();
      expect(
        view.container.querySelector(".tp-lblv, .tp-selectgridv"),
      ).not.toBeNull();

      await view.unmount();
      expect(view.container.innerHTML).toBe("");
    },
  );

  it("forwards native input changes through the React host", async () => {
    const view = await render(BBoxDrawModePaneView, {
      FACTORY_PARAMS: bboxDrawModePaneFactoryParams,
    });
    const radios = view.container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );

    await act(async () => {
      radios[1].click();
    });

    expect(view.changes).toEqual([{ drawMode: "center2front" }]);
    await view.unmount();
  });
  it("synchronizes native descriptor state from React props", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const paneParams = {
      inputtedData: { drawMode: "corner2corner" },
      settings: { disabled: false, hidden: false },
    } as any;

    await act(async () => {
      root.render(
        <BBoxDrawModePaneView
          onInputChange={() => {}}
          paneParams={paneParams}
        />,
      );
    });
    expect(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]
        .checked,
    ).toBe(true);

    await act(async () => {
      root.render(
        <BBoxDrawModePaneView
          onInputChange={() => {}}
          paneParams={{
            ...paneParams,
            inputtedData: { drawMode: "center2front" },
          }}
        />,
      );
    });
    expect(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
        .checked,
    ).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });

  it("reconciles native changes through parent-owned React state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const changes: { drawMode: string }[] = [];

    await act(async () => {
      root.render(<ControlledBBoxDrawModePane changes={changes} />);
    });
    await act(async () => {
      container
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
        .click();
    });

    expect(changes).toEqual([{ drawMode: "center2front" }]);
    expect(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
        .checked,
    ).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });

  it("preserves rapid native changes until React reconciles them", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const changes: { drawMode: string }[] = [];

    await act(async () => {
      root.render(<ControlledBBoxDrawModePane changes={changes} />);
    });
    await act(async () => {
      container
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
        .click();
      container
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]
        .click();
    });

    expect(changes).toEqual([
      { drawMode: "center2front" },
      { drawMode: "corner2corner" },
    ]);
    expect(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]
        .checked,
    ).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });
});
