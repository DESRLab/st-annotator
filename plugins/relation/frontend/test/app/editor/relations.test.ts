import type {
  SceneContext,
  EditorWindowMapper,
  EditableFrame,
  LabelElementEndpoint,
  Operation,
  EditorViews,
  PushCommitsData,
} from "sta/app/editor";
import { describe, expect, it, vi } from "vitest";
import { Object3D, Raycaster, Vector3 } from "three";
import {
  Placeholder,
  EditableBranch,
  LabelsetBranchState,
  withLocalOperationEffects,
  sameLabelElement,
} from "sta/app/editor";
import { RelationIndex } from "../../../app/editor/RelationIndex";
import {
  RelationOperation,
  relationDataSchema,
} from "../../../app/editor/RelationView";
import { pickEndpoint } from "../../../app/editor/RelationLayer";

const source = { type: "box", id: "00000000-0000-0000-0000-000000000001" };
const target = { type: "vector", id: "00000000-0000-0000-0000-000000000002" };
const relation = {
  id: "00000000-0000-0000-0000-000000000003",
  source,
  target,
  relation_class_id: 1,
};
const definition = { id: 1, name: "supports", color_rgb: 0x123456 };

function index() {
  return new RelationIndex([relation], [definition], [1]);
}

it("preserves queued changes to separate relation fields in state, history, and save payloads", async () => {
  const labels = index();
  const replacement = { ...source, id: "replacement" };
  const changeClass = new RelationOperation(labels, "update", {
    ...relation,
    relation_class_id: 2,
  });
  const changeEndpoint = new RelationOperation(labels, "update", {
    ...relation,
    source: replacement,
  });
  changeClass.applyLocal();
  changeEndpoint.applyLocal();
  expect(labels.get(relation.id)).toMatchObject({
    source: replacement,
    relation_class_id: 2,
  });
  expect(changeEndpoint.opParams).toMatchObject({
    source: replacement,
    relation_class_id: 2,
  });
  changeEndpoint.undoLocal();
  expect(labels.get(relation.id)).toMatchObject({
    source,
    relation_class_id: 2,
  });
  changeClass.undoLocal();
  expect(labels.get(relation.id)).toEqual(relation);
  changeClass.applyLocal();
  changeEndpoint.applyLocal();
  expect(labels.get(relation.id)).toMatchObject({
    source: replacement,
    relation_class_id: 2,
  });
});

it("preserves an explicit queued reset to the original class", () => {
  const labels = index();
  const change = new RelationOperation(
    labels,
    "update",
    {
      ...relation,
      relation_class_id: 2,
    },
    ["relation_class_id"],
  );
  const reset = new RelationOperation(labels, "update", relation, [
    "relation_class_id",
  ]);
  change.applyLocal();
  reset.applyLocal();
  expect(labels.get(relation.id)).toEqual(relation);
  expect(reset.opParams.relation_class_id).toBe(relation.relation_class_id);
  reset.undoLocal();
  expect(labels.get(relation.id)?.relation_class_id).toBe(2);
});

it("shares historical class definitions across cached and later frames within a branch", async () => {
  const { RelationLoader } = await import("../../../app/editor/RelationView");
  const retired = { id: 9, name: "retired class", color_rgb: 0xabcdef };
  const historical = { ...relation, relation_class_id: retired.id };
  let branchId = 2;
  const loader = new RelationLoader({
    views: {
      bulkGetLabelData: async (_type: string, ids: number[]) =>
        new Response(
          JSON.stringify([
            {
              frame_id: ids[0],
              branch_id: branchId,
              head_hash: "head",
              relations: ids[0] === 1 ? [historical] : [],
              classes: ids[0] === 1 ? [definition, retired] : [definition],
              selectable_class_ids: [definition.id],
            },
          ]),
        ),
    },
  } as unknown as SceneContext<EditorWindowMapper>);
  const frame = (id: number) =>
    ({ id, label_branch_id: branchId }) as EditableFrame;
  try {
    const cached = await loader.getData(frame(2));
    const changed = vi.fn();
    cached.addEventListener("change", changed);
    const first = await loader.getData(frame(1));
    expect(cached.classes.get(retired.id)).toEqual(retired);
    expect(changed).toHaveBeenCalled();
    new RelationOperation(first, "update", {
      ...historical,
      source: { ...source, id: "replacement" },
    }).applyLocal();
    expect(cached.get(relation.id)?.relation_class_id).toBe(retired.id);
    const later = await loader.getData(frame(3));
    expect(later.get(relation.id)?.relation_class_id).toBe(retired.id);
    expect(later.classes.get(retired.id)).toEqual(retired);
    expect(later.selectableClassIds).toEqual([definition.id]);
    branchId = 3;
    expect((await loader.getData(frame(4))).classes.has(retired.id)).toBe(
      false,
    );
  } finally {
    loader.dispose();
  }
});

