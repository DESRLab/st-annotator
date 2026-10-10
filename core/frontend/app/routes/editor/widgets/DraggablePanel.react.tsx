import {
  default as React,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface PointerPosition {
  x: number;
  y: number;
}

export interface DraggablePanelPosition {
  top: number;
  left: number;
}

/**
 * Converts a display name into a slug usable in `data-test` selectors.
 */
export function toDataTestSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface DraggablePanelViewComponentProps {
  title: string;
  children?: React.ReactNode;
  contentStyle?: React.CSSProperties;
  isCollapsed: boolean;
  onDrag: (
    prevPointerPos: PointerPosition,
    pointerPos: PointerPosition,
  ) => void;
  onToggleCollapse: () => void;
}

export function DraggablePanelViewComponent({
  title,
  children,
  contentStyle,
  isCollapsed,
  onDrag,
  onToggleCollapse,
}: DraggablePanelViewComponentProps): React.JSX.Element {
  const prevPointerPosRef = useRef<PointerPosition | null>(null);

  const onTitlePointerDown = (event: React.PointerEvent<HTMLLabelElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    prevPointerPosRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.style.cursor = "grabbing";
    event.preventDefault();
    event.stopPropagation();
  };

  const onTitlePointerMove = (event: React.PointerEvent<HTMLLabelElement>) => {
    const prevPointerPos = prevPointerPosRef.current;
    if (prevPointerPos == null) return;

    const pointerPos = { x: event.clientX, y: event.clientY };
    prevPointerPosRef.current = pointerPos;
    onDrag(prevPointerPos, pointerPos);
    event.preventDefault();
    event.stopPropagation();
  };

  const onTitlePointerUp = (event: React.PointerEvent<HTMLLabelElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    prevPointerPosRef.current = null;
    event.currentTarget.style.cursor = "grab";
    event.preventDefault();
    event.stopPropagation();
  };

  const onCollapsePointerDown = (
    event: React.PointerEvent<HTMLLabelElement>,
  ) => {
    onToggleCollapse();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      <div className="header">
        <label
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={onTitlePointerUp}
          style={{ cursor: "grab" }}
        >
          {title}
        </label>
        <label onPointerDown={onCollapsePointerDown}>
          {isCollapsed ? "+" : "-"}
        </label>
      </div>
      <div className="content" style={contentStyle}>
        {children}
      </div>
    </>
  );
}

export interface DraggablePanelProps {
  children: React.ReactNode;
  className?: string;
  contentStyle?: React.CSSProperties;
  hidden?: boolean;
  onElementChange?: (element: HTMLDivElement | null) => void;
  onPositionChange: (position: DraggablePanelPosition) => void;
  position: DraggablePanelPosition;
  style?: React.CSSProperties;
  title: string;
}

/** Renders a draggable overlay panel with React-owned position and collapse state. */
export function DraggablePanel({
  children,
  className,
  contentStyle,
  hidden = false,
  onElementChange,
  onPositionChange,
  position,
  style,
  title,
}: DraggablePanelProps): React.JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const positionRef = useRef(position);
  useLayoutEffect(() => {
    positionRef.current = position;
  }, [position]);
  const onPositionChangeRef = useRef(onPositionChange);
  useLayoutEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);
  const isAdjustingSizeRef = useRef(false);

  const bindElement = useCallback(
    (nextElement: HTMLDivElement | null): void => {
      setElement(nextElement);
      onElementChange?.(nextElement);
    },
    [onElementChange],
  );
  const moveBy = useCallback(
    (prevPointerPos: PointerPosition, pointerPos: PointerPosition): void => {
      const rect = element?.getBoundingClientRect();
      if (rect == null) return;
      onPositionChange({
        left: rect.left + pointerPos.x - prevPointerPos.x,
        top: rect.top + pointerPos.y - prevPointerPos.y,
      });
    },
    [element, onPositionChange],
  );

  // Whenever the panel's own box changes size (e.g. collapsing/expanding near
  // an edge), shift it back inside its parent, as the pre-React controller did.
  useLayoutEffect(() => {
    if (element == null) return undefined;
    const ResizeObserverCtor = globalThis.ResizeObserver;
    if (ResizeObserverCtor == null) return undefined;

    const clampToBounds = (): void => {
      if (isAdjustingSizeRef.current) return;

      const domRect = element.getBoundingClientRect();
      if (domRect.width === 0 && domRect.height === 0) return;

      const parentRect = element.parentElement?.getBoundingClientRect() ?? {
        top: 0,
        left: 0,
        bottom: window.innerHeight,
        right: window.innerWidth,
      };
      const current = positionRef.current;
      let top = current.top;
      let left = current.left;
      top += Math.max(parentRect.top - domRect.top, 0);
      left += Math.max(parentRect.left - domRect.left, 0);
      top -= Math.max(domRect.bottom - parentRect.bottom, 0);
      left -= Math.max(domRect.right - parentRect.right, 0);
      if (top === current.top && left === current.left) return;

      isAdjustingSizeRef.current = true;
      try {
        onPositionChangeRef.current({ top, left });
      } finally {
        isAdjustingSizeRef.current = false;
      }
    };

    const observer = new ResizeObserverCtor(clampToBounds);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return (
    <div
      className={
        "draggable-panel" +
        (isCollapsed ? " collapsed" : "") +
        (className == null ? "" : " " + className)
      }
      data-test={"editor-panel-" + toDataTestSlug(title)}
      hidden={hidden}
      ref={bindElement}
      style={{
        ...style,
        left: position.left,
        pointerEvents: "auto",
        position: "absolute",
        top: position.top,
        touchAction: "auto",
      }}
    >
      <DraggablePanelViewComponent
        contentStyle={contentStyle}
        isCollapsed={isCollapsed}
        onDrag={moveBy}
        onToggleCollapse={() => setIsCollapsed((value) => !value)}
        title={title}
      >
        {children}
      </DraggablePanelViewComponent>
    </div>
  );
}
