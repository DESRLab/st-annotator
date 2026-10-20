import { describe, expect, it } from "vitest";

import { Timestamp } from "sta/common";
import { FrameState, TaskState } from "../../../../../app/routes/editor/models";
import { EditableFrame } from "../../../../../app/routes/editor/nav/EditableFrame";
import type { EditorViews } from "../../../../../app/routes/editor/views";

function frame(min: number | null, max: number | null): EditableFrame {
  return new EditableFrame(
    {} as EditorViews,
    FrameState.fromJSON({
      id: 1,
      task: TaskState.fromJSON({ id: 1, project_id: 1, name: "task" }),
      account_id: 1,
      source_group_id: 2,
      label_branch_id: 3,
      min_timestamp: min == null ? null : new Date(min).toISOString(),
      max_timestamp: max == null ? null : new Date(max).toISOString(),
      work_type: "annotate",
    }),
  );
}

describe("EditableFrame timestamp inclusion", () => {
  it.each([
    [null, null],
    [10_000, null],
    [null, 20_000],
    [10_000, 20_000],
    [10_000, 10_000],
  ])("includes timeless data with frame bounds %s to %s", (min, max) => {
    expect(frame(min, max).containsTimestamp(null)).toBe(true);
  });

  it.each([
    [null, null, 0, true],
    [10_000, null, 9_999, false],
    [10_000, null, 10_000, true],
    [null, 20_000, 20_000, true],
    [null, 20_000, 20_001, false],
    [10_000, 20_000, 9_999, false],
    [10_000, 20_000, 10_000, true],
    [10_000, 20_000, 15_000, true],
    [10_000, 20_000, 20_000, true],
    [10_000, 20_000, 20_001, false],
    [10_000, 10_000, 10_000, true],
    [10_000, 10_000, 10_001, false],
  ] as const)(
    "filters dated data with bounds %s to %s at %s",
    (min, max, time, included) => {
      expect(frame(min, max).containsTimestamp(new Timestamp(time))).toBe(
        included,
      );
    },
  );
});
