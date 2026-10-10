import { vi } from "vitest";

import { FrameState } from "../../../../../../app/routes/editor/models";
import { EditableFrame } from "../../../../../../app/routes/editor/nav";

/** Held frame-status responses; the test settles each request in order. */
export function heldFrameStatusUpdates() {
  const pending: { resolve: () => void; reject: (error: unknown) => void }[] =
    [];
  const updateFrameIsComplete = vi.fn(
    (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  return { updateFrameIsComplete, pending };
}

/** A real editable frame backed by held views (serialized status updates). */
export function createEditableFrame(
  views: unknown,
  id: number,
  isComplete: boolean,
) {
  return new EditableFrame(
    views as never,
    FrameState.fromJSON({
      id,
      task: { id: 1, project_id: 1, name: "task-1" },
      account_id: 1,
      source_group_id: 2,
      label_branch_id: 3,
      min_x: 0,
      max_x: 1,
      min_y: 0,
      max_y: 1,
      min_z: 0,
      max_z: 1,
      min_timestamp: "2026-01-01T00:00:00Z",
      max_timestamp: "2026-01-01T00:00:01Z",
      work_type: "annotate",
      is_complete: isComplete,
    }),
  );
}
