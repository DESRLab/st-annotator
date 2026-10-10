import { describe, expect, it, vi } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import { LabelInstance } from "../../../../../app/editor/scene/data/LabelInstance";

describe("LabelInstance lazy view", () => {
  it("registers view listeners only when its visual object is requested", () => {
    const labels = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getLabelInstanceElements: vi.fn().mockReturnValue(new Set()),
    };
    const instance = new LabelInstance({
      config: new EditorConfig(ProjectConfig.fromJSON({ frame_cache_size: 1 })),
      labels: labels as never,
      id: "instance-a",
    });

    expect(labels.addEventListener).not.toHaveBeenCalled();
    instance.asObject3D();
    expect(labels.addEventListener).toHaveBeenCalledTimes(5);

    instance.dispose();
    expect(labels.removeEventListener).toHaveBeenCalledTimes(5);
  });
});
