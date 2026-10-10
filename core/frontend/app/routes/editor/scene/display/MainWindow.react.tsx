import { useLayoutEffect } from "react";

import { useSourceEventVersion } from "../../widgets";
import type { SourceEventTarget } from "../../widgets";

/**
 * The subset of the main window needed to drive the view.
 *
 * Kept structural so React never depends on the `MainWindow` class, which
 * owns the three.js cameras.
 */
export interface MainWindowSource extends SourceEventTarget {
  readonly crosshairVisible: boolean;
  readonly dom: HTMLElement;
  updateCameraAspects(): void;
}

/** Renders overlays belonging to a main scene window. */
export function MainWindowView({
  window,
}: {
  window: MainWindowSource;
}): React.JSX.Element {
  useSourceEventVersion(window, "crosshair-change");
  const crosshairVisible = window.crosshairVisible;
  useLayoutEffect(() => {
    const ResizeObserverCtor = globalThis.ResizeObserver;
    const observer =
      ResizeObserverCtor == null
        ? null
        : new ResizeObserverCtor(window.updateCameraAspects.bind(window));
    observer?.observe(window.dom);
    window.updateCameraAspects();
    return () => observer?.disconnect();
  }, [window]);

  return (
    <label
      hidden={!crosshairVisible}
      style={{
        color: "yellow",
        fontSize: "2em",
        left: "50%",
        position: "absolute",
        top: "50%",
        transform: "translate(-50%, -50%)",
        userSelect: "none",
      }}
    >
      +
    </label>
  );
}
