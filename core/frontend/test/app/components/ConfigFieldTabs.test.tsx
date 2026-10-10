/* @vitest-environment jsdom */

import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConfigFieldPlaceholder,
  ConfigFieldTabs,
  type ConfigEditorState,
  type ConfigParse,
  type ConfigFieldTabsProps,
} from "../../../app/components/ConfigFieldTabs";
import { CommitOnBlurText } from "../../../app/components/CommitOnBlurText";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
}

async function rerender(element: ReactElement) {
  await act(async () => root?.render(element));
}

async function typeValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function blur(input: HTMLInputElement) {
  await act(async () =>
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
}

async function focus(input: HTMLInputElement) {
  await act(async () =>
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true })),
  );
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

function tab(view: HTMLElement, text: string): HTMLButtonElement {
  const found = [...view.querySelectorAll("button[role='tab']")].find(
    (button) => button.textContent?.startsWith(text),
  );
  if (!found) {
    throw new Error(`No tab labelled "${text}".`);
  }
  return found as HTMLButtonElement;
}

function panelFor(view: HTMLElement, button: HTMLElement): HTMLElement {
  const panel = view.querySelector(`#${button.getAttribute("aria-controls")}`);
  if (!panel) {
    throw new Error("The tab does not control a panel.");
  }
  return panel;
}

interface Doc {
  size: number;
  note?: string;
}

const parseDoc = (text: string): ConfigParse<Doc> => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "Expected an object." };
    }
    return { ok: true, value: parsed as Doc };
  } catch {
    return { ok: false, error: "Expected valid JSON." };
  }
};

