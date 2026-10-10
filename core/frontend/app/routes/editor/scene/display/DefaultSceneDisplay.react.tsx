import { default as React, forwardRef, useLayoutEffect, useRef } from "react";

import { useSourceEventVersion } from "../../widgets";

import type { DefaultSceneDisplayElements } from "./DefaultSceneDisplay.tsx";
import { MainWindowView } from "./MainWindow.react.tsx";
import type { MainWindowSource } from "./MainWindow.react.tsx";
import { MinimapWindowView } from "./MinimapWindow.react.tsx";
import type { MinimapWindowSource } from "./MinimapWindow.react.tsx";

/**
 * The narrow source of a scene display consumed by the React host.
 *
 * Kept structural so React never depends on the `DefaultSceneDisplay` class.
 */
export interface DefaultSceneDisplaySource {
  readonly windows: {
    readonly main: MainWindowSource;
    readonly minimap: MinimapWindowSource;
  };
}

export interface DefaultSceneDisplayHostProps {
  display: DefaultSceneDisplaySource | null;
  onReady: (elements: DefaultSceneDisplayElements) => void;
}

const FULL_SIZE_STYLE: React.CSSProperties = {
  height: "100%",
  left: 0,
  position: "absolute",
  top: 0,
  width: "100%",
};
const DEFAULT_MINIMAP_RECT = { top: 32, left: 32, width: 256, height: 256 };
const getDefaultMinimapRect = (): typeof DEFAULT_MINIMAP_RECT =>
  DEFAULT_MINIMAP_RECT;

/** React-owned DOM host for the default scene display. */
export function DefaultSceneDisplayHost({
  display,
  onReady,
}: DefaultSceneDisplayHostProps): React.JSX.Element {
  const displayDomRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainWindowDomRef = useRef<HTMLDivElement>(null);
  const minimapWindowDomRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const displayDom = displayDomRef.current;
    const canvas = canvasRef.current;
    const mainWindowDom = mainWindowDomRef.current;
    const minimapWindowDom = minimapWindowDomRef.current;
    if (
      displayDom == null ||
      canvas == null ||
      mainWindowDom == null ||
      minimapWindowDom == null
    )
      return undefined;

    onReady({ canvas, displayDom, mainWindowDom, minimapWindowDom });
  }, [onReady]);

  return (
    <div
      data-test="editor-display"
      id="display-container"
      ref={displayDomRef}
      style={FULL_SIZE_STYLE}
    >
      <canvas ref={canvasRef} style={FULL_SIZE_STYLE} />
      <div id="main-window" ref={mainWindowDomRef} style={FULL_SIZE_STYLE}>
        {display == null ? null : (
          <MainWindowView window={display.windows.main} />
        )}
      </div>
      <MinimapWindowSlot
        ref={minimapWindowDomRef}
        window={display?.windows.minimap ?? null}
      />
    </div>
  );
}

const MinimapWindowSlot = forwardRef<
  HTMLDivElement,
  { window: MinimapWindowSource | null }
>(function MinimapWindowSlot({ window }, ref) {
  useSourceEventVersion(window, "rect-change");
  const rect = window?.rect ?? getDefaultMinimapRect();

  return (
    <div
      id="minimap-window"
      ref={ref}
      style={{
        border: "5px solid darkgray",
        height: `${rect.height}px`,
        left: `${rect.left}px`,
        position: "absolute",
        top: `${rect.top}px`,
        width: `${rect.width}px`,
      }}
    >
      {window == null ? null : <MinimapWindowView window={window} />}
    </div>
  );
});
