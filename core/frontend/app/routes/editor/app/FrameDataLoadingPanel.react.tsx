import { useEffect, useState } from "react";

export interface FrameDataLoadingLayers {
  readonly layerEntries: readonly {
    readonly key: string;
    readonly layer: {
      readonly name: string;
      readonly dataView?: {
        readonly isLoading: boolean;
        readonly loadError?: string | null;
        retry?(): Promise<void>;
        readonly downloadProgress?: {
          loadedBytes: number;
          totalBytes: number | null;
        } | null;
        addEventListener(
          type: "beforeload" | "afterload" | "progress",
          listener: () => void,
        ): void;
        removeEventListener(
          type: "beforeload" | "afterload" | "progress",
          listener: () => void,
        ): void;
      };
    };
  }[];
}

function formatDownloadSize(bytes: number, totalBytes = bytes): string {
  if (totalBytes < 1024) return `${bytes} B`;
  if (totalBytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Reports current frame-loading state for every data layer. */
export function FrameDataLoadingPanel({
  layers,
}: {
  layers: FrameDataLoadingLayers;
}): React.JSX.Element {
  const [, setVersion] = useState(0);
  const dataLayers = layers.layerEntries.filter(
    (entry) => entry.layer.dataView != null,
  );

  useEffect(() => {
    const refresh = (): void => setVersion((version) => version + 1);
    for (const { layer } of dataLayers) {
      layer.dataView?.addEventListener("beforeload", refresh);
      layer.dataView?.addEventListener("afterload", refresh);
      layer.dataView?.addEventListener("progress", refresh);
    }
    return () => {
      for (const { layer } of dataLayers) {
        layer.dataView?.removeEventListener("beforeload", refresh);
        layer.dataView?.removeEventListener("afterload", refresh);
        layer.dataView?.removeEventListener("progress", refresh);
      }
    };
  }, [layers]);

  const loadedCount = dataLayers.filter(
    ({ layer }) =>
      !layer.dataView?.isLoading && layer.dataView?.loadError == null,
  ).length;
  return (
    <>
      <div
        aria-live="polite"
        style={{ color: "#b8c0cc", margin: "6px 0 18px" }}
      >
        {loadedCount} of {dataLayers.length} layers ready
      </div>
      <div style={{ display: "grid", gap: "12px" }}>
        {dataLayers.map(({ key, layer }) => {
          const loading = layer.dataView?.isLoading === true;
          const loadError = layer.dataView?.loadError;
          const progress = layer.dataView?.downloadProgress;
          const fraction =
            progress?.totalBytes == null || progress.totalBytes === 0
              ? null
              : Math.min(progress.loadedBytes / progress.totalBytes, 1);
          const downloadedSize =
            progress == null
              ? null
              : formatDownloadSize(
                  progress.loadedBytes,
                  progress.totalBytes ?? progress.loadedBytes,
                );
          const status = loadError
            ? `Failed: ${loadError}`
            : loading
              ? fraction == null
                ? "Loading…"
                : `${Math.round(fraction * 100)}% · ${formatDownloadSize(progress!.loadedBytes, progress!.totalBytes!)} / ${formatDownloadSize(progress!.totalBytes!, progress!.totalBytes!)}`
              : downloadedSize == null
                ? "Ready"
                : `Ready · ${downloadedSize}`;
          return (
            <div data-plugin-key={key} key={key}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <span>{layer.name}</span>
                <span
                  style={{
                    color: loadError
                      ? "#ff8f8f"
                      : loading
                        ? "#b8c0cc"
                        : "#79d99a",
                  }}
                >
                  {status}
                </span>
              </div>
              {loadError && layer.dataView?.retry && (
                <button
                  type="button"
                  onClick={() => void layer.dataView?.retry?.()}
                  style={{ marginBottom: "4px" }}
                >
                  Retry
                </button>
              )}
              <progress
                aria-label={`${layer.name}: ${status}`}
                max={1}
                value={loading ? (fraction ?? undefined) : 1}
                style={{ display: "block", width: "100%" }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
