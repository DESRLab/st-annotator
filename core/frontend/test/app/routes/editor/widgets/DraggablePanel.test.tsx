/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DraggablePanel } from "../../../../../app/routes/editor/widgets/DraggablePanel.react.tsx";
import type { DraggablePanelPosition } from "../../../../../app/routes/editor/widgets/DraggablePanel.react.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function pointerEvent(type: string, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
}

function makeRect(
  top: number,
  left: number,
  bottom: number,
  right: number,
): DOMRect {
  return {
    top,
    left,
    bottom,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: (): object => ({}),
  } as DOMRect;
}

const resizeObservers: ResizeObserverStub[] = [];

class ResizeObserverStub {
  observed: Element[] = [];
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  observe = vi.fn((target: Element): void => {
    this.observed.push(target);
  });
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const nativeResizeObserver = globalThis.ResizeObserver;

beforeEach((): void => {
  globalThis.ResizeObserver = ResizeObserverStub;
  resizeObservers.length = 0;
});

function PanelHarness({
  hidden = false,
}: {
  hidden?: boolean;
}): React.JSX.Element {
  const [position, setPosition] = useState({ top: 12, left: 24 });
  return (
    <DraggablePanel
      hidden={hidden}
      onPositionChange={setPosition}
      position={position}
      title="React Inspector"
    >
      <div>React-owned content</div>
    </DraggablePanel>
  );
}

function ClampPanelHarness({
  initialPosition,
}: {
  initialPosition: DraggablePanelPosition;
}): React.JSX.Element {
  const [position, setPosition] = useState(initialPosition);
  return (
    <DraggablePanel
      onPositionChange={setPosition}
      position={position}
      title="Clamped Panel"
    >
      <div>Clamped content</div>
    </DraggablePanel>
  );
}

async function triggerResizeObserverOf(element: Element): Promise<void> {
  const stub = resizeObservers.find((observer) =>
    observer.observed.includes(element),
  );
  expect(stub).toBeDefined();
  await act(async (): Promise<void> => {
    stub!.callback([], stub as unknown as ResizeObserver);
  });
}

afterEach((): void => {
  document.body.replaceChildren();
  globalThis.ResizeObserver = nativeResizeObserver;
});

describe("DraggablePanel", () => {
  it("renders React-owned position, visibility, content, and collapse state", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async (): Promise<void> => {
      root.render(<PanelHarness hidden />);
    });

    const element = host.querySelector<HTMLElement>(".draggable-panel");
    expect(element?.hidden).toBe(true);
    expect(element?.style.top).toBe("12px");
    expect(element?.style.left).toBe("24px");
    expect(element?.textContent).toContain("React-owned content");

    await act(async (): Promise<void> => {
      root.render(<PanelHarness />);
    });
    expect(element?.hidden).toBe(false);

    const toggle = element!.querySelector(".header label:nth-child(2)");
    await act(async (): Promise<void> =>
      toggle!.dispatchEvent(pointerEvent("pointerdown")),
    );
    expect(element?.classList.contains("collapsed")).toBe(true);

    await act(async (): Promise<void> => root.unmount());
  });

  it("publishes pointer drag positions through its React callback", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onPositionChange = vi.fn();

    await act(async (): Promise<void> => {
      root.render(
        <DraggablePanel
          onPositionChange={onPositionChange}
          position={{ top: 10, left: 20 }}
          title="Inspector"
        >
          <div>Panel content</div>
        </DraggablePanel>,
      );
    });
    const element = host.querySelector<HTMLElement>(".draggable-panel");
    element!.getBoundingClientRect = () => ({
      top: 10,
      left: 20,
      bottom: 110,
      right: 220,
      width: 200,
      height: 100,
      x: 20,
      y: 10,
      toJSON: (): object => ({}),
    });

    const title = element!.querySelector(".header label:first-child");
    await act(async (): Promise<void> => {
      title!.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 5, clientY: 5 }),
      );
      title!.dispatchEvent(
        pointerEvent("pointermove", { clientX: 15, clientY: 25 }),
      );
      title!.dispatchEvent(
        pointerEvent("pointerup", { clientX: 15, clientY: 25 }),
      );
    });

    expect(onPositionChange).toHaveBeenCalledWith({ top: 30, left: 30 });

    await act(async (): Promise<void> => root.unmount());
  });

  it("clamps the panel back inside its parent when its box overflows", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    // Parent spans (0,0)-(250,200).
    host.getBoundingClientRect = () => makeRect(0, 0, 200, 250);
    const root = createRoot(host);

    await act(async (): Promise<void> => {
      root.render(
        <ClampPanelHarness initialPosition={{ top: 100, left: 100 }} />,
      );
    });
    const element = host.querySelector<HTMLElement>(".draggable-panel")!;
    // Panel spans (100,100)-(300,250): overflows the parent by 50px right and 50px down.
    element.getBoundingClientRect = () => makeRect(100, 100, 250, 300);

    await triggerResizeObserverOf(element);

    expect(element.style.top).toBe("50px");
    expect(element.style.left).toBe("50px");

    await act(async (): Promise<void> => root.unmount());
  });

  it("keeps the panel put when it is fully inside its parent", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.getBoundingClientRect = () => makeRect(0, 0, 200, 250);
    const root = createRoot(host);
    const onPositionChange = vi.fn();

    await act(async (): Promise<void> => {
      root.render(
        <DraggablePanel
          onPositionChange={onPositionChange}
          position={{ top: 10, left: 10 }}
          title="Inside"
        >
          <div>Panel content</div>
        </DraggablePanel>,
      );
    });
    const element = host.querySelector<HTMLElement>(".draggable-panel")!;
    element.getBoundingClientRect = () => makeRect(10, 10, 60, 80);

    await triggerResizeObserverOf(element);

    expect(onPositionChange).not.toHaveBeenCalled();

    await act(async (): Promise<void> => root.unmount());
  });

  it("does not clamp a zero-sized (e.g. hidden) panel", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.getBoundingClientRect = () => makeRect(0, 0, 200, 250);
    const root = createRoot(host);
    const onPositionChange = vi.fn();

    await act(async (): Promise<void> => {
      root.render(
        <DraggablePanel
          hidden
          onPositionChange={onPositionChange}
          position={{ top: 10, left: 10 }}
          title="Hidden"
        >
          <div>Panel content</div>
        </DraggablePanel>,
      );
    });
    const element = host.querySelector<HTMLElement>(".draggable-panel")!;
    // jsdom reports a hidden/unlaid-out element as a zero-sized rect.
    element.getBoundingClientRect = () => makeRect(0, 0, 0, 0);

    await triggerResizeObserverOf(element);

    expect(onPositionChange).not.toHaveBeenCalled();

    await act(async (): Promise<void> => root.unmount());
  });
});
