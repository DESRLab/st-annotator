import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  AssistedSelectionEditControl,
  type PromptedData,
} from "../app/editor/scene/controls/AssistedSelectionEditControl.tsx";
import { DrawSelectionState } from "../app/editor/scene/layer/DrawSelectionState";
import { NavigationState } from "../app/editor/scene/layer/NavigationState";
import type {
  PointPrompter,
  PointPrompterEventMap,
} from "../app/editor/scene/tools/PointPrompter";

import {
  createInteractContextFixture,
  createLoadedIndex,
  createSelectionFixture,
  FRAME_ID,
} from "./app/editor/scene/layer/interactContextFixture";

/**
 * A stand-in for {@link PointPrompter} that only needs to dispatch prompt
 * events; the control under test merely listens for its `end` event.
 */
class StubPointPrompter extends THREE.EventDispatcher<PointPrompterEventMap> {
  abort(): void {
    /* there is no in-progress prompt to abort in tests */
  }
}

function makeControl(): {
  control: AssistedSelectionEditControl;
  prompter: StubPointPrompter;
} {
  const prompter = new StubPointPrompter();
  const control = new AssistedSelectionEditControl(
    prompter as unknown as PointPrompter,
  );

  return { control, prompter };
}

/**
 * Prompts one point and returns the labels carried by the resulting creation.
 */
function promptedLabels(
  control: AssistedSelectionEditControl,
  prompter: StubPointPrompter,
  label: number,
): number[] {
  let created: PromptedData | null = null;
  const onCreate = (event: { promptData: PromptedData }): void => {
    created = event.promptData;
  };
  control.addEventListener("create", onCreate);

  prompter.dispatchEvent({
    type: "end",
    vertex: new THREE.Vector3(0, 0, 0),
    label: label,
  });

  control.removeEventListener("create", onCreate);
  control.dispose();

  expect(
    created,
    "a selection creation should have been dispatched",
  ).to.not.equal(null);

  return [...(created as unknown as PromptedData).labels];
}

describe("AssistedSelectionEditControl prompt labels", () => {
  it("sends the foreground label for left-click prompts in foreground mode", () => {
    const { control, prompter } = makeControl();

    expect(promptedLabels(control, prompter, 1)).to.deep.equal([1]);
  });

  it("keeps the background label for right-click prompts in foreground mode", () => {
    const { control, prompter } = makeControl();

    expect(promptedLabels(control, prompter, 0)).to.deep.equal([0]);
  });

  it("sends a background label for left-click prompts in background mode", () => {
    const { control, prompter } = makeControl();
    control.onPromptModeInputChange({ promptMode: "background" });

    expect(promptedLabels(control, prompter, 1)).to.deep.equal([0]);
  });

  it("keeps the background label for right-click prompts in background mode", () => {
    const { control, prompter } = makeControl();
    control.onPromptModeInputChange({ promptMode: "background" });

    expect(promptedLabels(control, prompter, 0)).to.deep.equal([0]);
  });

  it("sends every accumulated point and label in each prediction checkpoint", () => {
    const { control, prompter } = makeControl();
    const checkpoints: PromptedData[] = [];
    control.addEventListener("create", (event) =>
      checkpoints.push(event.promptData),
    );

    prompter.dispatchEvent({
      type: "end",
      vertex: new THREE.Vector3(1, 2, 3),
      label: 1,
    });
    prompter.dispatchEvent({
      type: "end",
      vertex: new THREE.Vector3(4, 5, 6),
      label: 0,
    });

    expect(checkpoints[0].labels).to.deep.equal([1]);
    expect(checkpoints[0].points).to.have.length(1);
    expect(checkpoints[1].labels).to.deep.equal([1, 0]);
    expect(checkpoints[1].points).to.have.length(2);
    // The second click must not mutate the first in-flight request payload.
    expect(checkpoints[0].labels).to.deep.equal([1]);
    control.dispose();
  });
});

/**
 * A point cloud whose assistant encoding has already finished, with just
 * enough surface for the draw state's create/update handlers. Its identity is
 * the layer's "frame generation": replacing it models navigating to another
 * frame/project.
 */
function makePointCloudUtils(id: string) {
  return {
    id,
    whenEncoded: vi.fn().mockResolvedValue(true),
    buffer: { getCoords: () => [] as THREE.Vector3[] },
    pointsInNDC: [] as THREE.Vector3[],
    pointSize: 1,
    maskLogits: null as Float32Array | null,
    filterMaskLogitsByThreshold: vi.fn(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 1, 1),
    ]),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets every pending microtask (and chained `await`) run to completion. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makePromptData(): PromptedData {
  return {
    points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)],
    labels: [1, 1],
  };
}

