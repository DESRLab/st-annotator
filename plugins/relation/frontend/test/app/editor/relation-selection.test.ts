import { EventDispatcher, Group, Object3D, Raycaster, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorLayerFactoryEnv, ScenePointerEvent } from "sta/app/editor";
import { Placeholder, LabelElementHighlights } from "sta/app/editor";
import { RelationIndex } from "../../../app/editor/RelationIndex";
import { RelationLayer } from "../../../app/editor/RelationLayer";
import { defaultRelationSettings } from "../../../app/editor/RelationSettings";
import { RelationOperation } from "../../../app/editor/RelationView";

const { pointer } = vi.hoisted(() => ({
  pointer: {
    current: null as EventDispatcher<{
      pointerdown: ScenePointerEvent;
      pointerup: ScenePointerEvent;
      pointermove: ScenePointerEvent;
      pointerleave: ScenePointerEvent;
    }> | null,
  },
}));

// Replace the live display and data-view hosts while exercising real layer
// selection, intents, snapshot mapping, and notifications.
vi.mock("sta/app/editor", async (importOriginal) => {
  const original = await importOriginal<typeof import("sta/app/editor")>();
  return {
    ...original,
    LabelDataLayer: class extends EventDispatcher<{ "render-request": {} }> {
      state = Object.assign(new EventDispatcher(), {
        enabled: true,
        isVisible: () => true,
      });
      objects = new Group();
      isActive = true;
      keydownHandler = { register: vi.fn() };
      setControlsSections = vi.fn();
      constructor(
        readonly context: EditorLayerFactoryEnv["context"],
        _name: string,
        readonly dataView: unknown,
      ) {
        super();
      }
      refreshHint() {}
      refreshObjects() {}
      requestRender() {
        this.dispatchEvent({ type: "render-request" });
      }
      dispose() {}
    },
    WindowPointer: class {
      createInteractor() {
        return (pointer.current = Object.assign(new EventDispatcher(), {
          dispose() {},
        }));
      }
      dispose() {}
    },
  };
});

