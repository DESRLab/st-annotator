import { describe, expect, it, vi } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import { LabelTrack } from "../../../../../app/editor/scene/data/LabelTrack";

describe("LabelTrack lazy view", () => {
  it("registers view listeners only when its visual object is requested", () => {
    const labels = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getLabelTrackElements: vi.fn().mockReturnValue(new Set()),
    };
    const track = new LabelTrack({
      config: new EditorConfig(ProjectConfig.fromJSON({ frame_cache_size: 1 })),
      labels: labels as never,
      id: "track-a",
    });

    expect(labels.addEventListener).not.toHaveBeenCalled();
    track.asObject3D();
    expect(labels.addEventListener).toHaveBeenCalledTimes(5);

    track.dispose();
    expect(labels.removeEventListener).toHaveBeenCalledTimes(5);
  });
});