describe("relation history", () => {
  it("groups every class and direction for an endpoint pair without merging records", () => {
    const reverse = {
      ...relation,
      id: "reverse",
      source: target,
      target: source,
      relation_class_id: 2,
    };
    const parallel = { ...relation, id: "parallel", relation_class_id: 3 };
    const unrelated = {
      ...relation,
      id: "unrelated",
      target: { ...target, type: "box" },
    };
    const labels = new RelationIndex(
      [relation, reverse, parallel, unrelated],
      [definition],
      [1],
    );
    expect(
      labels.groups().map((group) => group.members.map((item) => item.id)),
    ).toEqual([[relation.id, "reverse", "parallel"], ["unrelated"]]);
    expect(labels.relations.size).toBe(4);
    const update = new RelationOperation(labels, "update", {
      ...reverse,
      relation_class_id: 4,
    });
    update.applyLocal();
    expect(labels.get(relation.id)).toBe(relation);
    expect(labels.get("reverse")?.relation_class_id).toBe(4);
    expect(labels.groups()).toHaveLength(2);
    const remove = new RelationOperation(labels, "delete", reverse);
    remove.applyLocal();
    expect(labels.groups()[0].members.map((item) => item.id)).toEqual([
      relation.id,
      "parallel",
    ]);
    remove.undoLocal();
    update.undoLocal();
    expect(labels.get("reverse")).toBe(reverse);
    expect(labels.groups()[0].members).toHaveLength(3);
    const replace = new RelationOperation(labels, "update", {
      ...reverse,
      source: { type: "selection", id: "replacement" },
    });
    replace.applyLocal();
    expect(labels.get(relation.id)).toBe(relation);
    expect(labels.groups()).toHaveLength(3);
    replace.undoLocal();
    expect(labels.groups()).toHaveLength(2);
  });

  it("groups resolved placeholder endpoints with their saved references", () => {
    const id = new Placeholder<string>();
    id.put(source.id);
    const reverse = {
      ...relation,
      id: "reverse",
      source: target,
      target: { ...source, id },
    };
    const labels = new RelationIndex([relation, reverse], [definition], [1]);
    expect(labels.groups()[0].members).toEqual([relation, reverse]);
  });
  it("creates, changes endpoints and class, deletes, and undoes each operation", () => {
    const labels = new RelationIndex([], [definition], [1]);
    const create = new RelationOperation(labels, "create", relation);
    create.applyLocal();
    const created = [...labels.relations.values()][0];
    expect(created.id).toBe(create.opResult);
    expect(create.opParams).toEqual({ source, target, relation_class_id: 1 });
    const update = new RelationOperation(labels, "update", {
      ...created,
      source: target,
      target: source,
      relation_class_id: 2,
    });
    update.applyLocal();
    expect(labels.get(created.id)?.source).toEqual(target);
    expect(labels.get(created.id)?.relation_class_id).toBe(2);
    update.undoLocal();
    expect(labels.get(created.id)).toEqual(created);
    const remove = new RelationOperation(labels, "delete", created);
    remove.applyLocal();
    expect(labels.relations.size).toBe(0);
    remove.undoLocal();
    expect(labels.get(created.id)).toEqual(created);
    create.undoLocal();
    expect(labels.relations.size).toBe(0);
    create.applyLocal();
    expect(labels.relations.size).toBe(1);
  });

  it("deletes attached relations atomically with an endpoint and restores them on undo and redo", () => {
    const labels = index();
    const unrelated = {
      ...relation,
      id: "other",
      source: { type: "selection", id: "other-source" },
      target: { type: "box", id: "other-target" },
    };
    labels.set(unrelated);
    let endpointExists = true;
    const deletion: Operation<{ id: string }, null> = {
      opName: "box-delete",
      opParams: { id: source.id },
      opResult: null,
      displayName: "Delete Box",
      deletedElements: [source],
      applyLocal() {
        endpointExists = false;
      },
      undoLocal() {
        endpointExists = true;
      },
    };
    const wrapped = withLocalOperationEffects(deletion, [
      labels.deletionEffect([source]),
    ]);
    wrapped.applyLocal();
    expect(endpointExists).toBe(false);
    expect(labels.get(relation.id)).toBeUndefined();
    expect(labels.get(unrelated.id)).toBe(unrelated);
    wrapped.undoLocal();
    expect(endpointExists).toBe(true);
    expect(labels.get(relation.id)).toBe(relation);
    wrapped.applyLocal();
    expect(labels.get(relation.id)).toBeUndefined();
    wrapped.undoLocal();
    expect(labels.get(relation.id)).toBe(relation);
    expect(wrapped.opParams).toBe(deletion.opParams);
    expect(wrapped.opName).toBe("box-delete");
  });

  it("matches resolved placeholder endpoints without mixing element types", () => {
    const id = new Placeholder<string>();
    expect(sameLabelElement({ type: "box", id }, source)).toBe(false);
    id.put(source.id);
    expect(sameLabelElement({ type: "box", id }, source)).toBe(true);
    expect(sameLabelElement({ type: "vector", id }, source)).toBe(false);
    const labels = new RelationIndex(
      [{ ...relation, source: { type: "box", id } }],
      [definition],
      [1],
    );
    const effect = labels.deletionEffect([source]);
    effect.apply();
    expect(labels.relations.size).toBe(0);
  });

  it("rejects stale relation edits instead of reviving a deleted relation", () => {
    const labels = index();
    const update = new RelationOperation(labels, "update", relation);
    labels.delete(relation.id);
    expect(() => update.applyLocal()).toThrow("no longer exists");
    expect(labels.relations.size).toBe(0);
  });
});

