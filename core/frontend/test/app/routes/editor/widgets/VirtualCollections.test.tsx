/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VirtualCombobox } from "../../../../../app/routes/editor/widgets/VirtualCombobox.react.tsx";
import { VirtualList } from "../../../../../app/routes/editor/widgets/VirtualList.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function render(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

afterEach(() => document.body.replaceChildren());

describe("bounded collection widgets", () => {
  it("mounts only viewport rows for a 250,000-item collection", async () => {
    const items = Array.from({ length: 250_000 }, (_, id) => ({ id }));
    const view = await render(
      <VirtualList
        height={280}
        items={items}
        renderItem={(item) => <span>{item.id}</span>}
        rowHeight={28}
      />,
    );

    const list = view.container.querySelector("[data-rendered-row-count]")!;
    expect(
      Number(list.getAttribute("data-rendered-row-count")),
    ).toBeLessThanOrEqual(18);
    expect(view.container.querySelectorAll("span")).toHaveLength(18);
    await act(async () => view.root.unmount());
  });

  it("bounds options while allowing an exact search across 250,000 items", async () => {
    const items = new Map(
      Array.from({ length: 250_000 }, (_, id) => [
        String(id),
        { id: String(id), text: `Item ${id}` },
      ]),
    );
    const onChange = vi.fn();
    const view = await render(
      <VirtualCombobox
        items={() => items.values()}
        nullText="(None)"
        onChange={onChange}
        value={null}
      />,
    );
    const input = view.container.querySelector("input")!;

    await act(async () =>
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
    );
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(101);
    expect(document.querySelector('[role="listbox"]')?.classList).toContain(
      "react-virtual-combobox-list",
    );
    expect(document.querySelector('[role="option"]')?.classList).toContain(
      "react-virtual-combobox-option",
    );

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "249999");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const result = document.querySelector<HTMLElement>(
      '[data-label-id="249999"]',
    )!;
    expect(result.textContent).toBe("Item 249999");

    await act(async () => result.click());
    expect(onChange).toHaveBeenCalledWith("249999");
    await act(async () => view.root.unmount());
  });

  it("selects an option below the first five rows when an ancestor clips overflow", async () => {
    const items = Array.from({ length: 12 }, (_, id) => ({
      id: String(id),
      text: `Item ${id}`,
    }));
    const onChange = vi.fn();
    const view = await render(
      <div style={{ height: 30, overflow: "hidden" }}>
        <VirtualCombobox
          items={items}
          nullText="(None)"
          onChange={onChange}
          value={null}
        />
      </div>,
    );
    const input = view.container.querySelector("input")!;

    await act(async () =>
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
    );
    const tenth = document.querySelector<HTMLElement>('[data-label-id="9"]')!;
    expect(tenth).not.toBeNull();
    expect(tenth.closest('[role="listbox"]')?.parentElement).toBe(
      document.body,
    );

    await act(async () => tenth.click());
    expect(onChange).toHaveBeenCalledWith("9");
    await act(async () => view.root.unmount());
  });

  it("keeps small collections searchable and retains the legacy select surface", async () => {
    const onChange = vi.fn();
    const view = await render(
      <VirtualCombobox
        items={[
          { id: "a", text: "Alpha" },
          { id: "b", text: "Alphabet" },
          { id: "c", text: "Beta" },
        ]}
        nullText="(None)"
        onChange={onChange}
        value={null}
      />,
    );
    expect(
      view.container.querySelector('input[role="combobox"]'),
    ).not.toBeNull();
    const select = view.container.querySelector("select")!;
    expect(select.options).toHaveLength(4);
    const input = view.container.querySelector("input")!;
    await act(async () =>
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
    );
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "missing");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "lph");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-label-id]")].map(
        (option) => option.dataset.labelId,
      ),
    ).toEqual(["a", "b"]);
    expect(document.querySelector('[data-label-id="a"]')?.textContent).toBe(
      "Alpha",
    );
    expect(document.querySelector('[data-label-id="b"]')?.textContent).toBe(
      "Alphabet",
    );
    expect(document.querySelector('[data-label-id="c"]')).toBeNull();
    await act(async () => {
      select.value = "a";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("a");
    await act(async () => {
      select.value = "(None)";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
    await act(async () => view.root.unmount());
  });
});
