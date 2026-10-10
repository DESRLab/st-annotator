/* @vitest-environment jsdom */

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { ThreeUtils } from "sta/common";
import { BaseSceneWindow } from "../../../../../../app/routes/editor/scene/display/SceneWindow";
import {
  SceneObjectsGroup,
  WindowPointer,
} from "../../../../../../app/routes/editor/scene/tools";

class TestSceneWindow extends BaseSceneWindow {
  readonly #dom = document.createElement("div");
  readonly camera = new THREE.PerspectiveCamera();

  get dom(): HTMLElement {
    return this.#dom;
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }
}

function pointerEvent(type: string, pointerId: number, button = 0) {
  return { type, pointerId, button, clientX: 0, clientY: 0 } as PointerEvent;
}

function groupOf<T>(object: T): SceneObjectsGroup<T> {
  return new SceneObjectsGroup({
    objects: [object],
    raycastFunc: () => [{ distance: 1 }] as THREE.Intersection[],
  });
}

describe("WindowPointer", () => {
  it("ends a drag on pointer cancellation", () => {
    const sceneWindow = new TestSceneWindow("test", 1);
    const pointer = new WindowPointer(sceneWindow);
    const object = {};
    const dragger = pointer.createDragController({
      groups: [{ group: groupOf(object), priority: 1 }],
    });
    dragger.hoveredObj = object;

    sceneWindow.pointerEvents.dispatchEvent(pointerEvent("pointerdown", 1));
    expect(dragger.draggedObj).toBe(object);
    sceneWindow.pointerEvents.dispatchEvent(pointerEvent("pointercancel", 1));
    expect(dragger.draggedObj).toBeNull();
  });

  it("ignores unrelated pointers during an active gesture", () => {
    const sceneWindow = new TestSceneWindow("test", 1);
    const update = vi.spyOn(ThreeUtils, "updateRaycaster");
    const pointer = new WindowPointer(sceneWindow);
    pointer.createDragController({});

    sceneWindow.pointerEvents.dispatchEvent(pointerEvent("pointerdown", 1));
    const callsAfterDown = update.mock.calls.length;
    sceneWindow.pointerEvents.dispatchEvent(pointerEvent("pointermove", 2));
    expect(update).toHaveBeenCalledTimes(callsAfterDown);
    sceneWindow.pointerEvents.dispatchEvent(pointerEvent("pointermove", 1));
    expect(update).toHaveBeenCalledTimes(callsAfterDown + 1);
  });

  it("cascades disposal and unregisters factory-created groups", () => {
    const sceneWindow = new TestSceneWindow("test", 1);
    const update = vi.spyOn(ThreeUtils, "updateRaycaster");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pointer = new WindowPointer(sceneWindow);
    const group = groupOf({});
    const dragger = pointer.createDragController({
      groups: [{ group, priority: 1 }],
    });

    dragger.dispose();
    sceneWindow.pointerEvents.dispatchEvent(pointerEvent("pointermove", 1));
    expect(update).not.toHaveBeenCalled();

    pointer.createDragController({ groups: [{ group, priority: 1 }] });
    expect(warn).not.toHaveBeenCalledWith(
      "Found duplicate group being interacted with in window",
    );
    pointer.dispose();
  });
});