describe("cross-plugin picking", () => {
  function endpoint(type: string, distance: number): LabelElementEndpoint {
    return {
      reference: { type, id: type },
      objectClassName: null,
      center: new Vector3(),
      raycast: () => [
        { distance, point: new Vector3(), object: new Object3D() },
      ],
    };
  }
  it("excludes a source identified by its resolved placeholder before raycasting", () => {
    const source = endpoint("box", 1);
    const target = endpoint("vector", 2);
    const sourceRaycast = vi.spyOn(source, "raycast");
    const id = new Placeholder<string>();
    id.put("box");
    expect(
      pickEndpoint([source, target], new Raycaster(), { type: "box", id }),
    ).toBe(target);
    expect(sourceRaycast).not.toHaveBeenCalled();
    expect(
      pickEndpoint([source], new Raycaster(), { type: "box", id }),
    ).toBeNull();
    expect(pickEndpoint([source], new Raycaster())).toBe(source);
  });

  it("chooses the nearest hit from any element provider", () => {
    const box = endpoint("box", 4);
    const vector = endpoint("vector", 2);
    const selection = endpoint("selection", 3);
    expect(pickEndpoint([box, vector, selection], new Raycaster())).toBe(
      vector,
    );
    expect(pickEndpoint([selection, box], new Raycaster())).toBe(selection);
    expect(pickEndpoint([], new Raycaster())).toBeNull();
  });
});

it("validates backend relation payloads before building an index", () => {
  const payload = {
    frame_id: 1,
    branch_id: 2,
    head_hash: "head",
    relations: [relation],
    classes: [definition],
    selectable_class_ids: [1],
  };
  expect(relationDataSchema.parse(payload).relations).toEqual([relation]);
  expect(() =>
    relationDataSchema.parse({
      ...payload,
      relations: [{ ...relation, source: { type: "box", id: 1 } }],
    }),
  ).toThrow();
});

it("reports received relation bytes while streaming a response without a content length", async () => {
  const { RelationLoader } = await import("../../../app/editor/RelationView");
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      {
        frame_id: 1,
        branch_id: 2,
        head_hash: "head",
        relations: [relation],
        classes: [definition],
        selectable_class_ids: [1],
      },
    ]),
  );
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 10));
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    }),
  );
  const loader = new RelationLoader({
    views: { bulkGetLabelData: vi.fn().mockResolvedValue(response) },
  } as unknown as SceneContext<EditorWindowMapper>);
  const onProgress = vi.fn();
  try {
    await loader.getData(
      { id: 1, label_branch_id: 2 } as EditableFrame,
      undefined,
      onProgress,
    );
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      loadedBytes: 10,
      totalBytes: null,
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      loadedBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
    });
  } finally {
    loader.dispose();
  }
});

