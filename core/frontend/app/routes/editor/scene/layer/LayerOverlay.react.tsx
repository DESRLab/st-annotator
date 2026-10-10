import {
  default as React,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";

import { DraggablePanel } from "../../widgets/DraggablePanel.react.tsx";
import type { DraggablePanelPosition } from "../../widgets/DraggablePanel.react.tsx";

export interface LayerOverlayTooltip {
  key?: React.Key;
  className: string;
  left: number | string;
  lines: readonly string[];
  top: number | string;
  visible: boolean;
}

interface TooltipOverlayProps {
  tooltip: LayerOverlayTooltip;
}

function TooltipOverlay({ tooltip }: TooltipOverlayProps): React.JSX.Element {
  return (
    <div
      className={tooltip.className}
      style={{
        left: tooltip.left,
        top: tooltip.top,
        visibility: tooltip.visible ? "visible" : "hidden",
      }}
    >
      {tooltip.lines.map((line, index) => (
        <React.Fragment key={index}>
          {index === 0 ? null : <br />}
          {line}
        </React.Fragment>
      ))}
    </div>
  );
}

export interface LayerOverlayPanel {
  content: React.ReactNode;
  hidden: boolean;
  key: string;
  title: string;
  verticalOffset?: number;
}

function InspectorOverlayPanel({
  content,
  hidden,
  title,
  verticalOffset = 0,
}: Omit<LayerOverlayPanel, "key">): React.JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<DraggablePanelPosition>({
    top: 0,
    left: 0,
  });
  const align = useCallback((): void => {
    const parent = element?.parentElement;
    if (element == null || parent == null) return;
    const panelRect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    setPosition({
      left: parentRect.width - panelRect.width,
      top: (parentRect.height - panelRect.height) / 2 + verticalOffset,
    });
  }, [element, verticalOffset]);

  useLayoutEffect(() => {
    if (element == null) return undefined;
    const parent = element.parentElement;
    if (parent == null) return undefined;
    const ResizeObserverCtor = globalThis.ResizeObserver;
    const observer =
      ResizeObserverCtor == null ? null : new ResizeObserverCtor(align);
    observer?.observe(element);
    observer?.observe(parent);
    align();
    const animationFrameId = window.requestAnimationFrame(align);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      observer?.disconnect();
    };
  }, [align, element, hidden]);

  return (
    <DraggablePanel
      hidden={hidden}
      onElementChange={setElement}
      onPositionChange={setPosition}
      position={position}
      title={title}
    >
      {hidden ? null : content}
    </DraggablePanel>
  );
}

export interface LayerOverlayViewProps {
  children?: React.ReactNode;
  panels?: LayerOverlayPanel[];
  tooltips?: readonly LayerOverlayTooltip[];
}

export function LayerOverlayView({
  children,
  panels = [],
  tooltips = [],
}: LayerOverlayViewProps): React.JSX.Element {
  return (
    <>
      {panels.map(({ key, ...panel }) => (
        <InspectorOverlayPanel key={key} {...panel} />
      ))}
      {children}
      {tooltips.map((tooltip, index) => (
        <TooltipOverlay key={tooltip.key ?? index} tooltip={tooltip} />
      ))}
    </>
  );
}
