import { expect } from "chai";
import * as THREE from "three";
import { afterEach, describe, it, vi } from "vitest";

import {
  EditableBranch,
  EditableFrame,
  EditorConfig,
  FrameIndex,
  HistoryItemStatus,
  FrameState,
  LabelsetBranchState,
  ProjectConfig,
  TaskState,
} from "sta/app/editor";
import type { EditorViews } from "sta/app/editor";
import { Timestamp } from "sta/common";

import type { ReadonlyLabelSelection } from "../../../../../../app/editor/scene/data";
import {
  SegmentationLoader,
  SegmentationView,
} from "../../../../../../app/editor/scene/data/SegmentationView";
import { SelectionOps } from "../../../../../../app/editor/scene/data/labelset";
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

function makeSelectionParams(
  id: string,
  timestamp: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: id,
    points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)],
    timestamp: new Timestamp(timestamp),
    entityId: "instance-a",
    perceivedClassId: CLASS_CAR.id,
    distinctiveLv: DistinctiveLevel.Excellent,
    occlusionLv: OcclusionLevel.Unknown,
    ...overrides,
  };
}

interface ViewFixture {
  view: SegmentationView;
  branch: TestBranch;
  frame: EditableFrame;
}

/**
 * Builds a real `SegmentationView` over a real `EditableBranch`, with the
 * backend replaced by a stub lookup: the view's own serialization queue,
 * operation wrapping, and index bookkeeping are exactly the production ones.
 */
