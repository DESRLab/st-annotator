/* @vitest-environment jsdom */

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EventDispatcher } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VanillaEventDispatcher } from "../../../../../app/routes/editor/utils/VanillaEventDispatcher.ts";
import { useSourceEventVersion } from "../../../../../app/routes/editor/widgets/useSourceEvent.react.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class TestEventSource {
  #listeners = new Map<string, Set<() => void>>();
  value = 0;

  listenerCount(eventType: string): number {
    return this.#listeners.get(eventType)?.size ?? 0;
  }

  addEventListener(eventType: string, listener: () => void): void {
    const listeners = this.#listeners.get(eventType) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(eventType, listeners);
  }

  removeEventListener(eventType: string, listener: () => void): void {
    this.#listeners.get(eventType)?.delete(listener);
  }

  change(value: number): void {
    this.value = value;
    for (const listener of [...(this.#listeners.get("change") ?? [])])
      listener();
  }

  notify(eventType: string): void {
    for (const listener of [...(this.#listeners.get(eventType) ?? [])])
      listener();
  }
}

function SourceProbe({
  listener,
  source,
}: {
  listener?: () => void;
  source: TestEventSource | null;
}) {
  const version = useSourceEventVersion(source, "change", listener);
  return (
    <output data-test="source-probe">{`${source?.value ?? "none"}@${version}`}</output>
  );
}

async function renderProbe(
  source: TestEventSource | null,
  listener?: () => void,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<SourceProbe listener={listener} source={source} />);
  });

  return {
    container,
    render: async (
      nextSource: TestEventSource | null,
      nextListener?: () => void,
    ): Promise<void> => {
      await act(async () => {
        root.render(
          <SourceProbe listener={nextListener} source={nextSource} />,
        );
      });
    },
    unmount: async (): Promise<void> => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useSourceEventVersion", () => {
  it("subscribes on mount and releases the subscription on unmount", async () => {
    const source = new TestEventSource();
    const probe = await renderProbe(source);

    expect(source.listenerCount("change")).toBe(1);
    expect(probe.container.textContent).toBe("0@0");

    await probe.unmount();

    expect(source.listenerCount("change")).toBe(0);
  });

  it("re-renders with the current source values when the source notifies", async () => {
    const source = new TestEventSource();
    const probe = await renderProbe(source);

    await act(async () => {
      source.change(7);
    });
    expect(probe.container.textContent).toBe("7@1");

    await act(async () => {
      source.change(11);
    });
    expect(probe.container.textContent).toBe("11@2");
  });

  it("moves the subscription when the source changes", async () => {
    const first = new TestEventSource();
    const second = new TestEventSource();
    const probe = await renderProbe(first);

    expect(first.listenerCount("change")).toBe(1);

    await probe.render(second);

    expect(first.listenerCount("change")).toBe(0);
    expect(second.listenerCount("change")).toBe(1);

    await act(async () => {
      second.change(3);
    });
    expect(probe.container.textContent).toBe("3@1");
  });

  it("skips subscription until a source is provided", async () => {
    const source = new TestEventSource();
    const probe = await renderProbe(null);

    expect(probe.container.textContent).toBe("none@0");

    await probe.render(source);

    expect(source.listenerCount("change")).toBe(1);

    await act(async () => {
      source.change(5);
    });
    expect(probe.container.textContent).toBe("5@1");
  });

  it("invokes the custom listener for each event", async () => {
    const source = new TestEventSource();
    const listener = vi.fn();
    const probe = await renderProbe(source, listener);

    await act(async () => {
      source.change(4);
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(probe.container.textContent).toBe("4@1");

    await probe.unmount();
  });

  it("subscribes to every source when given an array", async () => {
    const first = new TestEventSource();
    const second = new TestEventSource();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<MultiSourceProbe sources={[first, second]} />);
    });

    expect(first.listenerCount("change")).toBe(1);
    expect(second.listenerCount("change")).toBe(1);
    expect(container.textContent).toBe("0");

    await act(async () => {
      second.change(2);
    });
    expect(container.textContent).toBe("1");

    await act(async () => {
      root.unmount();
    });
    expect(first.listenerCount("change")).toBe(0);
    expect(second.listenerCount("change")).toBe(0);
    container.remove();
  });

  it("subscribes to THREE.EventDispatcher sources", async () => {
    const source = new EventDispatcher<{ change: {} }>();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<DispatcherProbe source={source} />);
    });
    expect(container.textContent).toBe("0");

    await act(async () => {
      source.dispatchEvent({ type: "change" });
    });
    expect(container.textContent).toBe("1");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("subscribes to VanillaEventDispatcher sources", async () => {
    const source = new VanillaEventDispatcher<{ change: {} }>();
    const addSpy = vi.spyOn(source, "addEventListener");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<VanillaDispatcherProbe source={source} />);
    });
    expect(container.textContent).toBe("0");

    await act(async () => {
      source.dispatchEvent({ type: "change" });
    });
    expect(container.textContent).toBe("1");

    await act(async () => {
      root.unmount();
    });
    const listener = addSpy.mock.calls[0]?.[1];
    expect(listener).toBeTypeOf("function");
    expect(source.hasEventListener("change", listener)).toBe(false);
    container.remove();
  });

  it("subscribes to every event type when given an array", async () => {
    const source = new TestEventSource();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const eventTypes = ["beforeload", "afterload"] as const;
    await act(async () => {
      root.render(
        <MultiEventTypeProbe eventTypes={eventTypes} source={source} />,
      );
    });

    expect(source.listenerCount("beforeload")).toBe(1);
    expect(source.listenerCount("afterload")).toBe(1);
    expect(container.textContent).toBe("0");

    await act(async () => {
      source.notify("beforeload");
    });
    expect(container.textContent).toBe("1");

    await act(async () => {
      source.notify("afterload");
    });
    expect(container.textContent).toBe("2");

    await act(async () => {
      root.unmount();
    });
    expect(source.listenerCount("beforeload")).toBe(0);
    expect(source.listenerCount("afterload")).toBe(0);
    container.remove();
  });

  it("keeps exactly one subscription under StrictMode remounts", async () => {
    const source = new TestEventSource();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <SourceProbe source={source} />
        </StrictMode>,
      );
    });
    expect(source.listenerCount("change")).toBe(1);

    await act(async () => {
      source.change(2);
    });
    expect(container.textContent).toBe("2@1");

    await act(async () => {
      root.unmount();
    });
    expect(source.listenerCount("change")).toBe(0);
    container.remove();
  });
});

function MultiEventTypeProbe({
  eventTypes,
  source,
}: {
  eventTypes: readonly ("beforeload" | "afterload")[];
  source: TestEventSource;
}) {
  const version = useSourceEventVersion(source, eventTypes);
  return <output data-test="multi-event-type-probe">{version}</output>;
}

function MultiSourceProbe({
  sources,
}: {
  sources: readonly TestEventSource[];
}) {
  const version = useSourceEventVersion(sources, "change");
  return <output data-test="multi-source-probe">{version}</output>;
}

function DispatcherProbe({
  source,
}: {
  source: EventDispatcher<{ change: {} }>;
}) {
  const version = useSourceEventVersion(source, "change");
  return <output data-test="dispatcher-probe">{version}</output>;
}

function VanillaDispatcherProbe({
  source,
}: {
  source: VanillaEventDispatcher<{ change: {} }>;
}) {
  const version = useSourceEventVersion(source, "change");
  return <output data-test="vanilla-dispatcher-probe">{version}</output>;
}