vi.mock("../../../app/editor/RelationVisual", () => ({
  RelationVisual: class {
    objects = new Group();
    line = new Object3D();
    constructor(
      _source: Vector3,
      _target: Vector3,
      color: number,
      name: string,
      width: number,
      baseWidth: number,
      _bidirectional: boolean,
      tooltip: readonly { text: string; color: number }[],
    ) {
      this.objects.userData = {
        color,
        width,
        name,
        baseWidth,
        ...(name === "" ? {} : { tooltip }),
      };
    }
    setResolution() {}
    dispose() {}
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scene relation selection", () => {
  it("picks a target behind the source and restores source picking after cancellation", async () => {
    const source = { type: "box", id: "shared" };
    const target = { type: "vector", id: "shared" };
    const sourceRaycast = vi.fn(() => [
      { distance: 1, point: new Vector3(), object: new Object3D() },
    ]);
    const targetRaycast = vi.fn(() => [
      { distance: 2, point: new Vector3(), object: new Object3D() },
    ]);
    const labels = new RelationIndex(
      [],
      [{ id: 1, name: "supports", color_rgb: 0 }],
      [1],
    );
    const context = Object.assign(new EventDispatcher(), {
      display: { windows: { main: {} } },
      currentLabelBranch: null,
      currentFrame: null,
      isNavigating: false,
      config: { forLayer: () => undefined },
    });
    const layer = new RelationLayer({
      context,
      layers: {
        endpoints: {
          labelElementProvider: {
            setIsolation: vi.fn(),
            setHighlights: vi.fn(),
            visible: true,
            branch: null,
            subscribe: () => () => {},
            elements: () => [
              {
                reference: source,
                center: new Vector3(),
                objectClassName: null,
                raycast: sourceRaycast,
              },
              {
                reference: target,
                center: new Vector3(),
                objectClassName: null,
                raycast: targetRaycast,
              },
            ],
          },
        },
      },
    } as unknown as EditorLayerFactoryEnv);
    vi.spyOn(layer.dataView, "data", "get").mockReturnValue(labels);
    vi.spyOn(layer.dataView, "isLoading", "get").mockReturnValue(false);
    layer.dataView.dispatchEvent({ type: "afterload" });
    const write = vi.spyOn(layer.dataView, "write").mockResolvedValue();
    const intents = layer.createEditorIntents().relation;
    const click = () => {
      for (const type of ["pointerdown", "pointerup"] as const)
        pointer.current!.dispatchEvent({
          type,
          button: 0,
          pointerId: 1,
          clientX: 0,
          clientY: 0,
        } as ScenePointerEvent & { type: typeof type });
    };
    try {
      intents.setClass(1);
      intents.setMode("create");
      click();
      expect(layer.mapEditorSlice(null).firstEndpoint).not.toBeNull();
      sourceRaycast.mockClear();
      pointer.current!.dispatchEvent({
        type: "pointermove",
      } as ScenePointerEvent & { type: "pointermove" });
      click();
      await vi.waitFor(() =>
        expect(write).toHaveBeenCalledWith(
          "create",
          { source, target, relation_class_id: 1 },
          undefined,
        ),
      );
      expect(sourceRaycast).not.toHaveBeenCalled();
      expect(layer.mapEditorSlice(null).firstEndpoint).toBeNull();
      intents.setMode("create");
      click();
      expect(sourceRaycast).toHaveBeenCalled();
      intents.cancel();
      sourceRaycast.mockClear();
      intents.setMode("create");
      click();
      expect(sourceRaycast).toHaveBeenCalled();
    } finally {
      layer.dispose();
      layer.dataView.dispose();
    }
  });

  it("renders one grouped label and edits only the selected direction", async () => {
    const source = { type: "box", id: "source" };
    const target = { type: "vector", id: "target" };
    const replacement = { type: "selection", id: "replacement" };
    const forward = { id: "forward", source, target, relation_class_id: 1 };
    const reverse = {
      id: "reverse",
      source: target,
      target: source,
      relation_class_id: 2,
    };
    const labels = new RelationIndex(
      [forward, reverse],
      [
        { id: 1, name: "supports", color_rgb: 0 },
        { id: 2, name: "rests on", color_rgb: 0 },
      ],
      [1, 2],
    );
    const context = Object.assign(new EventDispatcher(), {
      display: { windows: { main: {} } },
      currentLabelBranch: null,
      currentFrame: null,
      isNavigating: false,
      config: { forLayer: () => undefined },
    });
    const layer = new RelationLayer({
      context,
      layers: {
        endpoints: {
          labelElementProvider: {
            setIsolation: vi.fn(),
            setHighlights: vi.fn(),
            visible: true,
            branch: null,
            subscribe: () => () => {},
            elements: () =>
              [source, target, replacement].map((reference) => ({
                reference,
                center: new Vector3(),
                objectClassName: null,
                raycast: () => [],
              })),
          },
        },
      },
    } as unknown as EditorLayerFactoryEnv);
    vi.spyOn(layer.dataView, "data", "get").mockReturnValue(labels);
    vi.spyOn(layer.dataView, "isLoading", "get").mockReturnValue(false);
    layer.dataView.dispatchEvent({ type: "afterload" });
    const write = vi
      .spyOn(layer.dataView, "write")
      .mockImplementation(async (mode, value) => {
        const operation = new RelationOperation(labels, mode, value);
        operation.applyLocal();
        return operation.opResult ?? undefined;
      });
    const intents = layer.createEditorIntents().relation;
    try {
      layer.render();
      expect(layer.objects.children).toHaveLength(1);
      expect(layer.mapEditorSlice(null).relations).toHaveLength(1);
      expect(layer.mapEditorSlice(null).relations[0].displayId).toBe(
        "forward / reverse",
      );
      intents.setSettings({ ...defaultRelationSettings, showTooltips: true });
      layer.render();
      expect(layer.objects.children[0].userData.name).toBe(
        "(supports) / (rests on)",
      );
      expect(layer.mapEditorSlice(null).relations[0].name).toBe(
        "(supports) / (rests on)",
      );
      labels.classes.set(3, { id: 3, name: "beside", color_rgb: 0x00ff00 });
      labels.set({ ...forward, id: "parallel-tooltip", relation_class_id: 3 });
      layer.render();
      expect(layer.objects.children[0].userData.name).toBe(
        "(supports / beside) / (rests on)",
      );
      expect(layer.mapEditorSlice(null).relations[0].name).toBe(
        "(supports / beside) / (rests on)",
      );
      expect(layer.objects.children[0].userData.tooltip).toEqual([
        { text: "(", color: 0xffffff },
        { text: "supports", color: 0 },
        { text: " / ", color: 0xffffff },
        { text: "beside", color: 0x00ff00 },
        { text: ")", color: 0xffffff },
        { text: " / ", color: 0xffffff },
        { text: "(", color: 0xffffff },
        { text: "rests on", color: 0 },
        { text: ")", color: 0xffffff },
      ]);
      labels.delete("parallel-tooltip");
      labels.classes.delete(3);
      intents.setSettings(defaultRelationSettings);
      intents.select("reverse");
      const hideBinding = vi
        .mocked(layer.keydownHandler.register)
        .mock.calls.map(([binding]) => binding)
        .find((binding) => binding.keyCombo === "h")!;
      expect(hideBinding.name).toBe("Toggle hide in scene");
      hideBinding.handler({ keyCombo: "h" } as never);
      expect(layer.mapEditorSlice(null).relations[0].hidden).toBe(true);
      layer.render();
      expect(layer.objects.children).toHaveLength(0);
      hideBinding.handler({ keyCombo: "h" } as never);
      expect(layer.mapEditorSlice(null).relations[0].hidden).toBe(false);
      layer.render();
      expect(layer.objects.children).toHaveLength(1);

      expect(layer.mapEditorSlice(null).classId).toBe(2);
      expect(layer.mapEditorSlice(null).relations[0].source).toBe(
        "vector target",
      );
      layer.render();
      expect(layer.objects.children[0].userData.color).toBe(0x0000ff);
      const historyEdit = new RelationOperation(labels, "update", {
        ...reverse,
        relation_class_id: 1,
      });
      historyEdit.applyLocal();
      expect(layer.mapEditorSlice(null).classId).toBe(1);
      historyEdit.undoLocal();
      expect(layer.mapEditorSlice(null).classId).toBe(2);
      historyEdit.applyLocal();
      expect(layer.mapEditorSlice(null).classId).toBe(1);
      historyEdit.undoLocal();
      intents.setClass(1);
      await vi.waitFor(() =>
        expect(labels.get("reverse")?.relation_class_id).toBe(1),
      );
      expect(write).toHaveBeenCalledWith(
        "update",
        { ...reverse, relation_class_id: 1 },
        ["relation_class_id"],
      );
      expect(labels.get("forward")).toBe(forward);
      await intents.add();
      expect(labels.relations.size).toBe(3);
      const added = [...labels.relations.values()].find(
        (item) => item.id !== forward.id && item.id !== reverse.id,
      )!;
      expect(added.source).toEqual(reverse.source);
      expect(added.target).toEqual(reverse.target);
      expect(layer.mapEditorSlice(null).relations[0].records).toHaveLength(3);
      expect(layer.mapEditorSlice(null).selectedId).toBe(
        (added.id as Placeholder<string>).wireKey,
      );
      intents.setClass(2);
      await vi.waitFor(() =>
        expect(labels.get(added.id)?.relation_class_id).toBe(2),
      );
      expect(labels.get("reverse")?.relation_class_id).toBe(1);
      expect(labels.get("forward")).toBe(forward);
      await intents.remove();
      expect(labels.get(added.id)).toBeUndefined();
      expect(layer.mapEditorSlice(null).selectedId).toBe("reverse");
      expect(layer.mapEditorSlice(null).endpoints).toHaveLength(3);
      const count = write.mock.calls.length;
      intents.replaceEndpoint("source", "box source");
      intents.replaceEndpoint("source", "box missing");
      expect(write).toHaveBeenCalledTimes(count);
      intents.replaceEndpoint("source", "selection replacement");
      await vi.waitFor(() =>
        expect(labels.get("reverse")?.source).toEqual(replacement),
      );
      expect(write).toHaveBeenLastCalledWith(
        "update",
        expect.objectContaining({ source: replacement }),
        ["source"],
      );
      expect(labels.get("forward")).toBe(forward);
      expect(layer.mapEditorSlice(null).relations).toHaveLength(2);
      intents.replaceEndpoint("target", "vector target");
      await vi.waitFor(() =>
        expect(labels.get("reverse")?.target).toEqual(target),
      );
      expect(write).toHaveBeenLastCalledWith(
        "update",
        expect.objectContaining({ target }),
        ["target"],
      );
      expect(labels.get("forward")).toBe(forward);
      await intents.remove();
      expect(labels.get("reverse")).toBeUndefined();
      expect(labels.get("forward")).toBe(forward);
      expect(layer.mapEditorSlice(null).relations).toHaveLength(1);
      intents.select(null);
      intents.setClass(2, "forward");
      await vi.waitFor(() =>
        expect(labels.get("forward")?.relation_class_id).toBe(2),
      );
      expect(layer.mapEditorSlice(null).selectedId).toBe("forward");
      const writes = write.mock.calls.length;
      intents.setClass(1, "missing");
      expect(write).toHaveBeenCalledTimes(writes);
    } finally {
      layer.dispose();
      layer.dataView.dispose();
    }
  });
  it.each([true, false])(
    "synchronizes the picker when the selected class is selectable: %s",
    async (selectable) => {
      const source = { type: "box", id: "source" };
      const target = { type: "vector", id: "target" };
      const relation = { id: "relation", source, target, relation_class_id: 2 };
      const labels = new RelationIndex(
        [relation],
        [
          { id: 1, name: "first", color_rgb: 0 },
          { id: 2, name: "second", color_rgb: 0 },
        ],
        selectable ? [1, 2] : [1],
      );
      const context = Object.assign(new EventDispatcher(), {
        display: { windows: { main: {} } },
        currentLabelBranch: null,
        currentFrame: null,
        isNavigating: false,
        config: { forLayer: () => undefined },
      });
      let sourceClassName: string | null = "Chair";
      let pickedId: string | null = null;
      let onEndpointChange = () => {};
      const highlights = new LabelElementHighlights("box", () =>
        onEndpointChange(),
      );
      const provider = {
        setIsolation: vi.fn(),
        setHighlights: vi.fn((owner, elements, color) =>
          highlights.set(owner, elements, color),
        ),
        visible: true,
        branch: null,
        subscribe: (listener: () => void) => {
          onEndpointChange = listener;
          return () => {
            onEndpointChange = () => {};
          };
        },
        elements: () =>
          [source, target].map((reference) => ({
            reference,
            objectClassName: reference === source ? sourceClassName : "Road",
            center: new Vector3(),
            raycast: () =>
              reference.id === pickedId
                ? [
                    {
                      distance: 1,
                      point: new Vector3(),
                      object: new Object3D(),
                    },
                  ]
                : [],
          })),
      };
      const layer = new RelationLayer({
        context,
        layers: { endpoints: { labelElementProvider: provider } },
      } as unknown as EditorLayerFactoryEnv);
      const data = vi
        .spyOn(layer.dataView, "data", "get")
        .mockReturnValue(labels);
      vi.spyOn(layer.dataView, "isLoading", "get").mockReturnValue(false);
      layer.dataView.dispatchEvent({ type: "afterload" });
      const write = vi.spyOn(layer.dataView, "write").mockResolvedValue();
      const intents = layer.createEditorIntents().relation;
      intents.setClass(1);
      layer.render();
      vi.spyOn(Raycaster.prototype, "intersectObject").mockReturnValue([
        { distance: 1, point: new Vector3(), object: new Object3D() },
      ]);
      const notified = vi.fn();
      const unsubscribe = layer.subscribeEditorSlice(notified);
      try {
        const click = () => {
          for (const type of ["pointerdown", "pointerup"] as const)
            pointer.current!.dispatchEvent({
              type,
              button: 0,
              pointerId: 1,
              clientX: 0,
              clientY: 0,
            } as ScenePointerEvent & { type: typeof type });
        };
        expect(layer.mapEditorSlice(null).mode).toBe("edit");
        const toggleTooltips = vi
          .mocked(layer.keydownHandler.register)
          .mock.calls.find(([binding]) => binding.keyCombo === "t")?.[0];
        expect(toggleTooltips).toBeDefined();
        const sections = vi
          .mocked(layer.setControlsSections)
          .mock.calls.at(-1)?.[0];
        expect(
          sections?.find((section) => section.title === "Preferences")
            ?.keybinds,
        ).toEqual([toggleTooltips]);
        expect(sections?.flatMap((section) => section.keybinds)).toEqual(
          vi
            .mocked(layer.keydownHandler.register)
            .mock.calls.map(([binding]) => binding),
        );
        const toggle = toggleTooltips!.handler as () => void;
        toggle();
        expect(layer.mapEditorSlice(null).settings.showTooltips).toBe(true);
        layer.render();
        expect(layer.objects.children[0].userData.name).toBe("(second)");
        expect(notified).toHaveBeenCalled();
        toggle();
        expect(layer.mapEditorSlice(null).settings.showTooltips).toBe(false);
        layer.render();
        expect(layer.objects.children[0].userData.name).toBe("");
        click();
        expect(layer.mapEditorSlice(null).selectedId).toBeNull();
        expect(layer.mapEditorSlice(null).firstEndpoint).toBeNull();
        intents.setMode("create");
        intents.cancel();
        expect(layer.mapEditorSlice(null).mode).toBe("edit");
        intents.setMode("select");
        const move = () =>
          pointer.current!.dispatchEvent({
            type: "pointermove",
          } as ScenePointerEvent & { type: "pointermove" });
        move();
        expect(layer.mapEditorSlice(null).hoveredId).toBe("relation");
        expect(provider.setHighlights).toHaveBeenLastCalledWith(layer, [
          source,
          target,
        ]);
        expect(highlights.has(source.id)).toBe(true);
        provider.visible = false;
        onEndpointChange();
        expect(highlights.has(source.id)).toBe(false);
        expect(layer.mapEditorSlice(null).hoveredId).toBeNull();
        provider.visible = true;
        onEndpointChange();
        layer.render();
        move();
        expect(highlights.has(source.id)).toBe(true);
        layer.render();
        expect(layer.objects.children[0].userData).toEqual({
          color: 0xff0000,
          width: 3.2,
          baseWidth: 2,
          name: "",
        });
        const settings = {
          ...defaultRelationSettings,
          hoverColor: { r: 0, g: 1, b: 0 },
          lineWidth: 10,
          showTooltips: true,
        };
        intents.setSettings(settings);
        expect(layer.mapEditorSlice(null).settings).toEqual(settings);
        layer.render();
        expect(layer.objects.children[0].userData).toEqual({
          color: 0x00ff00,
          width: 16,
          baseWidth: 10,
          name: "(second)",
          tooltip: [
            { text: "(", color: 0xffffff },
            { text: "second", color: 0 },
            { text: ")", color: 0xffffff },
          ],
        });
        intents.setSettings(defaultRelationSettings);
        layer.render();
        const count = notified.mock.calls.length;
        move();
        expect(notified).toHaveBeenCalledTimes(count);
        pointer.current!.dispatchEvent({
          type: "pointerleave",
        } as ScenePointerEvent & { type: "pointerleave" });
        expect(layer.mapEditorSlice(null).hoveredId).toBeNull();
        expect(provider.setHighlights).toHaveBeenLastCalledWith(layer, []);
        layer.render();
        expect(layer.objects.children[0].userData).toEqual({
          color: 0,
          width: 2,
          baseWidth: 2,
          name: "",
        });
        move();
        intents.cancel();
        expect(layer.mapEditorSlice(null).hoveredId).toBeNull();
        expect(provider.setHighlights).toHaveBeenLastCalledWith(layer, []);
        move();
        expect(layer.mapEditorSlice(null).hoveredId).toBeNull();
        expect(provider.setHighlights).toHaveBeenLastCalledWith(layer, []);
        intents.setMode("select");
        pointer.current!.dispatchEvent({
          type: "pointerdown",
          button: 0,
          pointerId: 1,
          clientX: 0,
          clientY: 0,
        } as ScenePointerEvent & { type: "pointerdown" });
        pointer.current!.dispatchEvent({
          type: "pointerup",
          button: 0,
          pointerId: 1,
          clientX: 0,
          clientY: 0,
        } as ScenePointerEvent & { type: "pointerup" });
        expect(layer.mapEditorSlice(null).selectedId).toBe("relation");
        layer.render();
        expect(layer.objects.children[0].userData.color).toBe(0x0000ff);
        intents.setSettings({
          ...defaultRelationSettings,
          selectColor: { r: 0, g: 1, b: 1 },
        });
        layer.render();
        expect(layer.objects.children[0].userData.color).toBe(0x00ffff);
        intents.setMode("select");
        move();
        layer.render();
        expect(layer.objects.children[0].userData.color).toBe(0x00ffff);
        intents.cancel();
        const snapshot = layer.mapEditorSlice(null);
        expect(snapshot.relations[0].sourceClassName).toBe("Chair");
        expect(snapshot.relations[0].targetClassName).toBe("Road");
        provider.visible = false;
        sourceClassName = "Table";
        onEndpointChange();
        const changed = layer.mapEditorSlice(snapshot);
        expect(changed.relations[0].sourceClassName).toBe("Table");
        expect(changed.relations[0].visible).toBe(false);
        sourceClassName = null;
        onEndpointChange();
        expect(
          layer.mapEditorSlice(changed).relations[0].sourceClassName,
        ).toBeNull();
        provider.visible = true;
        onEndpointChange();
        expect(layer.mapEditorSlice(null).mode).toBe("edit");
        expect(layer.mapEditorSlice(null).hoveredId).toBeNull();
        expect(provider.setHighlights).toHaveBeenLastCalledWith(layer, []);
        expect(layer.mapEditorSlice(null).classId).toBe(selectable ? 2 : null);
        expect(notified).toHaveBeenCalled();
        intents.setClass(1);
        expect(write).toHaveBeenCalledWith(
          "update",
          { ...relation, relation_class_id: 1 },
          ["relation_class_id"],
        );
        const deleteBinding = vi
          .mocked(layer.keydownHandler.register)
          .mock.calls.find(([binding]) => binding.keyCombo === "delete")?.[0];
        expect(deleteBinding).toBeDefined();
        const deleteRelation = deleteBinding!.handler as () => void;
        deleteRelation();
        expect(write).toHaveBeenLastCalledWith("delete", relation, undefined);
        const create = new RelationOperation(labels, "create", relation);
        create.applyLocal();
        const pendingId = create.opResult!;
        const pendingSnapshot = layer.mapEditorSlice(null);
        expect(
          pendingSnapshot.relations.find((item) =>
            item.records?.some(
              (direction) => direction.id === pendingId.wireKey,
            ),
          )?.displayId,
        ).toContain(pendingId.wireKey);
        pendingId.put("saved-relation");
        await Promise.resolve();
        const savedSnapshot = layer.mapEditorSlice(pendingSnapshot);
        expect(savedSnapshot).not.toBe(pendingSnapshot);
        expect(
          savedSnapshot.relations.find((item) =>
            item.records?.some(
              (direction) => direction.id === pendingId.wireKey,
            ),
          )?.displayId,
        ).toContain("saved-relation");
        intents.setMode("create");
        pickedId = "source";
        move();
        click();
        expect(highlights.color(source.id)).toEqual({ r: 1, g: 1, b: 0 });
        intents.cancel();
        expect(highlights.color(source.id)).toBeNull();
        expect(highlights.has(source.id)).toBe(false);
        const createdId = new Placeholder<string>();
        write.mockImplementationOnce(async (_mode, value) => {
          labels.set({ ...value, id: createdId });
          return createdId;
        });
        intents.setMode("create");
        pickedId = "source";
        move();
        expect(highlights.color(source.id)).toEqual({ r: 1, g: 1, b: 0 });
        click();
        pickedId = "target";
        move();
        expect(provider.setHighlights).toHaveBeenLastCalledWith(
          layer,
          [source, target],
          { r: 1, g: 1, b: 0 },
        );
        pointer.current!.dispatchEvent({
          type: "pointerleave",
        } as ScenePointerEvent & { type: "pointerleave" });
        expect(highlights.color(source.id)).toEqual({ r: 1, g: 1, b: 0 });
        expect(provider.setHighlights).toHaveBeenLastCalledWith(
          layer,
          [source],
          { r: 1, g: 1, b: 0 },
        );
        move();
        click();
        expect(write).toHaveBeenLastCalledWith(
          "create",
          { source, target, relation_class_id: 1 },
          undefined,
        );
        await vi.waitFor(() =>
          expect(layer.mapEditorSlice(null).selectedId).toBe(createdId.wireKey),
        );
        expect(layer.mapEditorSlice(null).mode).toBe("edit");
        expect(highlights.color(source.id)).toBeNull();

        let finish!: () => void;
        write.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(new Placeholder<string>());
            }),
        );
        intents.setMode("create");
        pickedId = "source";
        click();
        pickedId = "target";
        click();
        data.mockReturnValue(
          new RelationIndex(
            [{ ...relation, id: "other-frame" }],
            [...labels.classes.values()],
            [1],
          ),
        );
        layer.dataView.dispatchEvent({ type: "afterload" });
        intents.select("other-frame");
        const otherFrame = layer.mapEditorSlice(null);
        finish();
        await vi.waitFor(() => {
          const snapshot = layer.mapEditorSlice(otherFrame);
          expect(snapshot.version).toBeGreaterThan(otherFrame.version);
          expect(snapshot.selectedId).toBe("other-frame");
        });
        const previousIndex = layer.dataView.data!;
        let finishDelete!: () => void;
        write.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishDelete = () => {
                previousIndex.delete("other-frame");
                resolve();
              };
            }),
        );
        const deleting = intents.remove();
        data.mockReturnValue(
          new RelationIndex(
            [{ ...relation, id: "next-frame" }],
            [...labels.classes.values()],
            [1],
          ),
        );
        layer.dataView.dispatchEvent({ type: "afterload" });
        intents.select("next-frame");
        finishDelete();
        await deleting;
        expect(layer.mapEditorSlice(null).selectedId).toBe("next-frame");
        intents.setMode("select");
        layer.render();
        move();
        expect(highlights.has(source.id)).toBe(true);
      } finally {
        unsubscribe();
        layer.dispose();
        expect(highlights.has(source.id)).toBe(false);
        layer.dataView.dispose();
      }
    },
  );
});

