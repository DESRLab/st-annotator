/* @vitest-environment jsdom */

import { PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BaseSceneDisplay } from "../../../../../../app/routes/editor/scene/display/SceneDisplay.tsx";
import {
  BaseSceneWindow,
  POINTER_EVENT_KEYS,
} from "../../../../../../app/routes/editor/scene/display/SceneWindow.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeWindow {
  name: string;
  dom: HTMLDivElement;
  disposeCount: number;

  constructor(name) {
    this.name = name;
    this.dom = document.createElement("div");
    this.dom.textContent = name + " window";
    this.disposeCount = 0;
  }

  dispose() {
    this.disposeCount += 1;
  }
}

class TestSceneWindow extends BaseSceneWindow {
  #dom = document.createElement("div");

  camera = new PerspectiveCamera();

  get dom() {
    return this.#dom;
  }

  getCamera() {
    return this.camera;
  }
}

function createPointerEvent(type, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "type", { value: type, enumerable: true });
  Object.defineProperty(event, "pointerId", {
    value: pointerId,
    enumerable: true,
  });
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("SceneWindow base contracts", () => {
  it("captures pointer events and removes listeners on dispose", () => {
    expect(POINTER_EVENT_KEYS).toContain("pointerdown");
    expect(POINTER_EVENT_KEYS).toContain("pointerup");

    const window = new TestSceneWindow("Test", 3);
    window.dom.setPointerCapture = vi.fn();
    window.dom.releasePointerCapture = vi.fn();

    const events = [];
    window.pointerEvents.addEventListener("pointerdown", (event) =>
      events.push(event),
    );
    window.pointerEvents.addEventListener("pointerup", (event) =>
      events.push(event),
    );

    const pointerDown = createPointerEvent("pointerdown", 42);
    const pointerUp = createPointerEvent("pointerup", 42);
    const preventDefault = vi.spyOn(pointerDown, "preventDefault");
    const stopPropagation = vi.spyOn(pointerDown, "stopPropagation");

    window.dom.dispatchEvent(pointerDown);
    window.dom.dispatchEvent(pointerUp);

    expect(window.name).toBe("Test");
    expect(window.layerId).toBe(3);
    expect(window.getCamera()).toBe(window.camera);
    expect(window.dom.setPointerCapture).toHaveBeenCalledWith(42);
    expect(window.dom.releasePointerCapture).toHaveBeenCalledWith(42);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      "pointerdown",
      "pointerup",
    ]);

    window.dispose();
    window.dom.dispatchEvent(createPointerEvent("pointerdown", 42));

    expect(events).toHaveLength(2);
  });
});

describe("SceneDisplay base contracts", () => {
  it("keeps display DOM ownership outside the imperative display and disposes windows", () => {
    const context = { name: "context" };
    const main = new FakeWindow("main");
    const minimap = new FakeWindow("minimap");
    const display = new BaseSceneDisplay(
      context as any,
      { main, minimap } as any,
      {
        canvas: document.createElement("canvas"),
        dom: document.createElement("div"),
      },
    );

    expect(display.context).toBe(context);
    expect(display.dom.contains(display.canvas)).toBe(false);
    expect(display.dom.contains(main.dom)).toBe(false);
    expect(display.dom.contains(minimap.dom)).toBe(false);

    display.dispose();
    expect(main.disposeCount).toBe(1);
    expect(minimap.disposeCount).toBe(1);
    expect(display.dom.innerHTML).toBe("");
  });

  it("uses caller-supplied display elements without replacing them", () => {
    const dom = document.createElement("div");
    const canvas = document.createElement("canvas");
    const main = new FakeWindow("main");
    const display = new BaseSceneDisplay(
      { name: "context" } as any,
      { main } as any,
      { canvas, dom },
    );

    expect(display.dom).toBe(dom);
    expect(display.canvas).toBe(canvas);
    expect(display.dom.id).toBe("");
    expect(display.canvas.style.width).toBe("");

    display.dispose();
    expect(main.disposeCount).toBe(1);
  });
});
