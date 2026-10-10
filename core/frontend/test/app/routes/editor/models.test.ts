import { expect } from "chai";
import { describe, it } from "vitest";

import {
  FrameState,
  ProjectConfig,
  SourceGroupState,
  TaskState,
} from "../../../../app/routes/editor/models";

describe("editor model adapters", () => {
  it("parses project config payloads with backend-only fields", () => {
    const config = ProjectConfig.fromJSON({
      frame_cache_size: 32,
      extension_setting: true,
      init_camera_position: { x: 1, y: 2, z: 3 },
      init_camera_target: { x: 4, y: 5, z: 6 },
      backend_only: "ignored",
    });

    expect(config.frame_cache_size).to.equal(32);
    expect(config.extensionOptions.extension_setting).to.equal(true);
    expect(config).to.be.frozen;
  });

  it("parses parent-backed task, source group, and frame payloads", () => {
    const sourceGroup = SourceGroupState.fromJSON({
      id: 2,
      name: "source",
      description: "",
      extra: "ignored",
    });
    const task = TaskState.fromJSON({
      id: 3,
      project_id: 1,
      name: "task",
      supervisors: [{ id: 5 }],
      annotators: [{ id: 7 }, { id: 6 }],
      extra: "ignored",
    });
    const frame = FrameState.fromJSON({
      id: 4,
      task: task,
      account_id: 5,
      source_group: sourceGroup,
      label_branch: { id: 6 },
      min_x: 0,
      min_y: 1,
      min_z: 2,
      max_x: 3,
      max_y: 4,
      max_z: 5,
      min_timestamp: "0",
      max_timestamp: "1",
      work_type: "annotate",
      extra: "ignored",
    });

    expect(task.supervisor_ids).to.deep.equal([5]);
    expect(task.annotatorIdsFromBestToWorst).to.deep.equal([7, 6]);
    expect(frame.source_group_id).to.equal(2);
    expect(frame.label_branch_id).to.equal(6);
  });
});
