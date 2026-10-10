import { describe, expect, it } from "vitest";

import {
  EditableFrame,
  FrameIndex,
  FrameState,
  TaskState,
} from "sta/app/editor";

import { BBoxLoader } from "../../../../../app/editor/scene/data/BBoxView";

function frame(id: number, timestamp: number) {
  const views = {} as any;
  return new EditableFrame(
    views,
    FrameState.fromJSON({
      id,
      task: TaskState.fromJSON({ id: 1, project_id: 1, name: "task" }),
      account_id: 1,
      source_group_id: 2,
      label_branch_id: 3,
      min_x: 0,
      max_x: 1,
      min_y: 0,
      max_y: 1,
      min_z: 0,
      max_z: 1,
      min_timestamp: new Date(timestamp * 1000).toISOString(),
      max_timestamp: new Date((timestamp + 1) * 1000).toISOString(),
      work_type: "annotate",
    }),
  );
}

describe("BBoxLoader time-path range", () => {
  it("includes exactly the configured number of neighboring time-path frames at boundaries", () => {
    const frames = [frame(1, 10), frame(2, 20), frame(3, 30), frame(4, 40)];
    const lookup = {
      bulkGetData: async () => [],
      isCached: () => false,
    } as any;
    const loader = new BBoxLoader(
      lookup,
      { frames: new FrameIndex(frames) } as any,
      1,
    );
    expect(loader.getFramesInWindow(frames[0]).map(({ id }) => id)).toEqual([
      1, 2,
    ]);
    expect(loader.getFramesInWindow(frames[1]).map(({ id }) => id)).toEqual([
      1, 2, 3,
    ]);
    expect(loader.getFramesInWindow(frames[3]).map(({ id }) => id)).toEqual([
      3, 4,
    ]);
    loader.timePathRange = 0;
    expect(loader.getFramesInWindow(frames[2]).map(({ id }) => id)).toEqual([
      3,
    ]);
    loader.timePathRange = 10;
    expect(loader.getFramesInWindow(frames[2]).map(({ id }) => id)).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
