import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type { WindowPointer } from "sta/app/editor";

import { LineGeo } from "../../../../../app/editor/scene/data/views/LineGeo";
import { TransformControls } from "../../../../../app/editor/scene/controls/TransformControls";
import { VertexTranslateControls } from "../../../../../app/editor/scene/controls/VertexTranslateControls";
import { VerticesTranslateControls } from "../../../../../app/editor/scene/controls/VerticesTranslateControls";

describe("vector transform handle synchronization", () => {
  it.each([false, true])(
    "moves vertex handles with the plane before another vertex edit (closed: %s)",
    (closed) => {
      const coords = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(6, 0, 0),
        new THREE.Vector3(0, 0, 6),
      ];
      if (closed) coords.push(coords[0].clone());
      const object = new LineGeo({
        vectorCoords: coords,
        color: new THREE.Color("red"),
      });
      object.enableCenter();
      const pointer = {
        createDragController: () =>
          Object.assign(new THREE.EventDispatcher(), {
            dispose: vi.fn(),
          }),
      } as unknown as WindowPointer;
      const controls = new TransformControls(pointer, new THREE.Raycaster());
      controls.object = object;
      const vertices = controls.children.find(
        (child) => child instanceof VerticesTranslateControls,
      )!;
      const vertex = controls.children.find(
        (child) => child instanceof VertexTranslateControls,
      )!;
      const plane = [...vertices.draggableGroup!.objects][0];
      const handles = [...vertex.draggableGroup!.objects];
      const activePlane = vi
        .spyOn(vertices, "draggedElement", "get")
        .mockReturnValue(plane);
      vertices.applyTransform(
        new THREE.Vector3(2, 0, 2),
        new THREE.Vector3(5, 0, 4),
      );
      vertices.dispatchEvent({ type: "objectChange", obj: object });
      expect(handles.map((handle) => handle.position.toArray())).toEqual(
        object.vectorCoords.map((point) => point.toArray()),
      );
      activePlane.mockReturnValue(null);
      vi.spyOn(vertex, "draggedElement", "get").mockReturnValue(handles[1]);
      vertex.setInitState(handles[1]);
      vertex.applyTransform(
        handles[1].position.clone(),
        new THREE.Vector3(10, 0, 2),
      );
      vertex.dispatchEvent({ type: "objectChange", obj: object });
      expect(object.vectorCoords[0].toArray()).toEqual([3, 0, 2]);
      expect(object.vectorCoords[1].toArray()).toEqual([10, 0, 2]);
      expect(object.vectorCoords[2].toArray()).toEqual([3, 0, 8]);
      if (closed) expect(object.vectorCoords[3].toArray()).toEqual([3, 0, 2]);
      expect(plane.position.toArray()).toEqual(object.centerPoint.toArray());
      controls.dispose();
      object.dispose();
    },
  );
});
