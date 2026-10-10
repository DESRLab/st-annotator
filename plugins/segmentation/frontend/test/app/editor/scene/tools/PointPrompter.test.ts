/* @vitest-environment jsdom */

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PointPrompter } from "../../../../../app/editor/scene/tools/PointPrompter";

function makePrompter() {
  const context = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: "",
  } as any;
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 80;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(1, 10, 2),
    new THREE.Vector3(0, -1, 0),
  );
  const interactor: any = Object.assign(new THREE.EventDispatcher(), {
    raycaster,
    dispose: vi.fn(),
  });
  const pointer = { createInteractor: vi.fn(() => interactor) } as any;
  return {
    prompter: new PointPrompter(pointer, raycaster, canvas),
    interactor,
    context,
  };
}

function pointerEvent(type: "pointerdown" | "pointerup", button: number) {
  return { type, button, pageX: 10, pageY: 20 } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("PointPrompter", () => {
  it("emits snapped left/right prompt labels and resets its canvas between prompts", () => {
    const { prompter, interactor, context } = makePrompter();
    const ended = vi.fn();
    prompter.addEventListener("end", ended);
    prompter.enabled = true;
    interactor.dispatchEvent(pointerEvent("pointerdown", 0));
    expect(context.fillRect).toHaveBeenCalledWith(10, 20, 10, 10);
    interactor.dispatchEvent(pointerEvent("pointerup", 0));
    expect(ended).toHaveBeenLastCalledWith(
      expect.objectContaining({
        label: 1,
        vertex: expect.objectContaining({ x: 1, y: 0, z: 2 }),
      }),
    );
    interactor.dispatchEvent(pointerEvent("pointerdown", 2));
    interactor.dispatchEvent(pointerEvent("pointerup", 2));
    expect(ended.mock.calls[1][0].label).toBe(0);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
  });

  it("ignores a pointer release when enabled after the gesture started", () => {
    const { prompter, interactor } = makePrompter();
    const ended = vi.fn();
    prompter.addEventListener("end", ended);

    // Scene selection consumes the press, then enables the prompt tool
    // before the release from that same click arrives.
    interactor.dispatchEvent(pointerEvent("pointerdown", 0));
    prompter.enabled = true;
    interactor.dispatchEvent(pointerEvent("pointerup", 0));

    expect(ended).not.toHaveBeenCalled();
  });

  it("accepts only left and right buttons as prompts", () => {
    const { prompter, interactor } = makePrompter();
    const ended = vi.fn();
    prompter.addEventListener("end", ended);
    prompter.enabled = true;

    interactor.dispatchEvent(pointerEvent("pointerdown", 1));
    interactor.dispatchEvent(pointerEvent("pointerup", 1));

    expect(ended).not.toHaveBeenCalled();
  });

  it("aborts and resets when disabled, rejects invalid coordinates, and disposes listeners", () => {
    const { prompter, interactor } = makePrompter();
    const aborted = vi.fn();
    prompter.addEventListener("abort", aborted);
    prompter.enabled = true;
    interactor.dispatchEvent(pointerEvent("pointerdown", 0));
    prompter.enabled = false;
    expect(aborted).toHaveBeenCalledWith(
      expect.objectContaining({ label: -1 }),
    );
    expect(prompter.isValidPoint(new THREE.Vector3(Number.NaN, 0, 0))).toBe(
      false,
    );
    expect(
      prompter.isValidPoint(new THREE.Vector3(0, Number.POSITIVE_INFINITY, 0)),
    ).toBe(false);
    expect(prompter.isValidPoint(new THREE.Vector3(0, 0, 0))).toBe(true);
    const remove = vi.spyOn(interactor, "removeEventListener");
    prompter.dispose();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(interactor.dispose).toHaveBeenCalledOnce();
  });
});
