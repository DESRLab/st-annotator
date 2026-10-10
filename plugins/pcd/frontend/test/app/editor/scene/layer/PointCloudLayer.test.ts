import { describe, expect, it, vi } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import { DEFAULT_SETTINGS } from "../../../../../app/editor/config";
import { PointCloudLayer } from "../../../../../app/editor/scene/layer/PointCloudLayer.tsx";
import type { PointCloudSettingsInputtedData } from "../../../../../app/editor/scene/widgets/PointCloudSettingsPane.react.tsx";

const config = new EditorConfig(
  ProjectConfig.fromJSON({ frame_cache_size: 2 }),
);
const frame = {
  id: 9,
  task: { id: 1 },
  source_group_id: 2,
  st_bounds: {},
} as any;

/** The committed settings of setting A (the receiver defaults). */
const SETTINGS_A: PointCloudSettingsInputtedData = { ...DEFAULT_SETTINGS };

function pointResponse(
  values: number[],
  numPoints: number,
  numChannels: number,
  headers = ["x", "y", "z"],
) {
  return new Response(new Float32Array(values).buffer, {
    headers: {
      "X-Num-Points": String(numPoints),
      "X-Num-Channels": String(numChannels),
      "X-Channel-Headers": JSON.stringify(headers),
    },
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] = () => {};
  let reject: Deferred<T>["reject"] = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A fake backend transport whose completion order the test controls
 * explicitly. Like the real transport, aborting a request whose response
 * has not arrived yet rejects it; a response that already arrived before
 * the abort keeps resolving, exactly the race window under test.
 */
function createTransport() {
  const calls: {
    options: { remove_bg: boolean; crop_area: boolean };
    signal: AbortSignal;
    deferred: Deferred<Response>;
  }[] = [];
  const bulkGetSourceData = vi.fn(
    (
      _senderKey: string,
      _frameIds: number[],
      options: { remove_bg: boolean; crop_area: boolean },
      signal: AbortSignal,
    ) => {
      const deferred = createDeferred<Response>();
      signal.addEventListener("abort", () =>
        deferred.reject(new DOMException("aborted", "AbortError")),
      );
      calls.push({ options, signal, deferred });
      return deferred.promise;
    },
  );
  return { bulkGetSourceData, calls };
}

/** The minimal scene context consumed by the layer and its data view. */
function createSceneContext(bulkGetSourceData: unknown) {
  return {
    config,
    views: { bulkGetSourceData },
    display: {
      windows: { main: { viewMode: "2D", overrideOrbitTarget: null } },
    },
    isLayerActive: () => false,
  } as any;
}

describe("PointCloudLayer settings races", () => {
  it("publishes only the last setting's data when toggles overlap out of order (A -> B -> A)", async () => {
    const { bulkGetSourceData, calls } = createTransport();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const layer = PointCloudLayer.create(
      createSceneContext(bulkGetSourceData),
      "Point Cloud",
    );

    try {
      // Initial load with the default setting A (RemoveBG on).
      const initialLoad = layer.dataView.setFrame(frame);
      expect(layer.dataView.isLoading).toBe(true);
      await vi.waitFor(() => expect(calls).toHaveLength(1));
      calls[0].deferred.resolve(pointResponse([1, 2, 3], 1, 3));
      await initialLoad;

      const cloudA = layer.dataView.data;
      expect(cloudA).not.toBeNull();
      const clearObjects = vi.spyOn(layer.objects, "clear");
      const addObject = vi.spyOn(layer.objects, "add");

      layer.render();
      expect(layer.objects.children).toContain(cloudA?.asObject3D());
      expect(clearObjects).toHaveBeenCalledTimes(1);

      // An unchanged animation frame preserves the scene graph without
      // repeating any group mutations.
      layer.render();
      expect(layer.objects.children).toContain(cloudA?.asObject3D());
      expect(clearObjects).toHaveBeenCalledTimes(1);
      expect(addObject).toHaveBeenCalledTimes(2); // cloud and grid

      // Pane engines may preserve the outer settings object while
      // mutating nested blender settings. Such an update must still
      // invalidate the processed rendering output.
      const mutableSettings = structuredClone(SETTINGS_A);
      layer.onSettingsInputChange(mutableSettings);
      const applyColormap = layer.settingsOutput.blender;
      mutableSettings.blender.blenderType = "compose-rgb";
      layer.onSettingsInputChange(mutableSettings);
      expect(layer.settingsOutput.blender).not.toBe(applyColormap);
      expect(cloudA?.blender).toBe(layer.settingsOutput.blender);

      let slice = layer.mapEditorSlice(null);
      expect(slice.settings.disabled).toBe(false);
      expect(slice.settings.target?.buffer).toBe(cloudA?.buffer);

      // Toggle to setting B: while the new request is in flight, the
      // pane is disabled and the published data is cleared. Dependent
      // label layers gate their tools on that published source data,
      // so it also closes their interaction gate.
      layer.onSettingsInputChange({
        ...SETTINGS_A,
        removeBackground: false,
      });
      await vi.waitFor(() => expect(calls).toHaveLength(2));
      expect(calls[1].options).toMatchObject({
        remove_bg: false,
        crop_area: true,
      });

      slice = layer.mapEditorSlice(slice);
      expect(slice.settings.disabled).toBe(true);
      expect(layer.dataView.data).toBeNull();
      expect(layer.dataView.isLoading).toBe(true);
      layer.render();
      expect(layer.objects.children).toHaveLength(0);

      // B's response arrives just before the user toggles back to
      // setting A, so the abort only lands once the response is
      // already in flight.
      calls[1].deferred.resolve(pointResponse([4, 5, 6], 1, 3));
      layer.onSettingsInputChange(SETTINGS_A);
      await vi.waitFor(() => expect(calls).toHaveLength(3));

      // The stale completion must not (briefly or permanently) publish
      // B's data: the pane stays disabled, the interaction gate of the
      // dependent label tools stays closed on the null source, and the
      // loading flag stays true until the winning request settles.
      expect(layer.dataView.data).toBeNull();
      slice = layer.mapEditorSlice(slice);
      expect(slice.settings.disabled).toBe(true);
      expect(slice.settings.target).toBeNull();
      expect(layer.dataView.isLoading).toBe(true);

      // The winning request for the last setting settles.
      calls[2].deferred.resolve(pointResponse([7, 8, 9], 1, 3));
      await vi.waitFor(() => expect(layer.dataView.isLoading).toBe(false));

      const winner = layer.dataView.data;
      expect(winner).not.toBeNull();
      layer.render();
      expect(layer.objects.children).toContain(winner?.asObject3D());
      expect(new Set(winner?.buffer.getCoords()[0].toArray())).toEqual(
        new Set([7, 8, 9]),
      );
      slice = layer.mapEditorSlice(slice);
      expect(slice.settings.disabled).toBe(false);
      expect(slice.settings.target?.buffer).toBe(winner?.buffer);

      // The superseded setting B must never have been fetched again,
      // and the intentional aborts must have stayed silent.
      expect(bulkGetSourceData).toHaveBeenCalledTimes(3);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      layer.dispose();
    }
  });
});
