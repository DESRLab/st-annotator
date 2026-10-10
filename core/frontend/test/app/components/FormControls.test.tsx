/* @vitest-environment jsdom */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BatchSection } from "../../../app/components/BatchSection";
import { LayoutNavLink } from "../../../app/components/LayoutNavLink";
import { SelectMultiplePicker } from "../../../app/components/SelectMultiplePicker";
import { SubmittedCheckbox } from "../../../app/components/SubmittedCheckbox";
import { VectorInputFields } from "../../../app/components/VectorInputFields";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
}

async function change(element: HTMLElement, configure: () => void) {
  await act(async () => {
    configure();
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("SubmittedCheckbox and BatchSection", () => {
  it("always submits an unchecked value and submits the checked value when selected", async () => {
    const container = await render(
      <form>
        <SubmittedCheckbox
          name="enabled"
          label="Enabled"
          value="yes"
          uncheckedValue="no"
        />
      </form>,
    );
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    const form = container.querySelector("form")!;

    expect(container.querySelector("label")?.textContent).toContain("Enabled");
    expect(new FormData(form).getAll("enabled")).toEqual(["no"]);
    await act(async () => checkbox.click());
    expect(new FormData(form).getAll("enabled")).toEqual(["no", "yes"]);
  });

  it("names the checkbox even when the caller supplies no id", async () => {
    const container = await render(
      <form>
        <SubmittedCheckbox
          name="is_complete"
          label="Complete"
          checked={false}
          onChange={() => {}}
        />
        <SubmittedCheckbox
          name="pinned"
          id="explicit-id"
          label="Pinned"
          checked={false}
          onChange={() => {}}
        />
      </form>,
    );
    const checkboxes = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];

    expect(checkboxes[0].id).not.toBe("");
    expect(checkboxes[0].labels[0]?.textContent).toBe("Complete");
    expect(checkboxes[1].id).toBe("explicit-id");
  });

  it("toggles its controlled section and preserves explicit submission metadata", async () => {
    const onToggle = vi.fn();
    const container = await render(
      <form>
        <BatchSection
          label="Advanced"
          checked={false}
          onToggle={onToggle}
          name="advanced"
          value="on"
        >
          <input name="detail" defaultValue="visible" />
        </BatchSection>
      </form>,
    );
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(container.querySelector('[name="detail"]')).toBeNull();
    expect(
      new FormData(container.querySelector("form")!).getAll("advanced"),
    ).toEqual(["false"]);

    await act(async () => checkbox.click());
    expect(onToggle).toHaveBeenCalledWith(true);

    await act(async () =>
      root?.render(
        <form>
          <BatchSection
            label="Advanced"
            checked
            onToggle={onToggle}
            name="advanced"
            value="on"
          >
            <input name="detail" defaultValue="visible" />
          </BatchSection>
        </form>,
      ),
    );
    expect(container.querySelector('[name="detail"]')).not.toBeNull();
    expect(
      new FormData(container.querySelector("form")!).getAll("advanced"),
    ).toEqual(["false", "on"]);
  });

  it("gives every section checkbox a unique, associated label", async () => {
    const container = await render(
      <form>
        <BatchSection
          label="Update Description"
          checked={false}
          onToggle={() => {}}
        >
          <input name="description" />
        </BatchSection>
        <BatchSection
          label="Update Config"
          checked={false}
          onToggle={() => {}}
          name="update_config"
        >
          <input name="dtype" />
        </BatchSection>
      </form>,
    );
    const checkboxes = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];

    expect(
      checkboxes.map((checkbox) => checkbox.labels[0]?.textContent),
    ).toEqual(["Update Description", "Update Config"]);
    expect(checkboxes[0].id).not.toBe(checkboxes[1].id);
  });
});

describe("SelectMultiplePicker", () => {
  const items = [
    { id: 1, label: "One" },
    { id: 2, label: "Two" },
    { id: 3, label: "Three" },
  ];

  it("assigns, unassigns, reorders, and resets selection when controlled values change", async () => {
    const onChange = vi.fn();
    const container = await render(
      <SelectMultiplePicker items={items} value={[3]} onChange={onChange} />,
    );
    const selects = container.querySelectorAll<HTMLSelectElement>("select");
    expect(selects[0].labels?.[0]?.textContent).toBe("Available");
    expect(selects[1].labels?.[0]?.textContent).toBe("Assigned");
    expect([...selects[0].options].map((option) => option.text)).toEqual([
      "One",
      "Two",
    ]);
    expect([...selects[1].options].map((option) => option.text)).toEqual([
      "Three",
    ]);

    await change(selects[0], () => {
      selects[0].options[1].selected = true;
    });
    const transfer = container.querySelector<HTMLButtonElement>(
      'button[title="Assign items"]',
    )!;
    await act(async () => transfer.click());
    expect(onChange).toHaveBeenLastCalledWith([3, 2]);

    await act(async () =>
      root?.render(
        <SelectMultiplePicker
          items={items}
          value={[3, 2]}
          onChange={onChange}
        />,
      ),
    );
    const currentSelects =
      container.querySelectorAll<HTMLSelectElement>("select");
    await change(currentSelects[1], () => {
      currentSelects[1].options[1].selected = true;
    });
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[title="Shift items up"]')!
        .click(),
    );
    expect(onChange).toHaveBeenLastCalledWith([2, 3]);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[title="Unassign items"]')!
        .click(),
    );
    expect(onChange).toHaveBeenLastCalledWith([3]);
  });

  it("disables every interactive control", async () => {
    const container = await render(
      <SelectMultiplePicker
        items={items}
        value={[]}
        onChange={() => {}}
        disabled
      />,
    );
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(
      [...container.querySelectorAll("select, button")].every((element) =>
        element.matches(":disabled"),
      ),
    ).toBe(true);
  });
});

