import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type { WindowPointer } from "sta/app/editor";

import { Controls } from "../../../../../app/editor/scene/controls/Controls";
import { VerticesTranslateControls } from "../../../../../app/editor/scene/controls/VerticesTranslateControls";

describe("vector plane hover highlight", () => {
  it("highlights on hover and resets on leave without transforming geometry", () => {
    const controls = new VerticesTranslateControls(
      {} as WindowPointer,
      new THREE.Raycaster(),
      1,
    );
    const [handle] = VerticesTranslateControls.createElements([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 4),
    ]);
    controls.draggableGroup = Controls.createGroup([handle]);
    const hovered = vi.spyOn(controls, "hoveredElement", "get");
    const changed = vi.fn();
    controls.addEventListener("objectChange", changed);
    const plane = handle.children.find((child) => child instanceof THREE.Mesh)!;
    const material = plane.material as THREE.MeshBasicMaterial;
    hovered.mockReturnValue(handle);
    controls.updateState();
    expect(handle.state).toBe("hovered");
    expect(material.color.getHex()).toBe(new THREE.Color("lightgray").getHex());
    hovered.mockReturnValue(null);
    controls.updateState();
    expect(handle.state).toBe("none");
    expect(material.color.getHex()).toBe(new THREE.Color("gray").getHex());
    expect(changed).not.toHaveBeenCalled();
    controls.dispose();
  });
});
