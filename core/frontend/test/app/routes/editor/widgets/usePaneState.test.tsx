/* @vitest-environment jsdom */

import { act, type JSX, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { usePaneState } from "../../../../../app/routes/editor/widgets/usePaneState.react.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface TestPaneParams {
  inputtedData: { value: number };
  computedData: {};
  internalData: {};
  settings: { disabled: boolean };
  outputData: {};
}

class TestPaneSource {
  readonly #listeners = new Map<string, Set<() => void>>();

  readonly changes: TestPaneParams["inputtedData"][] = [];

  paneParams: Pick<TestPaneParams, "inputtedData" | "settings"> = {
    inputtedData: { value: 0 },
    settings: { disabled: false },
  };

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

  /** Applies input without notifying; observable only through a re-read. */
  applyInputChange = (inputtedData: TestPaneParams["inputtedData"]): void => {
    this.changes.push(inputtedData);
    this.paneParams = { ...this.paneParams, inputtedData };
  };

  /** Forwards input without updating the authoritative params. */
  forwardInputChange = (inputtedData: TestPaneParams["inputtedData"]): void => {
    this.changes.push(inputtedData);
  };

  setPaneParams(
    inputtedData: TestPaneParams["inputtedData"],
    eventType: string,
  ): void {
    this.paneParams = { ...this.paneParams, inputtedData };
    for (const listener of [...(this.#listeners.get(eventType) ?? [])])
      listener();
  }
}

function RereadHarness({ source }: { source: TestPaneSource }): JSX.Element {
  const { onInputChange, paneParams } = usePaneState({
    eventType: "change",
    getPaneParams: (): typeof source.paneParams => source.paneParams,
    inputChangePolicy: "reread",
    onInputChange: source.applyInputChange,
    source,
  });
  return (
    <button
      onClick={() =>
        onInputChange({ value: paneParams.inputtedData.value + 1 })
      }
      type="button"
    >
      {paneParams.inputtedData.value}
    </button>
  );
}

function OptimisticHarness({
  source,
}: {
  source: TestPaneSource;
}): JSX.Element {
  const { onInputChange, paneParams } = usePaneState({
    eventType: "settings-change",
    getPaneParams: (): typeof source.paneParams => source.paneParams,
    inputChangePolicy: "optimistic",
    onInputChange: source.forwardInputChange,
    source,
  });
  return (
    <button
      onClick={() =>
        onInputChange({ value: paneParams.inputtedData.value + 1 })
      }
      type="button"
    >
      {paneParams.inputtedData.value}
    </button>
  );
}

async function renderHarness(node: JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
  });

  return {
    container,
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

describe("usePaneState", () => {
  it("re-reads the source after forwarding input with the reread policy", async () => {
    const source = new TestPaneSource();
    const view = await renderHarness(<RereadHarness source={source} />);

    const button = view.container.querySelector("button");
    expect(button?.textContent).toBe("0");

    await act(async () => {
      button?.click();
    });
    expect(button?.textContent).toBe("1");
    expect(source.changes).toEqual([{ value: 1 }]);

    await view.unmount();
  });

  it("synchronizes the draft when the source notifies", async () => {
    const source = new TestPaneSource();
    const view = await renderHarness(<RereadHarness source={source} />);

    const button = view.container.querySelector("button");
    expect(source.listenerCount("change")).toBe(1);

    await act(async () => {
      source.setPaneParams({ value: 7 }, "change");
    });
    expect(button?.textContent).toBe("7");

    await view.unmount();
    expect(source.listenerCount("change")).toBe(0);
  });

  it("merges input into the draft before forwarding with the optimistic policy", async () => {
    const source = new TestPaneSource();
    const view = await renderHarness(<OptimisticHarness source={source} />);

    const button = view.container.querySelector("button");
    expect(button?.textContent).toBe("0");

    // The source does not update its authoritative params here, so the
    // visible draft must come from the optimistic merge.
    await act(async () => {
      button?.click();
    });
    expect(button?.textContent).toBe("1");
    expect(source.paneParams.inputtedData).toEqual({ value: 0 });
    expect(source.changes).toEqual([{ value: 1 }]);

    await view.unmount();
  });

  it("replaces the optimistic draft with authoritative source params on notify", async () => {
    const source = new TestPaneSource();
    const view = await renderHarness(<OptimisticHarness source={source} />);

    const button = view.container.querySelector("button");
    await act(async () => {
      button?.click();
    });
    expect(button?.textContent).toBe("1");

    await act(async () => {
      source.setPaneParams({ value: 9 }, "settings-change");
    });
    expect(button?.textContent).toBe("9");

    await view.unmount();
    expect(source.listenerCount("settings-change")).toBe(0);
  });

  it("subscribes only to the requested event type", async () => {
    const source = new TestPaneSource();
    const view = await renderHarness(<OptimisticHarness source={source} />);

    const button = view.container.querySelector("button");
    expect(source.listenerCount("settings-change")).toBe(1);
    expect(source.listenerCount("change")).toBe(0);

    await act(async () => {
      source.setPaneParams({ value: 4 }, "change");
    });
    expect(button?.textContent).toBe("0");

    await view.unmount();
  });

  it("re-reads immediately when the source changes without any event", async () => {
    const first = new TestPaneSource();
    const second = new TestPaneSource();
    second.paneParams = {
      ...second.paneParams,
      inputtedData: { value: 5 },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const renderWith = async (source: TestPaneSource): Promise<void> => {
      await act(async () => {
        root.render(<SwitchingHarness source={source} />);
      });
    };

    await renderWith(first);
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("0");
    expect(first.listenerCount("change")).toBe(1);

    // No event is dispatched; the draft must still follow the new source.
    await renderWith(second);
    expect(container.querySelector("button")?.textContent).toBe("5");
    expect(first.listenerCount("change")).toBe(0);
    expect(second.listenerCount("change")).toBe(1);

    await act(async () => {
      root.unmount();
    });
    expect(second.listenerCount("change")).toBe(0);
    container.remove();
  });

  it("keeps exactly one subscription under StrictMode remounts", async () => {
    const source = new TestPaneSource();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <RereadHarness source={source} />
        </StrictMode>,
      );
    });
    expect(source.listenerCount("change")).toBe(1);
    expect(container.querySelector("button")?.textContent).toBe("0");

    await act(async () => {
      source.setPaneParams({ value: 3 }, "change");
    });
    expect(container.querySelector("button")?.textContent).toBe("3");

    await act(async () => {
      root.unmount();
    });
    expect(source.listenerCount("change")).toBe(0);
    container.remove();
  });
});

function SwitchingHarness({ source }: { source: TestPaneSource }): JSX.Element {
  const { paneParams } = usePaneState({
    eventType: "change",
    getPaneParams: (): typeof source.paneParams => source.paneParams,
    inputChangePolicy: "reread",
    onInputChange: source.applyInputChange,
    source,
  });
  return <button type="button">{paneParams.inputtedData.value}</button>;
}
