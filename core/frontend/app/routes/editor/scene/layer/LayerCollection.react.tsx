import { useLayoutEffect, useRef, type ReactNode } from "react";

import { useSourceEventVersion } from "../../widgets/useSourceEvent.react.ts";

import type { OverlayModel } from "./LayerCollection.tsx";

const OVERLAYS_STYLE: React.CSSProperties = {
  height: "100%",
  left: 0,
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  touchAction: "none",
  width: "100%",
};

/**
 * The narrow event source required to render the overlays of a layer
 * collection.
 */
export interface OverlayCollectionSource {
  readonly overlayModels: readonly OverlayModel[];
  addEventListener(eventType: "overlays-change", listener: () => void): void;
  removeEventListener(eventType: "overlays-change", listener: () => void): void;
}

const NOOP_OVERLAY_SIZE_CHANGE = (): void => {};

function LayerOverlayContent({
  children,
  onSizeChange,
  overlayView,
  zIndex,
}: {
  children?: ReactNode;
  onSizeChange: (width: number, height: number) => void;
  overlayView: ReactNode | null;
  zIndex: number;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host == null) return undefined;
    const reportSize = (): void => {
      const { height, width } = host.getBoundingClientRect();
      onSizeChange(width, height);
    };
    const ResizeObserverCtor = globalThis.ResizeObserver;
    const observer =
      ResizeObserverCtor == null ? null : new ResizeObserverCtor(reportSize);
    observer?.observe(host);
    reportSize();
    return () => observer?.disconnect();
  }, [onSizeChange]);

  return (
    <div ref={hostRef} style={{ ...OVERLAYS_STYLE, zIndex }}>
      {children}
      {overlayView}
    </div>
  );
}

export function LayerCollectionOverlaysView({
  layerSlots = {},
  source,
}: {
  layerSlots?: Readonly<Record<string, ReactNode>>;
  source: OverlayCollectionSource | null;
}): React.JSX.Element {
  useSourceEventVersion(source, "overlays-change");

  const overlayEntries: readonly OverlayModel[] =
    source == null
      ? Object.keys(layerSlots).map((key) => ({
          key,
          zIndex: 0,
          overlayView: null,
          onSizeChange: NOOP_OVERLAY_SIZE_CHANGE,
        }))
      : source.overlayModels;

  return (
    <div id="overlays-container" style={OVERLAYS_STYLE}>
      {overlayEntries.map(({ key, onSizeChange, overlayView, zIndex }) => (
        <LayerOverlayContent
          key={key}
          onSizeChange={onSizeChange}
          overlayView={overlayView}
          zIndex={zIndex}
        >
          {layerSlots[key]}
        </LayerOverlayContent>
      ))}
    </div>
  );
}