async function makeViewFixture(
  frameData: Record<
    number,
    {
      classes?: unknown[];
      instances?: unknown[];
      selections?: unknown[];
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
            instances: [],
            selections: [],
          },
      ),
    isCached: () => false,
    receiver: { config: config },
  };
  const loader = new SegmentationLoader(lookup as never, context as never, 0);
  vi.spyOn(loader, "getFramesInWindow").mockImplementation((queryFrame) => [
    queryFrame,
  ]);
  const view = new SegmentationView(loader, context as never);

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
          selectionColor: new THREE.Color("red"),
        },
        {
          id: CLASS_PEDESTRIAN.id,
          name: CLASS_PEDESTRIAN.name,
          selectionColor: new THREE.Color("blue"),
        },
      ],
      instances: [
        { id: "instance-a", gtClassId: CLASS_CAR.id, isBlack: false },
        {
          id: "instance-t",
          gtClassId: CLASS_PEDESTRIAN.id,
          isBlack: false,
        },
      ],
      selections: [
        makeSelectionParams("selection-a", "2026-08-15T12:02:00Z"),
        makeSelectionParams("selection-b", "2026-08-15T12:04:00Z", {
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

describe("segmentation delete versus edit races (item 14)", () => {
  it("a stale inspector edit accepted after the delete applied is a silent no-op", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const selectionA = view.getLabelSelection("selection-a");
    const selectionB = view.getLabelSelection("selection-b");

    await view.deleteLabelSelection(selectionA);
    expect(view.hasLabelSelection("selection-a")).to.equal(false);

    // A control captured while selection A existed (an inspector input
    // flush, a queued pane change) fires after the deletion was applied.
    await view.updateLabelSelectionPerceivedClass(selectionA, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    await view.updateLabelPointSelection(selectionA, "inspector", [
      new THREE.Vector3(9, 9, 9),
    ]);
    await view.deleteLabelSelection(selectionA);

    // No exception leaks, nothing is recorded for the stale invocations,
    // and the unrelated label is untouched.
    expect(currentHistory(branch)).to.deep.equal([
      "Open Editor",
      "Delete Selection",
    ]);
    expect(view.hasLabelSelection("selection-a")).to.equal(false);
    expect(selectionB.perceivedClassId).to.equal(CLASS_CAR.id);
    expect(selectionB.points).to.have.length(2);
  });

  const staleOps: [
    string,
    (
      view: SegmentationView,
      selection: ReadonlyLabelSelection,
    ) => Promise<void>,
  ][] = [
    [
      "inspector edit",
      (view, selection) =>
        view.updateLabelSelectionPerceivedClass(selection, {
          id: CLASS_PEDESTRIAN.id,
        } as never),
    ],
    [
      "relationship reassignment",
      (view, selection) =>
        view.updateLabelSelectionParentInstance(
          selection,
          view.getLabelInstance("instance-t"),
        ),
    ],
    [
      "point edit",
      async (view, selection) => {
        await view.updateLabelPointSelection(selection, "inspector", [
          new THREE.Vector3(9, 9, 9),
        ]);
      },
    ],
    [
      "second delete",
      (view, selection) => view.deleteLabelSelection(selection),
    ],
  ];

  it.each(staleOps)(
    "delete queued in the same turn as a stale %s applies the delete and skips the stale op",
    async (_name, staleOp) => {
      const { view, branch } = await makeViewFixture(defaultFrameData());
      const selectionA = view.getLabelSelection("selection-a");
      const selectionB = view.getLabelSelection("selection-b");

      // Both mutations are accepted in one turn; the delete is queued first,
      // so the stale operation only runs after its target is already gone.
      const deletion = view.deleteLabelSelection(selectionA);
      const stale = staleOp(view, selectionA);
      await Promise.all([deletion, stale]);

      // The delete applied; the stale op was skipped deterministically
      // instead of throwing, and the unrelated label is untouched.
      expect(view.hasLabelSelection("selection-a")).to.equal(false);
      expect(selectionB.perceivedClassId).to.equal(CLASS_CAR.id);
      expect(selectionB.entityId).to.equal(null);
      expect(selectionB.points).to.have.length(2);

      // The history can still be undone and redone across the skipped op.
      const history = branch.getHistory();
      expect(history).to.have.length(3);
      expect(history[0].name).to.equal("Open Editor");
      expect(history[1].name).to.equal("Delete Selection");

      await branch.rebase(history[0].id); // undo both
      expect(view.hasLabelSelection("selection-a")).to.equal(true);
      await branch.rebase(history[2].id); // redo both
      expect(view.hasLabelSelection("selection-a")).to.equal(false);
      expect(selectionB.perceivedClassId).to.equal(CLASS_CAR.id);
    },
  );

  it("undo restores the deleted selection under its id and redoing the stale edit stays safe", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const selectionA = view.getLabelSelection("selection-a");

    const deletion = view.deleteLabelSelection(selectionA);
    const stale = view.updateLabelSelectionPerceivedClass(selectionA, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    await Promise.all([deletion, stale]);

    // Undo the stale edit first, then the delete: the label is restored
    // under the same id (as a new model instance) even though the
    // original object is gone.
    const history = branch.getHistory();
    await branch.rebase(history[1].id);
    expect(view.hasLabelSelection("selection-a")).to.equal(false);
    await branch.rebase(history[0].id);
    expect(view.hasLabelSelection("selection-a")).to.equal(true);
    expect(view.getLabelSelection("selection-a")).to.not.equal(selectionA);

    // Redoing stays consistent: the delete reapplies, and the stale edit
    // reapplies as the same deterministic no-op (its target is gone again).
    await branch.rebase(history[1].id);
    expect(view.hasLabelSelection("selection-a")).to.equal(false);
    await branch.rebase(history[2].id);
    expect(view.hasLabelSelection("selection-a")).to.equal(false);

    // Undoing everything once more restores the label unmutated.
    await branch.rebase(history[0].id);
    expect(view.hasLabelSelection("selection-a")).to.equal(true);
    expect(view.getLabelSelection("selection-a").perceivedClassId).to.equal(
      CLASS_CAR.id,
    );
  });

  it("does not edit a selection across a branch switch that reuses the id", async () => {
    const fixture = await makeViewFixture({
      ...defaultFrameData(),
      2: {
        classes: defaultFrameData()[1].classes,
        instances: [
          {
            id: "instance-f",
            gtClassId: CLASS_CAR.id,
            isBlack: false,
          },
        ],
        selections: [
          makeSelectionParams("selection-a", "2026-08-15T12:02:00Z", {
            entityId: null,
          }),
        ],
      },
    });
    const { view, branch } = fixture;
    const staleSelectionA = view.getLabelSelection("selection-a");
    const staleInstanceT = view.getLabelInstance("instance-t");

    // Navigate to another branch whose labels happen to reuse the id.
    await view.setFrame(makeFrame(2, 4));
    const forkedLabel = view.getLabelSelection("selection-a");
    expect(forkedLabel).to.not.equal(staleSelectionA);

    // The stale control (captured on the old branch) must not mutate the
    // forked branch's label that merely reuses the id.
    await view.updateLabelSelectionParentInstance(
      staleSelectionA,
      staleInstanceT,
    );
    expect(forkedLabel.entityId).to.equal(null);
    expect(currentHistory(branch)).to.deep.equal(["Open Editor"]);

    // The new branch's own controls work normally.
    await view.updateLabelSelectionParentInstance(
      forkedLabel,
      view.getLabelInstance("instance-f"),
    );
    expect(forkedLabel.entityId).to.equal("instance-f");
  });

  it("a queued operation applies to the revision it was accepted against, never the superseded one", async () => {
    const { view, frame } = await makeViewFixture({
      ...defaultFrameData(),
      2: {
        classes: defaultFrameData()[1].classes,
        instances: [
          {
            id: "instance-f",
            gtClassId: CLASS_CAR.id,
            isBlack: false,
          },
        ],
        selections: [
          makeSelectionParams("selection-a", "2026-08-15T12:02:00Z", {
            entityId: null,
          }),
        ],
      },
    });
    const selectionA = view.getLabelSelection("selection-a");

    // Accept the operation against the current revision, then supersede
    // the revision before applying it through the operation directly
    // (bypassing the acceptance-time guard to exercise the apply path).
    const updateOp = new SegmentationView.Operation(
      view,
      SelectionOps.AssignClass.fromParams(selectionA, {
        id: CLASS_PEDESTRIAN.id,
      } as never),
    );
    await view.setFrame(makeFrame(2, 4));
    const forkedLabel = view.getLabelSelection("selection-a");

    updateOp.applyLocal();
    // The forked branch's label that merely reuses the id is untouched...
    expect(forkedLabel.perceivedClassId).to.equal(CLASS_CAR.id);

    // ...while the revision the operation was accepted against received it.
    await view.setFrame(frame);
    expect(view.getLabelSelection("selection-a")).to.equal(selectionA);
    expect(selectionA.perceivedClassId).to.equal(CLASS_PEDESTRIAN.id);

    updateOp.undoLocal();
    expect(selectionA.perceivedClassId).to.equal(CLASS_CAR.id);
  });
});

describe("segmentation relationship changes against disappearing targets (item 15)", () => {
  it("rejects a stale reassignment accepted after the target instance was deleted", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const selectionA = view.getLabelSelection("selection-a");
    const instanceT = view.getLabelInstance("instance-t");

    await view.deleteLabelInstance(instanceT);

    // A stale relationship control still holds the deleted instance.
    await view.updateLabelSelectionParentInstance(selectionA, instanceT);

    // No dangling reference: the selection keeps its original instance,
    // and the instance accessor still resolves.
    expect(selectionA.entityId).to.equal("instance-a");
    expect(selectionA.entity?.id).to.equal("instance-a");
    expect(currentHistory(branch)).to.deep.equal([
      "Open Editor",
      "Delete Object Instance",
    ]);
  });

  it("deletes the target instance while a reassignment is pending in the same turn", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const selectionA = view.getLabelSelection("selection-a");
    const instanceT = view.getLabelInstance("instance-t");

    const deletion = view.deleteLabelInstance(instanceT);
    const reassign = view.updateLabelSelectionParentInstance(
      selectionA,
      instanceT,
    );
    await Promise.all([deletion, reassign]);

    // The instance deletion applied; the reassignment was skipped, leaving
    // no dangling reference in the resulting label index.
    expect(view.hasLabelInstance("instance-t")).to.equal(false);
    expect(selectionA.entityId).to.equal("instance-a");
    expect(selectionA.entity?.id).to.equal("instance-a");
    expect(view.getLabelInstance("instance-a")).to.be.an("object");

    // History stays fully undo/redo-able across the skipped reassignment.
    const history = branch.getHistory();
    expect(history.map((item) => item.name)).to.deep.equal([
      "Open Editor",
      "Delete Object Instance",
      "Assign Object Instance",
    ]);
    await branch.rebase(history[0].id);
    expect(view.hasLabelInstance("instance-t")).to.equal(true);
    await branch.rebase(history[2].id);
    expect(view.hasLabelInstance("instance-t")).to.equal(false);
    expect(selectionA.entityId).to.equal("instance-a");
  });
});