it("shares a frame load across callers and keeps local edits when revisiting a frame", async () => {
  const { RelationLoader } = await import("../../../app/editor/RelationView");
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>((done) => {
    resolve = done;
  });
  const bulkGetLabelData = vi.fn(() => response);
  const context = {
    views: { bulkGetLabelData },
  } as unknown as SceneContext<EditorWindowMapper>;
  const loader = new RelationLoader(context);
  const first = { id: 1, label_branch_id: 2 } as EditableFrame;
  const abort = new AbortController();
  const firstLoad = loader.getData(first, abort.signal);
  const secondLoad = loader.getData(first);
  abort.abort();
  const aborted = expect(firstLoad).rejects.toThrow("Aborted");
  resolve(
    new Response(
      JSON.stringify([
        {
          frame_id: 1,
          branch_id: 2,
          head_hash: "head",
          relations: [relation],
          classes: [definition],
          selectable_class_ids: [1],
        },
      ]),
    ),
  );
  await aborted;
  const labels = await secondLoad;
  labels.delete(relation.id);
  expect(await loader.getData(first)).toBe(labels);
  expect(labels.relations.size).toBe(0);
  expect(bulkGetLabelData).toHaveBeenCalledTimes(1);
  loader.dispose();
  await expect(loader.getData(first)).rejects.toThrow("Disposed");
});

it("does not cache a failed relation response and retries successfully", async () => {
  const { RelationLoader } = await import("../../../app/editor/RelationView");
  const bulkGetLabelData = vi
    .fn()
    .mockResolvedValueOnce(new Response("Failed", { status: 500 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            frame_id: 1,
            branch_id: 2,
            head_hash: "head",
            relations: [],
            classes: [definition],
            selectable_class_ids: [1],
          },
        ]),
      ),
    );
  const loader = new RelationLoader({
    views: { bulkGetLabelData },
  } as unknown as SceneContext<EditorWindowMapper>);
  const frame = { id: 1, label_branch_id: 2 } as EditableFrame;
  await expect(loader.getData(frame)).rejects.toThrow("Failed");
  expect(loader.isCached(frame)).toBe(false);
  expect((await loader.getData(frame)).selectableClassIds).toEqual([1]);
  expect(bulkGetLabelData).toHaveBeenCalledTimes(2);
  loader.dispose();
});

it("rejects writes during navigation or against a different branch without changing labels", async () => {
  const { RelationView } = await import("../../../app/editor/RelationView");
  const labels = index();
  const apply = vi.fn(async (operation: Operation<unknown, string>) => {
    operation.applyLocal();
  });
  const context = { isNavigating: true, currentLabelBranch: { id: 1, apply } };
  class LoadedView extends RelationView {
    get data() {
      return labels;
    }
    get isLoading() {
      return false;
    }
    get frame() {
      return { id: 1, label_branch_id: 1 } as EditableFrame;
    }
  }
  const view = new LoadedView(
    context as unknown as SceneContext<EditorWindowMapper>,
  );
  const updated = { ...relation, source: target, target: source };
  await expect(view.write("update", updated)).rejects.toThrow("not loaded");
  context.isNavigating = false;
  context.currentLabelBranch.id = 2;
  await expect(view.write("update", updated)).rejects.toThrow("not loaded");
  expect(apply).not.toHaveBeenCalled();
  expect(labels.get(relation.id)).toBe(relation);
  context.currentLabelBranch.id = 1;
  await view.write("update", updated);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(labels.get(relation.id)?.source).toEqual(target);
  const createdId = await view.write("create", relation);
  expect(createdId).toBeInstanceOf(Placeholder);
  expect(labels.get(createdId!)).toMatchObject({ source, target });
  view.dispose();
});

