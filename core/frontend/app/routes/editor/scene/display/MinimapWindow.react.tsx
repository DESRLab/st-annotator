import interact from "interactjs";
import { useLayoutEffect } from "react";
import tippy, { followCursor } from "tippy.js";
import "tippy.js/dist/tippy.css";

import { useSourceEventVersion } from "../../widgets";
import type { SourceEventTarget } from "../../widgets";

import type {
  MinimapMarkerSnapshot,
  MinimapWindowRect,
} from "./MinimapWindow.tsx";

/**
 * The subset of the minimap window needed to drive the view.
 *
 * Kept structural so React never depends on the `MinimapWindow` class, which
 * owns the three.js camera.
 */
export interface MinimapWindowSource extends SourceEventTarget {
  readonly rect: MinimapWindowRect;
  readonly markerSnapshot: MinimapMarkerSnapshot;
  readonly dom: HTMLElement;
  setRect(rect: MinimapWindowRect): void;
  updateCameraAspects(): void;
  getPointerTooltipContent(event: PointerEvent): string;
}

/** Renders overlays belonging to a minimap scene window. */
export function MinimapWindowView({
  window,
}: {
  window: MinimapWindowSource;
}): React.JSX.Element {
  useSourceEventVersion(window, "markers-change");
  const markers = window.markerSnapshot;

  useLayoutEffect(() => {
    const interaction = interact(window.dom)
      .draggable({
        listeners: {
          move: (event) => {
            const rect = window.rect;
            window.setRect({
              ...rect,
              top: rect.top + event.delta.y,
              left: rect.left + event.delta.x,
            });
          },
        },
      })
      .resizable({
        edges: { top: true, left: true, bottom: true, right: true },
        invert: "reposition",
        listeners: {
          move: (event) => {
            const rect = window.rect;
            window.setRect({
              height: event.rect.height,
              left: rect.left + event.deltaRect.left,
              top: rect.top + event.deltaRect.top,
              width: event.rect.width,
            });
          },
        },
      });
    return () => interaction.unset();
  }, [window]);

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

  useLayoutEffect(() => {
    const tooltip = tippy(window.dom, {
      followCursor: true,
      plugins: [followCursor],
    });
    const onPointerMove = (event: PointerEvent): void => {
      tooltip.setContent(window.getPointerTooltipContent(event));
      tooltip.show();
    };
    window.dom.addEventListener("pointermove", onPointerMove);
    window.dom.dataset.coordinateTooltipReady = "true";
    return () => {
      delete window.dom.dataset.coordinateTooltipReady;
      window.dom.removeEventListener("pointermove", onPointerMove);
      tooltip.destroy();
    };
  }, [window]);

  return (
    <>
      <label
        title={markers.camera3DTitle}
        style={{
          color: markers.camera3DColor,
          fontSize: "2em",
          left: markers.camera3DLeft,
          position: "absolute",
          top: markers.camera3DTop,
          transform: markers.camera3DTransform,
          userSelect: "none",
          WebkitTextStrokeColor: markers.camera3DStrokeColor,
          WebkitTextStrokeWidth: "2px",
        }}
      >
        ⮞
      </label>
      <label
        title={markers.camera2DTitle}
        style={{
          color: "red",
          fontSize: "2em",
          left: "50%",
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          userSelect: "none",
        }}
      >
        🞜
      </label>
    </>
  );
}
