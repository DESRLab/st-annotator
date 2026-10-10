import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import { LabelBox } from "../../../../../app/editor/scene/data/LabelBox";
import { LabelBoxTransformMonitor } from "../../../../../app/editor/scene/data/LabelBoxTransformMonitor";

function makeBox() {
  return new LabelBox({
    config: new EditorConfig(ProjectConfig.fromJSON({ frame_cache_size: 1 })),
    labels: null,
    id: "box",
    boxType: "cuboid",
    center: new THREE.Vector3(1, 2, 3),
    angle: 0,
    size: new THREE.Vector3(4, 5, 6),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("LabelBoxTransformMonitor", () => {
  it("reforms direct object transforms into the corresponding model change events", () => {
    const box = makeBox();
    const changed: string[] = [];
    box.addEventListener("change", ({ propertyKey }) =>
      changed.push(propertyKey),
    );
    const monitor = new LabelBoxTransformMonitor(box);
    const object = box.asObject3D();
    object.position.x += 1;
    object.rotation.y += 0.5;
    object.scale.z += 2;

    vi.advanceTimersByTime(100);
    expect(changed).toEqual(["center", "angle", "size"]);
    vi.advanceTimersByTime(100);
    expect(changed).toEqual(["center", "angle", "size"]);
    monitor.dispose();
  });

  it("resets its snapshot when switching boxes and stops after disposal", () => {
    const first = makeBox();
    const second = makeBox();
    second.asObject3D().position.x += 100;
    const changed = vi.fn();
    second.addEventListener("change", changed);
    const monitor = new LabelBoxTransformMonitor(first);
    monitor.box = second;
    vi.advanceTimersByTime(100);
    expect(changed).not.toHaveBeenCalled();
    second.asObject3D().position.x += 1;
    monitor.dispose();
    vi.advanceTimersByTime(200);
    expect(changed).not.toHaveBeenCalled();
  });
});