it("loads separate relation payloads for frames in the same branch", async () => {
  const { RelationLoader } = await import("../../../app/editor/RelationView");
  const bulkGetLabelData = vi.fn(
    async (_type: string, ids: number[]) =>
      new Response(
        JSON.stringify([
          {
            frame_id: ids[0],
            branch_id: 2,
            head_hash: "head",
            relations: ids[0] === 1 ? [relation] : [],
            classes: [definition],
            selectable_class_ids: [1],
          },
        ]),
      ),
  );
  const loader = new RelationLoader({
    views: { bulkGetLabelData },
  } as unknown as SceneContext<EditorWindowMapper>);
  const first = { id: 1, label_branch_id: 2 } as EditableFrame;
  const second = { id: 2, label_branch_id: 2 } as EditableFrame;
  const labels = await loader.getData(first);
  expect(loader.isCached(second)).toBe(false);
  expect((await loader.getData(second)).relations.size).toBe(0);
  expect(labels.relations.size).toBe(1);
  expect(bulkGetLabelData).toHaveBeenCalledTimes(2);
  loader.dispose();
});

it("deletes attached relations from cached frames and restores them on undo", async () => {
  const { RelationLoader } = await import("../../../app/editor/RelationView");
  const bulkGetLabelData = vi.fn(
    async (_type: string, ids: number[]) =>
      new Response(
        JSON.stringify([
          {
            frame_id: ids[0],
            branch_id: 2,
            head_hash: "head",
            relations: [relation],
            classes: [definition],
            selectable_class_ids: [1],
          },
        ]),
      ),
  );
  const loader = new RelationLoader({
    views: { bulkGetLabelData },
  } as unknown as SceneContext<EditorWindowMapper>);
  const first = { id: 1, label_branch_id: 2 } as EditableFrame;
  const second = { id: 2, label_branch_id: 2 } as EditableFrame;
  const left = await loader.getData(first);
  const right = await loader.getData(second);
  const effect = await loader.deletionEffect(second, [source]);
  effect.apply();
  expect(left.relations.size).toBe(0);
  expect(right.relations.size).toBe(0);
  const later = await loader.getData({
    id: 3,
    label_branch_id: 2,
  } as EditableFrame);
  expect(later.get(relation.id)).toBeUndefined();
  effect.undo();
  expect(left.get(relation.id)).toEqual(relation);
  expect(right.get(relation.id)).toEqual(relation);
  expect(later.get(relation.id)).toEqual(relation);
  expect(bulkGetLabelData).toHaveBeenCalledTimes(3);
  loader.dispose();
});

it.each([false, true])(
  "keeps unseen attached relations deleted across loads, undo, and redo (in flight: %s)",
  async (inFlight) => {
    const { RelationLoader } = await import("../../../app/editor/RelationView");
    let releaseResponse!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const loader = new RelationLoader({
      views: {
        bulkGetLabelData: async (_type: string, ids: number[]) => {
          if (ids[0] === 2) await responseReady;
          return new Response(
            JSON.stringify([
              {
                frame_id: ids[0],
                branch_id: ids[0] === 4 ? 3 : 2,
                head_hash: "head",
                relations: ids[0] === 1 ? [] : [relation],
                classes: [definition],
                selectable_class_ids: [1],
              },
            ]),
          );
        },
      },
    } as unknown as SceneContext<EditorWindowMapper>);
    const frame = (id: number) => ({ id, label_branch_id: 2 }) as EditableFrame;
    try {
      const effect = await loader.deletionEffect(frame(1), [source]);
      const pending = inFlight ? loader.getData(frame(2)) : null;
      effect.apply();
      releaseResponse();
      const later = await (pending ?? loader.getData(frame(2)));
      expect(later.get(relation.id)).toBeUndefined();
      const otherBranch = await loader.getData({
        id: 4,
        label_branch_id: 3,
      } as EditableFrame);
      expect(otherBranch.get(relation.id)).toEqual(relation);
      effect.undo();
      expect(later.get(relation.id)).toEqual(relation);
      effect.apply();
      expect(later.get(relation.id)).toBeUndefined();
      const afterRedo = await loader.getData(frame(3));
      expect(afterRedo.get(relation.id)).toBeUndefined();
      effect.undo();
      expect(later.get(relation.id)).toEqual(relation);
      expect(afterRedo.get(relation.id)).toEqual(relation);
    } finally {
      loader.dispose();
    }
  },
);