/**
 * Enters the assistant draw state over the interaction-context fixture, with a
 * loaded label index and an encoded point cloud, so the assisted create/update
 * handlers are enabled.
 */
function setupAssistantDraw() {
  const fixture = createInteractContextFixture();
  const utils = makePointCloudUtils("frame-A");
  fixture.setPointCloudUtils(utils);
  fixture.dataView.data = createLoadedIndex();
  fixture.applyLayerGate(true);
  fixture.context.useAssistant = true;
  fixture.context.setAction("draw");
  return { ...fixture, utils };
}

describe("assistant result after context changes (generation guard)", () => {
  it("enters the draw state with the assistant enabled", () => {
    const { context } = setupAssistantDraw();
    expect(context.disabled).toBe(false);
    expect(context.currentState).toBeInstanceOf(DrawSelectionState);
  });

  it("discards a pending assistant result after the frame changed", async () => {
    const { context, dataView, setPointCloudUtils } = setupAssistantDraw();
    const predict = deferred<Float32Array | null>();
    dataView.predictMask.mockReturnValue(predict.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();
    expect(dataView.predictMask).toHaveBeenCalledTimes(1);

    // The frame changes: the point cloud is replaced mid-prediction.
    setPointCloudUtils(makePointCloudUtils("frame-B"));

    // The old request resolves late; its mask must be discarded.
    predict.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelInstance).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
  });

  it("discards a pending assistant result after a project/branch change", async () => {
    const { context, dataView, setPointCloudUtils } = setupAssistantDraw();
    const predict = deferred<Float32Array | null>();
    dataView.predictMask.mockReturnValue(predict.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();

    // Project/branch change: the point cloud is replaced and the labels
    // of the old branch are gone.
    setPointCloudUtils(makePointCloudUtils("project-B"));
    dataView.selections.clear();

    predict.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    expect(dataView.selections.size).toBe(0);
  });

  it("discards a pending assistant result when the layer is disabled", async () => {
    const { context, dataView, applyLayerGate } = setupAssistantDraw();
    const predict = deferred<Float32Array | null>();
    dataView.predictMask.mockReturnValue(predict.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();
    expect(dataView.predictMask).toHaveBeenCalledTimes(1);

    // The layer is disabled (another layer activated); the point cloud is
    // untouched, only the interaction state changes.
    applyLayerGate(false);
    expect(context.disabled).toBe(true);
    expect(context.currentState).toBeInstanceOf(NavigationState);

    predict.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelInstance).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
  });

  it("discards a pending assistant result after the user cancels", async () => {
    const { context, dataView, key } = setupAssistantDraw();
    const predict = deferred<Float32Array | null>();
    dataView.predictMask.mockReturnValue(predict.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();
    expect(dataView.predictMask).toHaveBeenCalledTimes(1);

    // The user cancels the creation (Escape) before the mask arrives.
    key("escape");
    expect(context.currentState).toBeInstanceOf(NavigationState);

    predict.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelInstance).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
  });

  it("does not duplicate the selection when a duplicate create races an in-flight one", async () => {
    const { context, dataView } = setupAssistantDraw();
    dataView.predictMask.mockResolvedValue(new Float32Array([0.9, 0.9]));

    const create =
      context.currentState!.getUsage(false).assistedSelectionController!
        .create!;
    create({ promptData: makePromptData(), maskThreshold: 0.5 });
    // A racing duplicate of the same creation, before the first settles:
    // it must not start a second prediction nor a second selection.
    create({ promptData: makePromptData(), maskThreshold: 0.5 });
    await flush();

    expect(dataView.predictMask).toHaveBeenCalledTimes(1);
    expect(dataView.addLabelInstance).toHaveBeenCalledTimes(1);
    expect(dataView.addLabelSelection).toHaveBeenCalledTimes(1);
  });

  it("lets a distinct newer create supersede an in-flight one (latest request wins)", async () => {
    const { context, dataView } = setupAssistantDraw();
    const predictOlder = deferred<Float32Array | null>();
    const predictNewer = deferred<Float32Array | null>();
    dataView.predictMask
      .mockReturnValueOnce(predictOlder.promise)
      .mockReturnValueOnce(predictNewer.promise);

    const create =
      context.currentState!.getUsage(false).assistedSelectionController!
        .create!;
    create({ promptData: makePromptData(), maskThreshold: 0.5 });
    await flush();
    expect(dataView.predictMask).toHaveBeenCalledTimes(1);

    // A DIFFERENT prompt against the same point cloud is a distinct,
    // newer request: it must not be dropped as a duplicate; the older
    // result is discarded when it arrives late.
    const newerPrompt: PromptedData = {
      points: [new THREE.Vector3(5, 5, 5)],
      labels: [1],
    };
    create({ promptData: newerPrompt, maskThreshold: 0.5 });
    await flush();
    expect(dataView.predictMask).toHaveBeenCalledTimes(2);
    expect(dataView.predictMask.mock.calls[1][1]).toEqual([1]);

    predictOlder.resolve(new Float32Array([0.9, 0.9]));
    predictNewer.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    // Exactly one committed selection: from the newest request.
    expect(dataView.addLabelInstance).toHaveBeenCalledTimes(1);
    expect(dataView.addLabelSelection).toHaveBeenCalledTimes(1);
  });

  it("aborts the selection commit when the point cloud changes while the instance is being added", async () => {
    const { context, dataView, setPointCloudUtils } = setupAssistantDraw();
    dataView.predictMask.mockResolvedValue(new Float32Array([0.9, 0.9]));
    const instancePending = deferred<{
      id: string;
      gtClassId: number | null;
      gtClass: null;
      isBlack: boolean;
    }>();
    dataView.addLabelInstance.mockReturnValue(instancePending.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();
    expect(dataView.addLabelInstance).toHaveBeenCalledTimes(1);

    // The frame changes while the instance is being added: the selection
    // must not be accepted against the newly current data view.
    setPointCloudUtils(makePointCloudUtils("frame-B"));

    instancePending.resolve({
      id: "inst-1",
      gtClassId: 1,
      gtClass: null,
      isBlack: false,
    });
    await flush();

    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    // The local-only placeholder is cleaned up on the abort.
    expect(dataView.deleteLabelSelectionLocalOnly).toHaveBeenCalledTimes(1);
  });

  it("aborts the selection commit when the user cancels while the instance is being added", async () => {
    const { context, dataView, key } = setupAssistantDraw();
    dataView.predictMask.mockResolvedValue(new Float32Array([0.9, 0.9]));
    const instancePending = deferred<{
      id: string;
      gtClassId: number | null;
      gtClass: null;
      isBlack: boolean;
    }>();
    dataView.addLabelInstance.mockReturnValue(instancePending.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();
    expect(dataView.addLabelInstance).toHaveBeenCalledTimes(1);

    // The user cancels (Escape) while the instance is being added.
    key("escape");
    expect(context.currentState).toBeInstanceOf(NavigationState);

    instancePending.resolve({
      id: "inst-1",
      gtClassId: 1,
      gtClass: null,
      isBlack: false,
    });
    await flush();

    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    expect(dataView.deleteLabelSelectionLocalOnly).toHaveBeenCalledTimes(1);
  });

  it("lets the newest update win when an older prediction resolves late", async () => {
    const { context, dataView } = setupAssistantDraw();
    const selection = createSelectionFixture({ id: "sel-1" });
    dataView.selections.set("sel-1", selection);

    const predictOlder = deferred<Float32Array | null>();
    const predictNewer = deferred<Float32Array | null>();
    dataView.predictMask
      .mockReturnValueOnce(predictOlder.promise)
      .mockReturnValueOnce(predictNewer.promise);

    const update =
      context.currentState!.getUsage(false).assistedSelectionController!
        .update!;
    update({
      obj: selection,
      promptData: makePromptData(),
      mode: "add",
      maskThreshold: 0.5,
      predict: true,
    });
    await flush();
    update({
      obj: selection,
      promptData: makePromptData(),
      mode: "add",
      maskThreshold: 0.5,
      predict: true,
    });
    await flush();
    expect(dataView.predictMask).toHaveBeenCalledTimes(2);

    // Both predictions settle before either commit transitions the state;
    // only the newest request may edit the selection.
    predictNewer.resolve(new Float32Array([0.9, 0.9]));
    predictOlder.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    expect(dataView.updateLabelPointSelection).toHaveBeenCalledTimes(1);
  });

  it("does not surface a stale failure of a superseded request", async () => {
    const { context, dataView, setPointCloudUtils } = setupAssistantDraw();
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const predict = deferred<Float32Array | null>();
    dataView.predictMask.mockReturnValue(predict.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();

    // Supersede the request, then let it fail late.
    setPointCloudUtils(makePointCloudUtils("frame-B"));
    predict.resolve(null);
    await flush();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("still reports a failure of the current assistant request", async () => {
    const { context, dataView } = setupAssistantDraw();
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    dataView.predictMask.mockResolvedValue(null);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();

    expect(warnSpy).toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("creates exactly one selection when the context is unchanged", async () => {
    const { context, dataView } = setupAssistantDraw();
    dataView.predictMask.mockResolvedValue(new Float32Array([0.9, 0.9]));

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();

    expect(dataView.predictMask.mock.calls[0]?.[2]).toBe(FRAME_ID);
    expect(dataView.addLabelSelectionLocalOnly).toHaveBeenCalledTimes(1);
    expect(dataView.addLabelInstance).toHaveBeenCalledTimes(1);
    expect(dataView.addLabelSelection).toHaveBeenCalledTimes(1);
  });

  it("creates the instance with the class captured when the request was accepted", async () => {
    const { context, dataView } = setupAssistantDraw();
    // The class chosen when the request starts; a later change of the
    // selected class must not leak into the committed instance.
    const getInstanceParams = vi.spyOn(
      context.instanceInspector,
      "getInstanceParams",
    );
    getInstanceParams.mockReturnValue({ gtClassId: 7, isBlack: false });

    const predict = deferred<Float32Array | null>();
    dataView.predictMask.mockReturnValue(predict.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.create!({
      promptData: makePromptData(),
      maskThreshold: 0.5,
    });
    await flush();

    // The user switches the selected class while the prediction is in flight.
    getInstanceParams.mockReturnValue({ gtClassId: 9, isBlack: false });

    predict.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    expect(dataView.addLabelInstance).toHaveBeenCalledTimes(1);
    expect(dataView.addLabelInstance).toHaveBeenCalledWith({
      gtClassId: 7,
      isBlack: false,
    });
    getInstanceParams.mockRestore();
  });

  it("discards a pending assistant update after the frame changed", async () => {
    const { context, dataView, setPointCloudUtils } = setupAssistantDraw();
    const selection = createSelectionFixture({ id: "sel-1" });
    dataView.selections.set("sel-1", selection);

    const predict = deferred<Float32Array | null>();
    dataView.predictMask.mockReturnValue(predict.promise);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.update!({
      obj: selection,
      promptData: makePromptData(),
      mode: "add",
      maskThreshold: 0.5,
      predict: true,
    });
    await flush();
    expect(dataView.predictMask).toHaveBeenCalledTimes(1);

    setPointCloudUtils(makePointCloudUtils("frame-B"));

    predict.resolve(new Float32Array([0.9, 0.9]));
    await flush();

    expect(dataView.updateLabelPointSelection).not.toHaveBeenCalled();
  });

  it("commits an assistant update with the mode captured at dispatch", async () => {
    const { context, dataView } = setupAssistantDraw();
    const selection = createSelectionFixture({ id: "sel-1" });
    dataView.selections.set("sel-1", selection);
    dataView.predictMask.mockResolvedValue(new Float32Array([0.9, 0.9]));

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.update!({
      obj: selection,
      promptData: makePromptData(),
      mode: "erase",
      maskThreshold: 0.5,
      predict: true,
    });
    await flush();

    expect(dataView.updateLabelPointSelection).toHaveBeenCalledTimes(1);
    expect(dataView.updateLabelPointSelection).toHaveBeenCalledWith(
      selection,
      "erase",
      expect.anything(),
    );
  });

  it("refilters cached mask probabilities when only the threshold changes", async () => {
    const { context, dataView, utils } = setupAssistantDraw();
    const selection = createSelectionFixture({ id: "sel-1" });
    dataView.selections.set("sel-1", selection);
    utils.maskLogits = new Float32Array([0.9, 0.4]);

    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController!.update!({
      obj: selection,
      promptData: makePromptData(),
      mode: "add",
      maskThreshold: 0.8,
      predict: false,
    });
    await flush();

    expect(dataView.predictMask).not.toHaveBeenCalled();
    expect(utils.filterMaskLogitsByThreshold).toHaveBeenCalledWith(0.8);
    expect(dataView.updateLabelPointSelection).toHaveBeenCalledTimes(1);
  });
});
