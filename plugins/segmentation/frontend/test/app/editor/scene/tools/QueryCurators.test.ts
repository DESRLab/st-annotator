/* @vitest-environment jsdom */

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrushCurator } from "../../../../../app/editor/scene/tools/parametric/Brush";
import { LassoCurator } from "../../../../../app/editor/scene/tools/vertex/Lasso";
import { PolygonCurator } from "../../../../../app/editor/scene/tools/vertex/Polygon";
import { RectangleCurator } from "../../../../../app/editor/scene/tools/vertex/Rectangle";

function dependencies() {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    rect: vi.fn(),
    stroke: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    closePath: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  } as any;
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "width", { value: 100 });
  Object.defineProperty(canvas, "height", { value: 100 });
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 100,
    height: 100,
    left: 0,
    top: 0,
  } as DOMRect);
  const raycaster = new THREE.Raycaster();
  const interactor: any = Object.assign(new THREE.EventDispatcher(), {
    raycaster,
    dispose: vi.fn(),
  });
  const pointer = { createInteractor: vi.fn(() => interactor) } as any;
  return { context, canvas, raycaster, pointer };
}

const data = (x: number, y: number) => ({
  pointerPixelPos: new THREE.Vector2(x, y),
  pointerNDCPos: new THREE.Vector2(x / 100, y / 100),
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("vertex query creators", () => {
  it("builds and resets rectangle geometry through begin/resume/end", () => {
    const deps = dependencies();
    const curator = new RectangleCurator(
      deps.pointer,
      deps.raycaster,
      deps.canvas,
    );
    curator.updateObjQueryState("begin", data(10, 20));
    curator.updateObjQueryState("resume", data(40, 60));
    expect(
      curator.newDrawnObjData.pixelVertices.map((point) => point.toArray()),
    ).toEqual([
      [10, 20],
      [10, 60],
      [40, 60],
      [40, 20],
    ]);
    const ended = vi.fn();
    curator.addEventListener("end", ended);
    expect(curator.finish()).toBe(true);
    expect(ended.mock.calls[0][0].objQuery.pixelVertices).toHaveLength(4);
    expect(curator.newDrawnObjData.pixelVertices).toEqual([]);
    curator.dispose();
  });

  it.each([PolygonCurator, LassoCurator])(
    "deduplicates vertices and clears %s on abort",
    (Curator) => {
      const deps = dependencies();
      const curator = new Curator(deps.pointer, deps.raycaster, deps.canvas);
      curator.updateObjQueryState("begin", data(10, 20));
      curator.updateObjQueryState("resume", data(10, 20));
      curator.updateObjQueryState("resume", data(20, 30));
      expect(curator.newDrawnObjData.pixelVertices).toHaveLength(2);
      const aborted = vi.fn();
      curator.addEventListener("abort", aborted);
      expect(curator.abort()).toBe(true);
      expect(aborted).toHaveBeenCalledOnce();
      expect(curator.newDrawnObjData.pixelVertices).toEqual([]);
      curator.dispose();
    },
  );
});

describe("parametric brush query creator", () => {
  it("converts pixel diameter to NDC radius, filters boundaries, and resets on abort", () => {
    const deps = dependencies();
    const curator = new BrushCurator(
      deps.pointer,
      deps.raycaster,
      deps.canvas,
      document.createElement("div"),
    );
    curator.diameter = 40;
    curator.updateObjQueryState("begin", {
      centerNDC: new THREE.Vector2(0, 0),
    });
    expect(curator.newDrawnObjData.radius).toBe(0.4);
    expect(
      curator.filterPoints(
        [new THREE.Vector3(1), new THREE.Vector3(2)],
        [new THREE.Vector3(0.39, 0, 0), new THREE.Vector3(0.4, 0, 0)],
        curator.newDrawnObjData,
      ),
    ).toEqual([new THREE.Vector3(1)]);
    curator.isPainting = true;
    expect(curator.abort()).toBe(true);
    expect(curator.newDrawnObjData).toEqual({
      center: new THREE.Vector2(),
      radius: 0,
    });
    curator.dispose();
  });
});