function paneProps(overrides: Partial<ConfigFieldTabsProps<Doc>> = {}) {
  return {
    label: "Configuration",
    name: "config",
    text: '{"size":2}',
    parse: parseDoc,
    format: (value: Doc) => JSON.stringify(value, null, 2),
    emptyValue: { size: 1 },
    onTextChange: vi.fn(),
    editor: () => null,
    ...overrides,
  };
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("ConfigFieldTabs", () => {
  it("offers the field editor and the raw text as two tabs", async () => {
    const view = await render(<ConfigFieldTabs {...paneProps()} />);
    const fields = tab(view, "Configuration");
    const raw = tab(view, "Configuration (Raw JSON)");

    expect(fields.getAttribute("aria-selected")).toBe("true");
    expect(raw.getAttribute("aria-selected")).toBe("false");
    expect(panelFor(view, fields).className).not.toContain("d-none");
    expect(panelFor(view, raw).className).toContain("d-none");

    await click(raw);
    expect(fields.getAttribute("aria-selected")).toBe("false");
    expect(panelFor(view, fields).className).toContain("d-none");
    expect(panelFor(view, raw).className).not.toContain("d-none");

    await click(fields);
    expect(panelFor(view, fields).className).not.toContain("d-none");
  });

  it("keeps the raw textarea submitted while the field tab is shown", async () => {
    const view = await render(
      <form>
        <ConfigFieldTabs {...paneProps({ text: '{"size":7}' })} />
      </form>,
    );

    // The hidden tab must stay mounted: dropping it would drop the field.
    expect(
      panelFor(view, tab(view, "Configuration (Raw JSON)")).className,
    ).toContain("d-none");
    expect(new FormData(view.querySelector("form")!).get("config")).toBe(
      '{"size":7}',
    );
  });

  it("names the raw textarea by its tab", async () => {
    const view = await render(<ConfigFieldTabs {...paneProps()} />);

    expect(view.querySelector("textarea")!.getAttribute("aria-label")).toBe(
      "Configuration raw JSON",
    );
    expect(view.querySelector("textarea")!.className).toContain(
      "font-monospace",
    );
  });

  it("hands the structured editor the value parsed out of the text", async () => {
    let state: ConfigEditorState<Doc> | null = null;
    const view = await render(
      <ConfigFieldTabs
        {...paneProps()}
        editor={(editorState) => {
          state = editorState;
          return <span>fields</span>;
        }}
      />,
    );

    expect(view.textContent).toContain("fields");
    expect(state!.value).toEqual({ size: 2 });
    expect(state!.disabled).toBe(false);
  });

  it("writes a structured edit back through the formatter", async () => {
    let state: ConfigEditorState<Doc> | null = null;
    const onTextChange = vi.fn();
    await render(
      <ConfigFieldTabs
        {...paneProps({ onTextChange })}
        editor={(editorState) => {
          state = editorState;
          return <span>fields</span>;
        }}
      />,
    );

    await act(async () => state!.onChange({ size: 9, note: "edited" }));

    expect(onTextChange).toHaveBeenCalledWith(
      JSON.stringify({ size: 9, note: "edited" }, null, 2),
    );
  });

  it("reports an unparseable text on both tabs", async () => {
    let state: ConfigEditorState<Doc> | null = null;
    const view = await render(
      <form>
        <ConfigFieldTabs
          {...paneProps({ text: '{"size":' })}
          editor={(editorState) => {
            state = editorState;
            return <span>fields</span>;
          }}
        />
      </form>,
    );

    expect(state!.value).toEqual({ size: 1 });
    expect(state!.disabled).toBe(true);
    expect(view.querySelector("fieldset")!.disabled).toBe(true);

    // The default tab has to say why it is locked, and point at the fix.
    const fieldsPanel = panelFor(view, tab(view, "Configuration"));
    expect(fieldsPanel.textContent).toContain("Expected valid JSON.");
    expect(fieldsPanel.textContent).toContain("raw JSON tab");

    // The raw tab carries the badge that makes the problem findable.
    expect(tab(view, "Configuration (Raw JSON)").textContent).toContain(
      "invalid",
    );
    expect(
      panelFor(view, tab(view, "Configuration (Raw JSON)")).textContent,
    ).toContain("Expected valid JSON.");
    expect(new FormData(view.querySelector("form")!).get("config")).toBe(
      '{"size":',
    );
  });

  it("holds the last valid value when the text breaks under an edit", async () => {
    let state: ConfigEditorState<Doc> | null = null;
    function Harness() {
      const [text, setText] = useState('{"size":4}');
      return (
        <ConfigFieldTabs
          {...paneProps({ text, onTextChange: setText })}
          editor={(editorState) => {
            state = editorState;
            return <span>fields</span>;
          }}
        />
      );
    }
    const view = await render(<Harness />);
    expect(state!.value).toEqual({ size: 4 });

    await typeValue(view.querySelector("textarea")!, '{"size":');

    expect(state!.value).toEqual({ size: 4 });
    expect(state!.disabled).toBe(true);
  });

  it("disables both tabs for a read-only form", async () => {
    const view = await render(
      <ConfigFieldTabs {...paneProps({ readOnly: true })} />,
    );

    expect(view.querySelector("textarea")!.hasAttribute("readonly")).toBe(true);
    expect(view.querySelector("fieldset")!.disabled).toBe(true);
  });

  it("reveals the field's JSON Schema on the raw tab", async () => {
    const view = await render(
      <ConfigFieldTabs
        {...paneProps({
          schema: { type: "object", properties: { size: { type: "integer" } } },
        })}
      />,
    );
    const rawPanel = panelFor(view, tab(view, "Configuration (Raw JSON)"));
    const disclosure = rawPanel.querySelector("details")!;

    expect(disclosure.open).toBe(false);
    expect(disclosure.textContent).toContain("integer");
    expect(disclosure.textContent).toContain("Copy schema");
  });
});

describe("ConfigFieldPlaceholder", () => {
  it("stands in for the field tab of a value with no known schema", async () => {
    const view = await render(
      <form>
        <ConfigFieldTabs
          {...paneProps({
            label: "Preferences",
            name: "preferences",
            text: '{"keybinds":"r"}',
            parse: parseDoc,
            editor: ConfigFieldPlaceholder,
          })}
        />
      </form>,
    );
    const fieldsPanel = panelFor(view, tab(view, "Preferences"));

    expect(fieldsPanel.textContent).toContain("Nothing to configure just yet!");
    // The placeholder costs the field nothing it could submit: the raw tab is
    // still the carrier, mounted and named even while it is hidden.
    expect(
      panelFor(view, tab(view, "Preferences (Raw JSON)")).className,
    ).toContain("d-none");
    expect(new FormData(view.querySelector("form")!).get("preferences")).toBe(
      '{"keybinds":"r"}',
    );
  });
});

describe("CommitOnBlurText", () => {
  const validateNumber = (text: string) =>
    Number.isNaN(Number(text)) ? "Enter a number." : null;

  it("commits only on blur, so a partial number is never rewritten mid-keystroke", async () => {
    const onCommit = vi.fn();
    const view = await render(
      <CommitOnBlurText
        label="Proportion"
        value="1"
        disabled={false}
        validate={validateNumber}
        onCommit={onCommit}
      />,
    );
    const input = view.querySelector("input")!;

    await focus(input);
    await typeValue(input, "1.");
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("1.");

    await blur(input);
    expect(onCommit).toHaveBeenCalledWith("1.");
  });

  it("keeps the draft and reports the problem when validation rejects the text", async () => {
    const onCommit = vi.fn();
    const view = await render(
      <CommitOnBlurText
        label="Proportion"
        value="1"
        disabled={false}
        validate={validateNumber}
        onCommit={onCommit}
      />,
    );
    const input = view.querySelector("input")!;

    await focus(input);
    await typeValue(input, "abc");
    await blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("abc");
    expect(view.textContent).toContain("Enter a number.");
  });

  it("puts the control under its label, not beside it", async () => {
    const view = await render(
      <CommitOnBlurText
        label="Proportion"
        value="1"
        disabled={false}
        onCommit={() => {}}
      />,
    );

    expect(view.querySelector("label")!.className).toContain("d-block");
  });

  it("adopts an external value while the input is untouched", async () => {
    const onCommit = vi.fn();
    const view = await render(
      <CommitOnBlurText
        label="Proportion"
        value="1"
        disabled={false}
        onCommit={onCommit}
      />,
    );

    await rerender(
      <CommitOnBlurText
        label="Proportion"
        value="5"
        disabled={false}
        onCommit={onCommit}
      />,
    );

    expect(view.querySelector("input")!.value).toBe("5");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("leaves a focused draft alone when the surrounding value changes", async () => {
    const onCommit = vi.fn();
    const view = await render(
      <CommitOnBlurText
        label="Proportion"
        value="1"
        disabled={false}
        onCommit={onCommit}
      />,
    );
    const input = view.querySelector("input")!;

    await focus(input);
    await typeValue(input, "2.");
    await rerender(
      <CommitOnBlurText
        label="Proportion"
        value="9"
        disabled={false}
        onCommit={onCommit}
      />,
    );

    expect(input.value).toBe("2.");
  });

  it("renders no label group when used bare inside a prefix group", async () => {
    const view = await render(
      <CommitOnBlurText
        ariaLabel="Box minimum x"
        value="0"
        disabled={false}
        onCommit={() => {}}
      />,
    );

    expect(view.querySelector("label")).toBeNull();
    expect(view.querySelector("input")!.getAttribute("aria-label")).toBe(
      "Box minimum x",
    );
  });
});
