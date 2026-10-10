/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  useExternalStoreVersion,
  type ExternalStoreSubscribe,
} from "../../../../../app/routes/editor/app/EditorState.react.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class NotifyStore {
  #listeners = new Set<() => void>();
  value = 0;

  get listenerCount(): number {
    return this.#listeners.size;
  }

  subscribe: ExternalStoreSubscribe = (listener): (() => void) => {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  };

  change(value: number): void {
    this.value = value;
    for (const listener of [...this.#listeners]) listener();
  }
}

function StoreProbe({ store }: { store: NotifyStore }) {
  const version = useExternalStoreVersion(store.subscribe);
  return <output data-test="store-probe">{`${store.value}@${version}`}</output>;
}

async function renderProbe(store: NotifyStore) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<StoreProbe store={store} />);
  });

  return {
    container,
    root,
    render: async (nextStore: NotifyStore): Promise<void> => {
      await act(async () => {
        root.render(<StoreProbe store={nextStore} />);
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

describe("useExternalStoreVersion", () => {
  it("subscribes on mount and releases the subscription on unmount", async () => {
    const store = new NotifyStore();
    const probe = await renderProbe(store);

    expect(store.listenerCount).toBe(1);
    expect(probe.container.textContent).toBe("0@0");

    await probe.unmount();

    expect(store.listenerCount).toBe(0);
  });

  it("re-renders with the current model values when the store notifies", async () => {
    const store = new NotifyStore();
    const probe = await renderProbe(store);

    await act(async () => {
      store.change(7);
    });
    expect(probe.container.textContent).toBe("7@1");

    await act(async () => {
      store.change(11);
    });
    expect(probe.container.textContent).toBe("11@2");
  });

  it("moves the subscription when the subscribe source changes", async () => {
    const first = new NotifyStore();
    const second = new NotifyStore();
    const probe = await renderProbe(first);

    expect(first.listenerCount).toBe(1);

    await probe.render(second);

    expect(first.listenerCount).toBe(0);
    expect(second.listenerCount).toBe(1);
    expect(probe.container.textContent).toBe("0@0");

    await act(async () => {
      second.change(3);
    });
    expect(probe.container.textContent).toBe("3@1");
  });
});
