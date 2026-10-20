import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { CoordinateFormat } from "sta/app/editor";
import type { WindowPointer } from "sta/app/editor";

import { PolygonCreator } from "../../../../../app/editor/scene/tools/Polygon";
import { PolylineCreator } from "../../../../../app/editor/scene/tools/Polyline";
import type { VectorCreator } from "../../../../../app/editor/scene/tools/VectorCreator";

function fixture(Creator: typeof PolylineCreator | typeof PolygonCreator) {
  const dom = document.createElement("div");
  const canvas = document.createElement("canvas");
  const context = {
    beginPath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  const raycaster = new THREE.Raycaster();
  const interactor = Object.assign(
    new THREE.EventDispatcher<{
      pointerdown: { button: number; pageX: number; pageY: number };
    }>(),
    { window: { dom }, raycaster, dispose: vi.fn() },
  );
  const pointer = {
    createInteractor: () => interactor,
  } as unknown as WindowPointer;
  const creator: VectorCreator = new Creator(
    CoordinateFormat.XZY,
    pointer,
    raycaster,
    canvas,
  );
  creator.enabled = true;
  const finished = vi.fn<[{ vertices: readonly THREE.Vector3[] }], void>();
  creator.addEventListener("end", finished);
  function click(x: number, z: number) {
    raycaster.ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    interactor.dispatchEvent({
      type: "pointerdown",
      button: 0,
      pageX: x,
      pageY: z,
    });
  }
  function doubleClick(button = 0) {
    dom.dispatchEvent(new MouseEvent("dblclick", { button, bubbles: true }));
  }
  return { creator, finished, click, doubleClick };
}

describe.each([
  ["polyline", PolylineCreator, 3],
  ["polygon", PolygonCreator, 4],
] as const)("%s double-click completion", (_name, Creator, vertexCount) => {
  it("finishes once on the scene window and retains the final vertex once", () => {
    const { creator, finished, click, doubleClick } = fixture(Creator);
    try {
      click(1, 1);
      click(3, 1);
      // A native double-click delivers two pointer presses before dblclick.
      click(2, 3);
      click(2, 3);
      doubleClick();
      expect(finished).toHaveBeenCalledTimes(1);
      const vertices = finished.mock.calls[0][0].vertices;
      expect(vertices).toHaveLength(vertexCount);
      expect(vertices.slice(0, 3).map((v) => v.toArray())).toEqual([
        [1, 0, 1],
        [3, 0, 1],
        [2, 0, 3],
      ]);
      if (creator.isClosed)
        expect(vertices.at(-1)?.toArray()).toEqual(vertices[0].toArray());
      expect(creator.isCreating).toBe(false);
      doubleClick();
      expect(finished).toHaveBeenCalledTimes(1);
    } finally {
      creator.dispose();
    }
  });

  it("ignores non-primary double-clicks and finishes through the existing keyboard path", () => {
    const { creator, finished, click, doubleClick } = fixture(Creator);
    try {
      click(1, 1);
      click(3, 1);
      click(2, 3);
      doubleClick(2);
      expect(finished).not.toHaveBeenCalled();
      expect(creator.isCreating).toBe(true);
      expect(creator.finish()).toBe(true);
      expect(finished).toHaveBeenCalledTimes(1);
    } finally {
      creator.dispose();
    }
  });

  it("keeps one final vertex when the double-click's second press moves slightly", () => {
    const { creator, finished, click, doubleClick } = fixture(Creator);
    try {
      click(1, 1);
      click(3, 1);
      click(2, 3);
      click(2.1, 3.1);
      doubleClick();
      expect(finished).toHaveBeenCalledTimes(1);
      const vertices = finished.mock.calls[0][0].vertices;
      expect(vertices).toHaveLength(vertexCount);
      expect(vertices[2].toArray()).toEqual([2, 0, 3]);
    } finally {
      creator.dispose();
    }
  });

  it("does not complete disabled or disposed creators", () => {
    const { creator, finished, click, doubleClick } = fixture(Creator);
    click(1, 1);
    click(3, 1);
    click(2, 3);
    creator.enabled = false;
    doubleClick();
    expect(finished).not.toHaveBeenCalled();
    creator.enabled = true;
    click(1, 1);
    click(3, 1);
    click(2, 3);
    creator.dispose();
    doubleClick();
    expect(finished).not.toHaveBeenCalled();
  });
});
