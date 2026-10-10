import { expect } from "chai";
import * as THREE from "three";
import { afterEach, describe, it, vi } from "vitest";

import {
  EditableBranch,
  EditableFrame,
  EditorConfig,
  FrameIndex,
  HistoryItemStatus,
  Placeholder,
  FrameState,
  LabelsetBranchState,
  ProjectConfig,
  TaskState,
} from "sta/app/editor";
import type { EditorViews } from "sta/app/editor";
import { Timestamp } from "sta/common";

import type { ReadonlyLabelBox } from "../../../../../../app/editor/scene/data";
import {
  BBoxLoader,
  BBoxView,
} from "../../../../../../app/editor/scene/data/BBoxView";
import { BoxOps } from "../../../../../../app/editor/scene/data/labelset";
import { DistinctiveLevel, OcclusionLevel } from "../../../../../../models";

const CLASS_CAR = { id: 1, name: "Car" };
const CLASS_PEDESTRIAN = { id: 2, name: "Pedestrian" };

/** Exposes the protected constructor without the async commit-graph load. */
class TestBranch extends EditableBranch {
  static createTest(
    views: EditorViews,
    state: LabelsetBranchState,
  ): TestBranch {
    return new TestBranch(views, state);
  }
}

function makeBranchStateJson(id: number) {
  return {
    id: id,
    group: { id: 1, name: "Test Group" },
    name: `branch-${id}`,
    head: {
      group: { id: 1, name: "Test Group" },
      hash_: `head-hash-${id}`,
      author_id: 0,
      timestamp: "2026-08-13T00:00:00+00:00",
      op_config: { op_name: "open-editor", op_params: null },
    },
  };
}

function makeBranch(): TestBranch {
  const views = {
    getCommitGraph: vi.fn().mockResolvedValue(null),
    pushCommits: vi.fn(),
  } as unknown as EditorViews;

  return TestBranch.createTest(
    views,
    LabelsetBranchState.fromJSON(makeBranchStateJson(3)),
  );
}

function makeFrame(id: number, branchId: number): EditableFrame {
  return new EditableFrame(
    {} as never,
    FrameState.fromJSON({
      id,
      task: TaskState.fromJSON({ id: 1, project_id: 1, name: "task" }),
      account_id: 1,
      source_group_id: 2,
      label_branch_id: branchId,
      min_x: -100,
      max_x: 100,
      min_y: -100,
      max_y: 100,
      min_z: -100,
      max_z: 100,
      min_timestamp: "2026-08-15T12:00:00Z",
      max_timestamp: "2026-08-15T12:10:00Z",
      work_type: "annotate",
    }),
  );
}

function makeBoxParams(
  id: string,
  timestamp: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: id,
    entityId: "track-a",
    boxType: "cuboid",
    center: new THREE.Vector3(1, 2, 3),
    angle: 0.5,
    size: new THREE.Vector3(4, 5, 6),
    timestamp: new Timestamp(timestamp),
    qualityRank: null,
    distinctiveLv: DistinctiveLevel.Excellent,
    occlusionLv: OcclusionLevel.Unknown,
    perceivedClassId: CLASS_CAR.id,
    ...overrides,
  };
}

interface ViewFixture {
  view: BBoxView;
  branch: TestBranch;
  frame: EditableFrame;
}

/**
 * Builds a real `BBoxView` over a real `EditableBranch`, with the backend
 * replaced by a stub lookup: the view's own serialization queue, operation
 * wrapping, and index bookkeeping are exactly the production ones.
 */
async function makeViewFixture(
  frameData: Record<
    number,
    {
      classes?: unknown[];
      tracks?: unknown[];
      boxes?: unknown[];
    }
  >,
): Promise<ViewFixture> {
  const config = new EditorConfig(
    ProjectConfig.fromJSON({ frame_cache_size: 4 }),
  );
  const branch = makeBranch();
  const frame = makeFrame(1, branch.id);

  const context = {
    config: config,
    currentLabelBranch: branch,
    frames: new FrameIndex([frame]),
  };
  const lookup = {
    bulkGetData: async (frames: readonly EditableFrame[]) =>
      frames.map(
        (queryFrame) =>
          frameData[queryFrame.id] ?? {
            classes: [],
            tracks: [],
            boxes: [],
          },
      ),
    isCached: () => false,
    receiver: { config: config },
  };
  const loader = new BBoxLoader(lookup as never, context as never, 0);
  vi.spyOn(loader, "getFramesInWindow").mockImplementation((queryFrame) => [
    queryFrame,
  ]);
  const view = new BBoxView(loader, context as never);

  await view.setFrame(frame);

  return { view, branch, frame };
}

