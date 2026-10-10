/* @vitest-environment jsdom */

import { default as React, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { LayerSelectorRow } from "../../../../../../app/routes/editor/app/widgets/LayerSelector.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const layers = [
  { key: "source-a", name: "Source A" },
  { key: "label-a", name: "Label A" },
];

async function renderRow(props: React.ComponentProps<typeof LayerSelectorRow>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<LayerSelectorRow {...props} />);
  });

  return {
    container,
    unmount: async (): Promise<void> => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("LayerSelectorRow", () => {
  it("uses Tweakpane list markup and reports the selected layer key", async () => {
    const changes: (string | null)[] = [];
    const view = await renderRow({
      layers,
      onChange: (key) => changes.push(key),
      selectedKey: "label-a",
    });

    const row = view.container.querySelector(".tp-lblv");
    const select = view.container.querySelector("select");
    expect(row?.querySelector(".tp-lblv_l")?.textContent).toBe(
      "Configure Layer:",
    );
    expect(row?.querySelector(".tp-lstv_m")).not.toBeNull();
    expect(select?.value).toBe("label-a");
    expect(
      [...(select?.querySelectorAll("option") ?? [])].map(
        (option) => option.value,
      ),
    ).toEqual(["", "source-a", "label-a"]);

    await act(async () => {
      if (select == null) throw new Error("Layer selector was not rendered");
      select.value = "source-a";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(changes).toEqual(["source-a"]);

    await act(async () => {
      if (select == null) throw new Error("Layer selector was not rendered");
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(changes).toEqual(["source-a", null]);

    await view.unmount();
  });

  it("disables the native select when requested", async () => {
    const view = await renderRow({
      disabled: true,
      layers,
      onChange: () => {},
      selectedKey: null,
    });

    expect(view.container.querySelector("select")?.disabled).toBe(true);
    await view.unmount();
  });
});
