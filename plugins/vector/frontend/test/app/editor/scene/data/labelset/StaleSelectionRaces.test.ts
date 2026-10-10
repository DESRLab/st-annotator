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

import type { ReadonlyLabelVector } from "../../../../../../app/editor/scene/data";
import {
  VectorLoader,
  VectorView,
} from "../../../../../../app/editor/scene/data/VectorView";
import { VectorOps } from "../../../../../../app/editor/scene/data/labelset";

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

function makeVectorParams(
  id: string,
  timestamp: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: id,
    vectorType: "LineString",
    vertices: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)],
    timestamp: new Timestamp(timestamp),
    gtClassId: CLASS_CAR.id,
    ...overrides,
  };
}

interface ViewFixture {
  view: VectorView;
  branch: TestBranch;
  frame: EditableFrame;
}

/**
 * Builds a real `VectorView` over a real `EditableBranch`, with the backend
 * replaced by a stub lookup: the view's own serialization queue, operation
 * wrapping, and index bookkeeping are exactly the production ones.
 */
async function makeViewFixture(
  frameData: Record<
    number,
    {
      classes?: unknown[];
      vectors?: unknown[];
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
          frameData[queryFrame.id] ?? { classes: [], vectors: [] },
      ),
    isCached: () => false,
    receiver: { config: config },
  };
  const loader = new VectorLoader(lookup as never, context as never, 0);
  vi.spyOn(loader, "getFramesInWindow").mockImplementation((queryFrame) => [
    queryFrame,
  ]);
  const view = new VectorView(loader, context as never);

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
          vectorColor: new THREE.Color("red"),
        },
        {
          id: CLASS_PEDESTRIAN.id,
          name: CLASS_PEDESTRIAN.name,
          vectorColor: new THREE.Color("blue"),
        },
      ],
      vectors: [
        makeVectorParams("vector-a", "2026-08-15T12:02:00Z"),
        makeVectorParams("vector-b", "2026-08-15T12:04:00Z"),
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

describe("vector delete versus edit races (item 14)", () => {
  it("a stale inspector edit accepted after the delete applied is a silent no-op", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const vectorA = view.getLabelVector("vector-a");
    const vectorB = view.getLabelVector("vector-b");

    await view.deleteLabelVector(vectorA);
    expect(view.hasLabelVector("vector-a")).to.equal(false);

    // A control captured while vector A existed (an inspector input flush,
    // a queued pane change) fires after the deletion has been applied.
    await view.updateLabelVectorGtClass(vectorA, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    await view.updateLabelVectorGeometry(vectorA, "vertex", "Polygon", [
      { x: 9, y: 9, z: 9 },
    ]);
    await view.deleteLabelVector(vectorA);

    // No exception leaks, nothing is recorded for the stale invocations,
    // and the unrelated label is untouched.
    expect(currentHistory(branch)).to.deep.equal([
      "Open Editor",
      "Delete Vector Object",
    ]);
    expect(view.hasLabelVector("vector-a")).to.equal(false);
    expect(vectorB.gtClassId).to.equal(CLASS_CAR.id);
    expect(
      vectorB.vertices.map((vertex: THREE.Vector3) => vertex.toArray()),
    ).to.deep.equal([
      [0, 0, 0],
      [1, 1, 1],
    ]);
  });

  const staleOps: [
    string,
    (view: VectorView, vector: ReadonlyLabelVector) => Promise<void>,
  ][] = [
    [
      "inspector edit",
      (view, vector) =>
        view.updateLabelVectorGtClass(vector, {
          id: CLASS_PEDESTRIAN.id,
        } as never),
    ],
    [
      "geometry edit",
      (view, vector) =>
        view.updateLabelVectorGeometry(vector, "vertex", "Polygon", [
          { x: 9, y: 9, z: 9 },
        ]),
    ],
    ["second delete", (view, vector) => view.deleteLabelVector(vector)],
  ];

  it.each(staleOps)(
    "delete queued in the same turn as a stale %s applies the delete and skips the stale op",
    async (_name, staleOp) => {
      const { view, branch } = await makeViewFixture(defaultFrameData());
      const vectorA = view.getLabelVector("vector-a");
      const vectorB = view.getLabelVector("vector-b");

      // Both mutations are accepted in one turn; the delete is queued first,
      // so the stale operation only runs after its target is already gone.
      const deletion = view.deleteLabelVector(vectorA);
      const stale = staleOp(view, vectorA);
      await Promise.all([deletion, stale]);

      // The delete applied; the stale op was skipped deterministically
      // instead of throwing, and the unrelated label is untouched.
      expect(view.hasLabelVector("vector-a")).to.equal(false);
      expect(vectorB.gtClassId).to.equal(CLASS_CAR.id);
      expect(
        vectorB.vertices.map((vertex: THREE.Vector3) => vertex.toArray()),
      ).to.deep.equal([
        [0, 0, 0],
        [1, 1, 1],
      ]);

      // The history can still be undone and redone across the skipped op.
      const history = branch.getHistory();
      expect(history).to.have.length(3);
      expect(history[0].name).to.equal("Open Editor");
      expect(history[1].name).to.equal("Delete Vector Object");

      await branch.rebase(history[0].id); // undo both
      expect(view.hasLabelVector("vector-a")).to.equal(true);
      await branch.rebase(history[2].id); // redo both
      expect(view.hasLabelVector("vector-a")).to.equal(false);
      expect(vectorB.gtClassId).to.equal(CLASS_CAR.id);
    },
  );

  it("undo restores the deleted vector under its id and redoing the stale edit stays safe", async () => {
    const { view, branch } = await makeViewFixture(defaultFrameData());
    const vectorA = view.getLabelVector("vector-a");

    const deletion = view.deleteLabelVector(vectorA);
    const stale = view.updateLabelVectorGtClass(vectorA, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    await Promise.all([deletion, stale]);

    // Undo the stale edit first, then the delete: the label is restored
    // under the same id (as a new model instance) even though the
    // original object is gone.
    const history = branch.getHistory();
    await branch.rebase(history[1].id);
    expect(view.hasLabelVector("vector-a")).to.equal(false);
    await branch.rebase(history[0].id);
    expect(view.hasLabelVector("vector-a")).to.equal(true);
    expect(view.getLabelVector("vector-a")).to.not.equal(vectorA);

    // Redoing stays consistent: the delete reapplies, and the stale edit
    // reapplies as the same deterministic no-op (its target is gone again).
    await branch.rebase(history[1].id);
    expect(view.hasLabelVector("vector-a")).to.equal(false);
    await branch.rebase(history[2].id);
    expect(view.hasLabelVector("vector-a")).to.equal(false);

    // Undoing everything once more restores the label unmutated.
    await branch.rebase(history[0].id);
    expect(view.hasLabelVector("vector-a")).to.equal(true);
    expect(view.getLabelVector("vector-a").gtClassId).to.equal(CLASS_CAR.id);
  });

  it("does not edit a vector across a branch switch that reuses the id", async () => {
    const fixture = await makeViewFixture({
      ...defaultFrameData(),
      2: {
        classes: defaultFrameData()[1].classes,
        vectors: [makeVectorParams("vector-a", "2026-08-15T12:02:00Z")],
      },
    });
    const { view, branch } = fixture;
    const staleVectorA = view.getLabelVector("vector-a");

    // Navigate to another branch whose labels happen to reuse the id.
    await view.setFrame(makeFrame(2, 4));
    const forkedLabel = view.getLabelVector("vector-a");
    expect(forkedLabel).to.not.equal(staleVectorA);

    // The stale control (captured on the old branch) must not mutate the
    // forked branch's label that merely reuses the id.
    await view.updateLabelVectorGtClass(staleVectorA, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    expect(forkedLabel.gtClassId).to.equal(CLASS_CAR.id);
    expect(currentHistory(branch)).to.deep.equal(["Open Editor"]);

    // The new branch's own controls work normally.
    await view.updateLabelVectorGtClass(forkedLabel, {
      id: CLASS_PEDESTRIAN.id,
    } as never);
    expect(forkedLabel.gtClassId).to.equal(CLASS_PEDESTRIAN.id);
  });

  it("a queued operation applies to the revision it was accepted against, never the superseded one", async () => {
    const { view, frame } = await makeViewFixture({
      ...defaultFrameData(),
      2: {
        classes: defaultFrameData()[1].classes,
        vectors: [makeVectorParams("vector-a", "2026-08-15T12:02:00Z")],
      },
    });
    const vectorA = view.getLabelVector("vector-a");

    // Accept the operation against the current revision, then supersede
    // the revision before applying it through the operation directly
    // (bypassing the acceptance-time guard to exercise the apply path).
    const updateOp = new VectorView.Operation(
      view,
      VectorOps.AssignClass.fromParams(vectorA, {
        id: CLASS_PEDESTRIAN.id,
      }),
    );
    await view.setFrame(makeFrame(2, 4));
    const forkedLabel = view.getLabelVector("vector-a");

    updateOp.applyLocal();
    // The forked branch's label that merely reuses the id is untouched...
    expect(forkedLabel.gtClassId).to.equal(CLASS_CAR.id);

    // ...while the revision the operation was accepted against received it.
    await view.setFrame(frame);
    expect(view.getLabelVector("vector-a")).to.equal(vectorA);
    expect(vectorA.gtClassId).to.equal(CLASS_PEDESTRIAN.id);

    updateOp.undoLocal();
    expect(vectorA.gtClassId).to.equal(CLASS_CAR.id);
  });
});