describe("VectorInputFields", () => {
  it("associates values with named axes, emits edits, and hides help while disabled", async () => {
    const onChange = vi.fn();
    const fields = [
      { key: "x" as const, label: "X coordinate", axis: "X" },
      { key: "y" as const, label: "Y coordinate", axis: "Y" },
    ];
    const container = await render(
      <VectorInputFields
        label="Position"
        fields={fields}
        formData={{ x: "1", y: "2" }}
        disabled={false}
        helperText="World coordinates"
        onChange={onChange}
      />,
    );
    const x = container.querySelector<HTMLInputElement>('input[name="x"]')!;
    expect(x.value).toBe("1");
    expect(x.placeholder).toBe("X coordinate");
    expect(container.textContent).toContain("World coordinates");
    await change(x, () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(x, "4");
    });
    expect(onChange).toHaveBeenCalledWith("x", "4");

    await act(async () =>
      root?.render(
        <VectorInputFields
          fields={fields}
          formData={{ x: "4", y: "2" }}
          disabled
          helperText="Hidden"
          onChange={onChange}
        />,
      ),
    );
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(container.textContent).not.toContain("Hidden");
  });
});

describe("LayoutNavLink", () => {
  it("matches exact, prefix, and query-stripped paths without matching sibling prefixes", async () => {
    const container = await render(
      <MemoryRouter initialEntries={["/settings/profile/details"]}>
        <LayoutNavLink href="/settings/profile?tab=main" match="prefix">
          Profile
        </LayoutNavLink>
        <LayoutNavLink href="/settings/profile">Exact profile</LayoutNavLink>
        <LayoutNavLink href="/settings/pro" match="prefix">
          Sibling
        </LayoutNavLink>
      </MemoryRouter>,
    );
    const links = [...container.querySelectorAll("a")];
    expect(links[0].classList).toContain("active");
    expect(links[0].getAttribute("aria-current")).toBe("page");
    expect(links[1].classList).not.toContain("active");
    expect(links[2].classList).not.toContain("active");
  });
});