it("cycles grouped relations with Tab, isolates their endpoints, wraps, and restores on exit", () => {
  const a = { type: "box", id: "a" };
  const b = { type: "vector", id: "b" };
  const c = { type: "selection", id: "c" };
  const missing = { type: "box", id: "outside-frame" };
  const labels = new RelationIndex(
    [
      { id: "first", source: a, target: b, relation_class_id: 1 },
      { id: "parallel", source: b, target: a, relation_class_id: 1 },
      { id: "second", source: b, target: c, relation_class_id: 1 },
      { id: "outside", source: a, target: missing, relation_class_id: 1 },
    ],
    [{ id: 1, name: "touches", color_rgb: 0 }],
    [1],
  );
  const context = Object.assign(new EventDispatcher(), {
    display: { windows: { main: {} } },
    currentLabelBranch: null,
    currentFrame: null,
    isNavigating: false,
    config: { forLayer: () => undefined },
  });
  const setIsolation = vi.fn();
  let endpointElements = [a, b, c];
  let endpointChanged = () => {};
  const layer = new RelationLayer({
    context,
    layers: {
      endpoints: {
        labelElementProvider: {
          branch: null,
          visible: true,
          setIsolation,
          setHighlights: vi.fn(),
          subscribe: (listener: () => void) => {
            endpointChanged = listener;
            return () => {};
          },
          elements: () =>
            endpointElements.map((reference) => ({
              reference,
              center: new Vector3(),
              objectClassName: null,
              raycast: () => [],
            })),
        },
      },
    },
  } as unknown as EditorLayerFactoryEnv);
  vi.spyOn(layer.dataView, "data", "get").mockReturnValue(labels);
  vi.spyOn(layer.dataView, "isLoading", "get").mockReturnValue(false);
  layer.dataView.dispatchEvent({ type: "afterload" });
  const write = vi.spyOn(layer.dataView, "write");
  const press = (key: string) => {
    const binding = vi
      .mocked(layer.keydownHandler.register)
      .mock.calls.map(([item]) => item)
      .find((item) => item.keyCombo === key)!;
    binding.handler({ keyCombo: key } as never);
  };
  const intents = layer.createEditorIntents().relation;
  try {
    intents.setHidden("first", true);
    intents.select("first");
    intents.setIsolation(true);
    expect(layer.mapEditorSlice(null).selectedId).toBe("first");
    intents.setIsolation(false);
    expect(layer.mapEditorSlice(null).cycling).toBe(false);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    intents.setIsolation(true);
    expect(layer.mapEditorSlice(null).selectedId).toBe("first");
    expect(layer.mapEditorSlice(null).cycling).toBe(true);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, [a, b]);
    layer.render();
    expect(layer.objects.children).toHaveLength(1);
    press("tab");
    expect(layer.mapEditorSlice(null).selectedId).toBe("second");
    expect(setIsolation).toHaveBeenLastCalledWith(layer, [b, c]);
    layer.render();
    expect(layer.objects.children).toHaveLength(1);
    press("tab");
    expect(layer.mapEditorSlice(null).selectedId).toBe("first");
    intents.select("second");
    expect(layer.mapEditorSlice(null).cycling).toBe(true);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, [b, c]);
    intents.select("first");
    press("escape");
    expect(layer.mapEditorSlice(null).cycling).toBe(false);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    layer.render();
    // The original hidden group stays hidden after isolation ends.
    expect(layer.objects.children).toHaveLength(1);
    expect(layer.mapEditorSlice(null).relations[0].hidden).toBe(true);
    press("tab");
    intents.setMode("create");
    expect(layer.mapEditorSlice(null).cycling).toBe(false);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    press("tab");
    layer.dataView.dispatchEvent({ type: "beforeload" });
    expect(layer.mapEditorSlice(null).cycling).toBe(false);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    layer.dataView.dispatchEvent({ type: "afterload" });
    press("tab");
    labels.delete(layer.mapEditorSlice(null).selectedId!);
    expect(layer.mapEditorSlice(null).cycling).toBe(false);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    press("tab");
    endpointElements = [a];
    endpointChanged();
    expect(layer.mapEditorSlice(null).cycling).toBe(false);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    endpointElements = [a, b, c];
    endpointChanged();
    press("tab");
    Object.defineProperty(layer, "isActive", {
      value: false,
      configurable: true,
    });
    context.dispatchEvent({ type: "layer-activate" } as never);
    expect(layer.mapEditorSlice(null).cycling).toBe(false);
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    Object.defineProperty(layer, "isActive", {
      value: true,
      configurable: true,
    });
    press("tab");
    expect(layer.mapEditorSlice(null).cycling).toBe(true);
    expect(write).not.toHaveBeenCalled();
  } finally {
    layer.dispose();
    expect(setIsolation).toHaveBeenLastCalledWith(layer, null);
    layer.dataView.dispose();
  }
});