function defaultFrameData() {
  return {
    1: {
      classes: [
        {
          id: CLASS_CAR.id,
          name: CLASS_CAR.name,
          boxColor: new THREE.Color("red"),
          defaultSizeDatabase: null,
        },
        {
          id: CLASS_PEDESTRIAN.id,
          name: CLASS_PEDESTRIAN.name,
          boxColor: new THREE.Color("blue"),
          defaultSizeDatabase: null,
        },
      ],
      tracks: [
        { id: "track-a", gtClassId: CLASS_CAR.id, isBlack: false },
        {
          id: "track-t",
          gtClassId: CLASS_PEDESTRIAN.id,
          isBlack: false,
        },
      ],
      boxes: [
        makeBoxParams("box-a", "2026-08-15T12:02:00Z"),
        makeBoxParams("box-b", "2026-08-15T12:04:00Z", {
          entityId: null,
        }),
      ],
    },
  };
}

/** The names of the applied (saved + active) history entries, i.e. the
 * operations that are currently in effect (undone ones are omitted). */
function currentHistory(branch: TestBranch): string[] {
  return branch
    .getHistory()
    .filter((item) => item.status !== HistoryItemStatus.INACTIVE)
    .map((item) => item.name);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bbox delete versus edit/copy/paste races (item 14)", () => {
  it("a stale inspector edit accepted after the delete applied is a silent no-op", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const boxA = view.getLabelBox("box-a");
    const boxB = view.getLabelBox("box-b");

    await view.deleteLabelBox(boxA);
    expect(view.hasLabelBox("box-a")).to.equal(false);

    // A control captured while box A existed (an inspector input flush,
    // a queued pane change) fires after the deletion has been applied.
    await view.updateLabelBoxPerceivedClass(boxA, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    await view.updateLabelBoxTransform(boxA, "inspector", {
      center: { x: 99, y: 99, z: 99 },
      angle: 1.5,
      size: { x: 9, y: 9, z: 9 },
    });
    await view.deleteLabelBox(boxA);

    // No exception leaks, nothing is recorded for the stale invocations,
    // and the unrelated label is untouched.
    expect(currentHistory(branch)).to.deep.equal([
      "Open Editor",
      "Delete Bounding Box",
    ]);
    expect(view.hasLabelBox("box-a")).to.equal(false);
    expect(boxB.perceivedClassId).to.equal(CLASS_CAR.id);
    expect(boxB.center.toArray()).to.deep.equal([1, 2, 3]);
  });

  const staleOps: [
    string,
    (view: BBoxView, box: ReadonlyLabelBox) => Promise<void>,
  ][] = [
    [
      "inspector edit",
      (view, box) =>
        view.updateLabelBoxPerceivedClass(box, {
          id: CLASS_PEDESTRIAN.id,
        } as never),
    ],
    [
      "relationship reassignment",
      (view, box) =>
        view.updateLabelBoxParentTrack(box, view.getLabelTrack("track-t")),
    ],
    [
      "transform",
      (view, box) =>
        view.updateLabelBoxTransform(box, "inspector", {
          center: { x: 9, y: 9, z: 9 },
          angle: 1.5,
          size: { x: 9, y: 9, z: 9 },
        }),
    ],
    ["second delete", (view, box) => view.deleteLabelBox(box)],
  ];

  it.each(staleOps)(
    "delete queued in the same turn as a stale %s applies the delete and skips the stale op",
    async (_name, staleOp) => {
      const { view, branch } = await makeViewFixture(defaultFrameData());
      const boxA = view.getLabelBox("box-a");
      const boxB = view.getLabelBox("box-b");

      // Both mutations are accepted in one turn; the delete is queued first,
      // so the stale operation only runs after its target is already gone.
      const deletion = view.deleteLabelBox(boxA);
      const stale = staleOp(view, boxA);
      await Promise.all([deletion, stale]);

      // The delete applied; the stale op was skipped deterministically
      // instead of throwing, and the unrelated label is untouched.
      expect(view.hasLabelBox("box-a")).to.equal(false);
      expect(boxB.perceivedClassId).to.equal(CLASS_CAR.id);
      expect(boxB.entityId).to.equal(null);
      expect(boxB.center.toArray()).to.deep.equal([1, 2, 3]);

      // The history can still be undone and redone across the skipped op:
      // the delete, then the stale op that recorded a commit without ever
      // mutating anything.
      const history = branch.getHistory();
      expect(history).to.have.length(3);
      expect(history[0].name).to.equal("Open Editor");
      expect(history[1].name).to.equal("Delete Bounding Box");

      await branch.rebase(history[0].id); // undo both
      expect(view.hasLabelBox("box-a")).to.equal(true);
      await branch.rebase(history[2].id); // redo both
      expect(view.hasLabelBox("box-a")).to.equal(false);
      expect(view.hasLabelBox("box-b")).to.equal(true);
      expect(boxB.perceivedClassId).to.equal(CLASS_CAR.id);
    },
  );

  it("undo restores the deleted label under its id and redoing the stale edit stays safe", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const boxA = view.getLabelBox("box-a");

    const deletion = view.deleteLabelBox(boxA);
    const stale = view.updateLabelBoxPerceivedClass(boxA, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    await Promise.all([deletion, stale]);

    // Undo the stale edit first, then the delete: the label is restored
    // under the same id (as a new model instance) even though the
    // original object is gone.
    const history = branch.getHistory();
    await branch.rebase(history[1].id);
    expect(view.hasLabelBox("box-a")).to.equal(false);
    await branch.rebase(history[0].id);
    expect(view.hasLabelBox("box-a")).to.equal(true);
    expect(view.getLabelBox("box-a")).to.not.equal(boxA);

    // Redoing stays consistent: the delete reapplies, and the stale edit
    // reapplies as the same deterministic no-op (its target is gone again).
    await branch.rebase(history[1].id);
    expect(view.hasLabelBox("box-a")).to.equal(false);
    await branch.rebase(history[2].id);
    expect(view.hasLabelBox("box-a")).to.equal(false);

    // Undoing everything once more restores the label unmutated.
    await branch.rebase(history[0].id);
    expect(view.hasLabelBox("box-a")).to.equal(true);
    expect(view.getLabelBox("box-a").perceivedClassId).to.equal(CLASS_CAR.id);
  });

  it("keeps a pasted placeholder label safe against stale edits across delete and undo", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());

    // Paste-style creation allocates a placeholder id.
    const created = await view.addLabelBox({
      entityId: null,
      boxType: "cuboid",
      center: new THREE.Vector3(7, 8, 9),
      angle: 0.25,
      size: new THREE.Vector3(1, 2, 3),
      timestamp: new Timestamp("2026-08-15T12:06:00Z"),
      qualityRank: null,
      distinctiveLv: DistinctiveLevel.Excellent,
      occlusionLv: OcclusionLevel.Unknown,
      perceivedClassId: CLASS_CAR.id,
    } as never);
    expect(Placeholder.isPlaceholder(created.id)).to.equal(true);

    await view.deleteLabelBox(created);
    expect(view.hasLabelBox(created.id)).to.equal(false);

    // A stale control from before the delete fires against the deleted label.
    await view.updateLabelBoxPerceivedClass(created, {
      id: CLASS_PEDESTRIAN.id,
    } as never);

    // Undo restores the placeholder-id label; the stale edit never applied.
    const history = branch.getHistory();
    await branch.rebase(history[1].id);
    expect(view.hasLabelBox(created.id)).to.equal(true);
    expect(view.getLabelBox(created.id).perceivedClassId).to.equal(
      CLASS_CAR.id,
    );
  });
});

