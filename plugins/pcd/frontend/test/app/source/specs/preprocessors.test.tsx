/* @vitest-environment jsdom */

import React, { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PREPROCESSOR_OP_NAMES,
  PreprocessorFields,
  formatPreprocessors,
  jsonFromPreprocessorDrafts,
  parsePreprocessors,
  preprocessorDrafts,
  type PreprocessorDrafts,
} from "../../../../app/source/specs/preprocessors";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
}

async function typeValue(
  input: HTMLInputElement | HTMLSelectElement,
  value: string,
  commitOnBlur = false,
) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input) as object,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(
      new Event(input instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
  if (commitOnBlur) {
    await act(async () =>
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
  }
}

function draftsOf(text: string): PreprocessorDrafts {
  const parsed = preprocessorDrafts(text);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

function errorOf(parsed: ReturnType<typeof preprocessorDrafts>): string {
  return parsed.ok ? "" : parsed.error;
}

function itemsOf(drafts: PreprocessorDrafts): unknown[] {
  return JSON.parse(jsonFromPreprocessorDrafts(drafts)) as unknown[];
}

/**
 * The real wiring: the pane's edit lands in the raw text, which is parsed back
 * into the drafts the pane renders, so an assertion sees what a user sees.
 */
function StatefulHarness({
  initial,
  onDrafts,
}: {
  initial: string;
  onDrafts: (drafts: PreprocessorDrafts) => void;
}) {
  const [drafts, setDrafts] = useState(() => draftsOf(initial));
  return (
    <PreprocessorFields
      drafts={drafts}
      disabled={false}
      onChange={(next) => {
        onDrafts(next);
        setDrafts(next);
      }}
    />
  );
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("preprocessor json", () => {
  it("offers exactly the ops the generated client declares", () => {
    expect(PREPROCESSOR_OP_NAMES).toEqual([
      "crop-box",
      "crop-polygon",
      "denoise",
      "downsample-random",
      "remove-bg",
    ]);
  });

  it("reports the same problems the batch action reports", () => {
    expect(errorOf(preprocessorDrafts("{}"))).toBe(
      "Config: Preprocessors must be a JSON array.",
    );
    expect(errorOf(preprocessorDrafts("nope"))).toBe(
      "Config: Preprocessors must be valid JSON.",
    );
    expect(errorOf(preprocessorDrafts('[{"op_name":"warp"}]'))).toBe(
      "Config: Preprocessor 1 must use one of crop-box, crop-polygon, denoise, downsample-random, remove-bg.",
    );
    expect(errorOf(preprocessorDrafts('[{"op_name":"denoise"}]'))).toBe(
      "Config: Preprocessor 1 must include op_params.",
    );
    expect(preprocessorDrafts("[]").ok).toBe(true);
  });

  it("keeps keys the editor does not own and keys it leaves unset", () => {
    const text = JSON.stringify([
      {
        op_name: "crop-polygon",
        op_params: { keep: true, uri: "area.json", extra: { a: 1 } },
      },
    ]);

    expect(jsonFromPreprocessorDrafts(draftsOf(text))).toBe(
      JSON.stringify(
        [
          {
            op_name: "crop-polygon",
            op_params: {
              keep: true,
              uri: "area.json",
              extra: { a: 1 },
            },
          },
        ],
        null,
        2,
      ),
    );
  });

  it("feeds the raw pane a stored config's preprocessors", () => {
    expect(formatPreprocessors(undefined)).toBe("[]");
    const text = formatPreprocessors([
      { op_name: "downsample-random", op_params: { proportion: 0.5 } },
    ]);

    expect(parsePreprocessors(text).preprocessors).toHaveLength(1);
    expect(preprocessorDrafts(text).ok).toBe(true);
  });
});

describe("PreprocessorFields", () => {
  it("commits a numeric leaf on blur, and null when it is cleared", async () => {
    const onDrafts = vi.fn();
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([
          {
            op_name: "crop-polygon",
            op_params: { keep: true, uri: "a", min_z: -5 },
          },
        ])}
        onDrafts={onDrafts}
      />,
    );
    const minZ = view.querySelector<HTMLInputElement>(
      'input[aria-label="Minimum Z"]',
    )!;
    expect(minZ.value).toBe("-5");

    await typeValue(minZ, "-2.5", true);
    expect(minZ.value).toBe("-2.5");
    expect(
      (
        itemsOf(onDrafts.mock.calls.at(-1)![0])[0] as {
          op_params: Record<string, unknown>;
        }
      ).op_params.min_z,
    ).toBe(-2.5);

    await typeValue(minZ, "", true);
    expect(
      (
        itemsOf(onDrafts.mock.calls.at(-1)![0])[0] as {
          op_params: Record<string, unknown>;
        }
      ).op_params.min_z,
    ).toBeNull();
  });

  it("omits a cleared vector axis instead of writing null", async () => {
    const onDrafts = vi.fn();
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([
          {
            op_name: "crop-box",
            op_params: { keep: true, box_min: { x: 1, y: 2 }, box_max: {} },
          },
        ])}
        onDrafts={onDrafts}
      />,
    );
    const xAxis = view.querySelector<HTMLInputElement>(
      'input[aria-label="Box minimum x"]',
    )!;
    expect(xAxis.value).toBe("1");

    await typeValue(xAxis, "", true);

    expect(
      (
        itemsOf(onDrafts.mock.calls.at(-1)![0])[0] as {
          op_params: { box_min: Record<string, unknown> };
        }
      ).op_params.box_min,
    ).toEqual({ y: 2 });
  });

  it("rejects a non-numeric axis without committing it", async () => {
    const onDrafts = vi.fn();
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([
          { op_name: "crop-box", op_params: { keep: true, box_min: { x: 1 } } },
        ])}
        onDrafts={onDrafts}
      />,
    );
    const xAxis = view.querySelector<HTMLInputElement>(
      'input[aria-label="Box minimum x"]',
    )!;

    await typeValue(xAxis, "12e", true);

    expect(onDrafts).not.toHaveBeenCalled();
    expect(xAxis.value).toBe("12e");
    expect(view.textContent).toContain("Enter a number.");
  });

  it("replaces the params when the op is switched", async () => {
    const onDrafts = vi.fn();
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([
          { op_name: "crop-box", op_params: { keep: true, box_min: { x: 1 } } },
        ])}
        onDrafts={onDrafts}
      />,
    );
    const select = view.querySelector("select")!;

    await typeValue(select, "denoise");

    expect(itemsOf(onDrafts.mock.calls.at(-1)![0])).toEqual([
      { op_name: "denoise", op_params: { nb_neighbours: 10, std_ratio: 2 } },
    ]);
  });

  it("reorders, removes and appends items", async () => {
    const onDrafts = vi.fn();
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([
          {
            op_name: "denoise",
            op_params: { nb_neighbours: 10, std_ratio: 2 },
          },
          {
            op_name: "downsample-random",
            op_params: { proportion: 0.5 },
          },
        ])}
        onDrafts={onDrafts}
      />,
    );
    const titled = (title: string, index = 0) =>
      [...view.querySelectorAll<HTMLButtonElement>(`button[title="${title}"]`)][
        index
      ];

    expect(titled("Move earlier in the pipeline").disabled).toBe(true);
    await act(async () => titled("Move later in the pipeline").click());
    expect(
      itemsOf(onDrafts.mock.calls.at(-1)![0]).map(
        (item) => (item as { op_name: string }).op_name,
      ),
    ).toEqual(["downsample-random", "denoise"]);

    await act(async () => titled("Remove this preprocessor").click());
    expect(onDrafts.mock.calls.at(-1)![0]).toHaveLength(1);

    const add = [...view.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Add preprocessor"),
    )!;
    await act(async () => add.click());
    const added = onDrafts.mock.calls.at(-1)![0]!;
    expect(added).toHaveLength(2);
    expect(added[1].op_name).toBe("crop-box");
  });

  it("leaves an unrecognised op_params to the raw JSON tab", async () => {
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([
          { op_name: "denoise", op_params: "not-an-object" },
        ])}
        onDrafts={() => {}}
      />,
    );

    expect(view.textContent).toContain("only the raw JSON can edit it");
    expect(view.querySelector("input")).toBeNull();
  });

  it("edits the intensity bands of remove-bg as a list", async () => {
    const onDrafts = vi.fn();
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([
          {
            op_name: "remove-bg",
            op_params: [
              { min_values_uri: "min.json", max_values_uri: "max.json" },
            ],
          },
        ])}
        onDrafts={onDrafts}
      />,
    );
    const min = view.querySelector<HTMLInputElement>(
      'input[aria-label="Band 1 minimum values URI"]',
    )!;
    expect(min.value).toBe("min.json");

    await typeValue(min, "min2.json");

    expect(itemsOf(onDrafts.mock.calls.at(-1)![0])).toEqual([
      {
        op_name: "remove-bg",
        op_params: [
          { min_values_uri: "min2.json", max_values_uri: "max.json" },
        ],
      },
    ]);
  });

  it("marks an empty list rather than showing nothing", async () => {
    const view = await render(
      <PreprocessorFields drafts={[]} disabled={false} onChange={() => {}} />,
    );

    expect(view.textContent).toContain("(Empty)");
    // The add control still sits under the list, not beside a heading.
    expect(view.querySelectorAll("button")).toHaveLength(1);
  });

  it("shows a placeholder and a free-standing button for an empty band list", async () => {
    const view = await render(
      <StatefulHarness
        initial={JSON.stringify([{ op_name: "remove-bg", op_params: [] }])}
        onDrafts={() => {}}
      />,
    );

    expect(view.textContent).toContain("(Empty)");
    const addBand = [
      ...view.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Add band"))!;
    // Bootstrap's .form-label is inline, so the button needs its own block or it
    // rides on the "Intensity bands" header's line while the list is empty.
    expect(addBand.parentElement).not.toBe(
      view.querySelector("label")!.parentElement,
    );
    expect(addBand.parentElement!.className).toContain("mt-1");
  });
});
