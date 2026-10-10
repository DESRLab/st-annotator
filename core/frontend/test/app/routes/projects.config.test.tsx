/* @vitest-environment jsdom */

import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectConfigFields } from "../../../app/routes/projects";
import type { ProjectConfig } from "../../../client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
}

async function typeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
}

function checkbox(view: HTMLElement, label: string): HTMLInputElement {
  const found = [...view.querySelectorAll("label")].find(
    (element) => element.textContent === label,
  );
  const id = found?.getAttribute("for");
  const input = id ? document.getElementById(id) : null;
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`No checkbox labelled "${label}" is associated with one.`);
  }
  return input;
}

/**
 * The real wiring: every edit is applied to the config object the raw pane
 * holds, so an assertion sees what the form would submit.
 */
function Harness({
  initial,
  onValue,
}: {
  initial: ProjectConfig;
  onValue: (value: ProjectConfig) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ProjectConfigFields
      value={value}
      disabled={false}
      onChange={(next) => {
        onValue(next);
        setValue(next);
      }}
    />
  );
}

function committed(onValue: ReturnType<typeof vi.fn>): ProjectConfig {
  return onValue.mock.calls.at(-1)![0] as ProjectConfig;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("ProjectConfigFields", () => {
  it("commits the frame cache size as a number on blur", async () => {
    const onValue = vi.fn();
    const view = await render(
      <Harness initial={{ frame_cache_size: 8 }} onValue={onValue} />,
    );
    const cache = view.querySelector<HTMLInputElement>(
      'input[aria-label="Frame cache size"]',
    )!;
    expect(cache.value).toBe("8");

    await typeValue(cache, "64");

    expect(committed(onValue).frame_cache_size).toBe(64);
  });

  it("refuses a cache size that is not a positive whole number", async () => {
    const onValue = vi.fn();
    const view = await render(
      <Harness initial={{ frame_cache_size: 8 }} onValue={onValue} />,
    );
    const cache = view.querySelector<HTMLInputElement>(
      'input[aria-label="Frame cache size"]',
    )!;

    await typeValue(cache, "3.5");

    expect(onValue).not.toHaveBeenCalled();
    expect(cache.value).toBe("3.5");
    expect(view.textContent).toContain("Enter a whole number of at least 1.");
  });

  it("keeps configuration keys this form does not own", async () => {
    const onValue = vi.fn();
    const view = await render(
      <Harness
        initial={
          {
            frame_cache_size: 8,
            a_plugin_option: { nested: true },
          } as ProjectConfig
        }
        onValue={onValue}
      />,
    );

    await act(async () => checkbox(view, "Auto tracks").click());

    expect(committed(onValue)).toEqual({
      frame_cache_size: 8,
      auto_tracks: true,
      a_plugin_option: { nested: true },
    });
  });

  it("adds and removes a camera vector as a whole key", async () => {
    const onValue = vi.fn();
    const view = await render(
      <Harness initial={{ frame_cache_size: 8 }} onValue={onValue} />,
    );
    const toggle = checkbox(view, "Initial camera position");
    expect(toggle.checked).toBe(false);

    await act(async () => toggle.click());
    expect(committed(onValue).init_camera_position).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });

    const xAxis = view.querySelector<HTMLInputElement>(
      'input[aria-label="Initial camera position x"]',
    )!;
    await typeValue(xAxis, "-3");
    expect(committed(onValue).init_camera_position).toEqual({
      x: -3,
      y: 0,
      z: 0,
    });

    await act(async () => toggle.click());
    // The submitted text is what matters: an unset vector must not appear in it.
    const submitted = JSON.parse(JSON.stringify(committed(onValue))) as Record<
      string,
      unknown
    >;
    expect(Object.hasOwn(submitted, "init_camera_position")).toBe(false);
  });

  it("reads a null camera vector as unset", async () => {
    const view = await render(
      <Harness
        initial={
          {
            frame_cache_size: 8,
            init_camera_target: null,
          } as unknown as ProjectConfig
        }
        onValue={() => {}}
      />,
    );

    expect(checkbox(view, "Initial camera target").checked).toBe(false);
    expect(
      view.querySelector('input[aria-label="Initial camera target x"]'),
    ).toBeNull();
  });
});