describe("bbox relationship changes against disappearing targets (item 15)", () => {
  it("rejects a stale reassignment accepted after the target track was deleted", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const boxA = view.getLabelBox("box-a");
    const trackT = view.getLabelTrack("track-t");

    await view.deleteLabelTrack(trackT);

    // A stale relationship control still holds the deleted track.
    await view.updateLabelBoxParentTrack(boxA, trackT);

    // No dangling reference: the box keeps its original track, and the
    // entity accessor still resolves.
    expect(boxA.entityId).to.equal("track-a");
    expect(boxA.entity?.id).to.equal("track-a");
    expect(currentHistory(branch)).to.deep.equal([
      "Open Editor",
      "Delete Object Track",
    ]);
  });

  it("deletes the target track while a reassignment is pending in the same turn", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const boxA = view.getLabelBox("box-a");
    const trackT = view.getLabelTrack("track-t");

    const deletion = view.deleteLabelTrack(trackT);
    const reassign = view.updateLabelBoxParentTrack(boxA, trackT);
    await Promise.all([deletion, reassign]);

    // The track deletion applied; the reassignment was skipped, leaving no
    // dangling reference in the resulting label index.
    expect(view.hasLabelTrack("track-t")).to.equal(false);
    expect(boxA.entityId).to.equal("track-a");
    expect(boxA.entity?.id).to.equal("track-a");
    expect(view.getLabelTrack("track-a")).to.be.an("object");

    // History stays fully undo/redo-able across the skipped reassignment.
    const history = branch.getHistory();
    expect(history.map((item) => item.name)).to.deep.equal([
      "Open Editor",
      "Delete Object Track",
      "Assign Object Track",
    ]);
    await branch.rebase(history[0].id);
    expect(view.hasLabelTrack("track-t")).to.equal(true);
    await branch.rebase(history[2].id);
    expect(view.hasLabelTrack("track-t")).to.equal(false);
    expect(boxA.entityId).to.equal("track-a");
  });

  it("does not reassign a box across a branch switch that reuses the id", async () => {
    const fixture = await makeViewFixture({
      ...defaultFrameData(),
      2: {
        classes: defaultFrameData()[1].classes,
        tracks: [{ id: "track-f", gtClassId: CLASS_CAR.id, isBlack: false }],
        boxes: [
          makeBoxParams("box-a", "2026-08-15T12:02:00Z", {
            entityId: null,
          }),
        ],
      },
    });
    const { view, branch } = fixture;
    const staleBoxA = view.getLabelBox("box-a");
    const staleTrackT = view.getLabelTrack("track-t");

    // Navigate to another branch whose labels happen to reuse the id.
    await view.setFrame(makeFrame(2, 4));
    const forkedLabel = view.getLabelBox("box-a");
    expect(forkedLabel).to.not.equal(staleBoxA);

    // The stale control (captured on the old branch) must not mutate the
    // forked branch's label that merely reuses the id.
    await view.updateLabelBoxParentTrack(staleBoxA, staleTrackT);
    expect(forkedLabel.entityId).to.equal(null);
    expect(currentHistory(branch)).to.deep.equal(["Open Editor"]);

    // The new branch's own controls work normally.
    await view.updateLabelBoxParentTrack(
      forkedLabel,
      view.getLabelTrack("track-f"),
    );
    expect(forkedLabel.entityId).to.equal("track-f");
  });

  it("a queued operation applies to the revision it was accepted against, never the superseded one", async () => {
    const { view, frame } = await makeViewFixture({
      ...defaultFrameData(),
      2: {
        classes: defaultFrameData()[1].classes,
        tracks: [{ id: "track-f", gtClassId: CLASS_CAR.id, isBlack: false }],
        boxes: [
          makeBoxParams("box-a", "2026-08-15T12:02:00Z", {
            entityId: null,
          }),
        ],
      },
    });
    const boxA = view.getLabelBox("box-a");

    // Accept the operation against the current revision, then supersede
    // the revision before applying it through the operation directly
    // (bypassing the acceptance-time guard to exercise the apply path).
    const updateOp = new BBoxView.Operation(
      view,
      BoxOps.AssignClass.fromParams(boxA, { id: CLASS_PEDESTRIAN.id }),
    );
    await view.setFrame(makeFrame(2, 4));
    const forkedLabel = view.getLabelBox("box-a");

    updateOp.applyLocal();
    // The forked branch's label that merely reuses the id is untouched...
    expect(forkedLabel.perceivedClassId).to.equal(CLASS_CAR.id);

    // ...while the revision the operation was accepted against received it.
    await view.setFrame(frame);
    expect(view.getLabelBox("box-a")).to.equal(boxA);
    expect(boxA.perceivedClassId).to.equal(CLASS_PEDESTRIAN.id);

    updateOp.undoLocal();
    expect(boxA.perceivedClassId).to.equal(CLASS_CAR.id);
  });
});