it("shares edits and history across cached and subsequently loaded frames, isolated by branch", async () => {
  const { RelationLoader } = await import("../../../app/editor/RelationView");
  let branchId = 2;
  const loader = new RelationLoader({
    views: {
      bulkGetLabelData: vi.fn(
        async (_type: string, ids: number[]) =>
          new Response(
            JSON.stringify([
              {
                frame_id: ids[0],
                branch_id: branchId,
                head_hash: "head",
                relations: [relation],
                classes: [definition],
                selectable_class_ids: [1],
              },
            ]),
          ),
      ),
    },
  } as unknown as SceneContext<EditorWindowMapper>);
  const frame = (id: number) =>
    ({ id, label_branch_id: branchId }) as EditableFrame;
  try {
    const first = await loader.getData(frame(1));
    const second = await loader.getData(frame(2));
    const change = new RelationOperation(first, "update", {
      ...relation,
      relation_class_id: 2,
    });
    change.applyLocal();
    expect(second.get(relation.id)?.relation_class_id).toBe(2);
    const third = await loader.getData(frame(3));
    expect(third.get(relation.id)?.relation_class_id).toBe(2);
    change.undoLocal();
    expect(second.get(relation.id)).toEqual(relation);
    expect(third.get(relation.id)).toEqual(relation);
    change.applyLocal();
    const deletion = new RelationOperation(second, "delete", relation);
    deletion.applyLocal();
    expect(first.get(relation.id)).toBeUndefined();
    expect(third.get(relation.id)).toBeUndefined();
    const fourth = await loader.getData(frame(4));
    expect(fourth.get(relation.id)).toBeUndefined();
    deletion.undoLocal();
    expect(first.get(relation.id)?.relation_class_id).toBe(2);
    expect(fourth.get(relation.id)?.relation_class_id).toBe(2);
    const create = new RelationOperation(first, "create", relation);
    create.applyLocal();
    expect(second.get(create.opResult!)).toMatchObject({ source, target });
    const fifth = await loader.getData(frame(5));
    expect(fifth.get(create.opResult!)).toMatchObject({ source, target });
    create.undoLocal();
    expect(second.get(create.opResult!)).toBeUndefined();
    expect(fifth.get(create.opResult!)).toBeUndefined();
    branchId = 3;
    expect((await loader.getData(frame(1))).get(relation.id)).toEqual(relation);
  } finally {
    loader.dispose();
  }
});

it("saves relation creation and edits, then uses the resolved ID for a later deletion", async () => {
  const state = LabelsetBranchState.fromJSON({
    id: 2,
    group: { id: 1, name: "labels" },
    name: "main",
    head: {
      group: { id: 1, name: "labels" },
      hash_: "head",
      author_id: 1,
      timestamp: "2026-08-13T00:00:00Z",
      op_config: { op_name: "open-editor", op_params: null },
    },
  });
  class TestBranch extends EditableBranch {
    constructor(views: EditorViews) {
      super(views, state);
    }
  }
  const push = vi.fn().mockResolvedValue({
    op_results: [relation.id, null],
    branch: state,
  });
  const branch = new TestBranch({
    pushCommits: push,
    getCommitGraph: vi.fn().mockResolvedValue(null),
  } as unknown as EditorViews);
  const data = new RelationIndex([], [definition], [1]);
  const create = new RelationOperation(data, "create", relation);
  await branch.apply(create);
  const created = data.get(create.opResult!)!;
  await branch.apply(
    new RelationOperation(data, "update", {
      ...created,
      source: target,
      target: source,
    }),
  );
  await branch.pushActive(1);
  const first = push.mock.calls[0][2] as PushCommitsData;
  expect(first.placeholder_keys).toEqual([create.opResult!.wireKey]);
  expect(first.commits[0].result_placeholder_key).toBe(
    create.opResult!.wireKey,
  );
  expect(first.commits[1].op_params).toMatchObject({
    relation_id: create.opResult!.wireKey,
    source: target,
    target: source,
  });
  expect(data.get(relation.id)).toMatchObject({
    source: target,
    target: source,
  });
  await branch.apply(
    new RelationOperation(data, "delete", data.get(relation.id)!),
  );
  push.mockResolvedValueOnce({ op_results: [null], branch: state });
  await branch.pushActive(1);
  const second = push.mock.calls[1][2] as PushCommitsData;
  expect(second.placeholder_keys).toEqual([]);
  expect(second.commits[0].op_params).toEqual({ relation_id: relation.id });
  expect(data.relations.size).toBe(0);
});
