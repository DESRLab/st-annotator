/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  EditorStoreProvider,
  useEditorSelector,
} from "../../../../../app/routes/editor/store/EditorStore.react.tsx";
import { createEditorStore } from "../../../../../app/routes/editor/store/createEditorStore";
import type { EditorStore } from "../../../../../app/routes/editor/store/createEditorStore";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach((): void => {
  document.body.replaceChildren();
});

interface TestState {
  navigation: { frameId: number | null };
  ui: { hint: string };
}

function createTestStore(initial: TestState) {
  let state = initial;
  const store = createEditorStore<TestState>(() => state);
  return {
    // The provider's context is typed against EditorState; the store is
    // structurally compatible for these tests.
    store: store as unknown as EditorStore<never> & { invalidate(): void },
    setState(next: TestState): void {
      state = next;
      store.invalidate();
    },
  };
}

function selectFrameId(state: unknown): number | null {
  return (state as TestState).navigation.frameId;
}

async function renderWithStore(store: unknown, node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <EditorStoreProvider store={store as never}>{node}</EditorStoreProvider>,
    );
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("useEditorSelector", () => {
  it("renders the selected slice", async () => {
    const { store } = createTestStore({
      navigation: { frameId: 7 },
      ui: { hint: "hint" },
    });
    let rendered = 0;

    function FrameId(): React.JSX.Element {
      rendered += 1;
      const frameId = useEditorSelector(selectFrameId);
      return <output>{String(frameId)}</output>;
    }

    const view = await renderWithStore(store, <FrameId />);
    expect(view.container.querySelector("output")?.textContent).toBe("7");
    expect(rendered).toBe(1);
    await view.unmount();
  });

  it("re-renders when the selected slice changes", async () => {
    const testStore = createTestStore({
      navigation: { frameId: 7 },
      ui: { hint: "hint" },
    });
    let rendered = 0;

    function FrameId(): React.JSX.Element {
      rendered += 1;
      const frameId = useEditorSelector(selectFrameId);
      return <output>{String(frameId)}</output>;
    }

    const view = await renderWithStore(testStore.store, <FrameId />);
    expect(view.container.querySelector("output")?.textContent).toBe("7");
    expect(rendered).toBe(1);

    await act(async () => {
      testStore.setState({
        navigation: { frameId: 8 },
        ui: { hint: "hint" },
      });
    });
    expect(view.container.querySelector("output")?.textContent).toBe("8");
    expect(rendered).toBe(2);
    await view.unmount();
  });

  it("does not re-render when an unselected slice changes to an equal value", async () => {
    const testStore = createTestStore({
      navigation: { frameId: 7 },
      ui: { hint: "hint" },
    });
    let rendered = 0;

    function FrameId(): React.JSX.Element {
      rendered += 1;
      const frameId = useEditorSelector(selectFrameId);
      return <output>{String(frameId)}</output>;
    }

    const view = await renderWithStore(testStore.store, <FrameId />);
    expect(rendered).toBe(1);

    // Change only ui.hint; the selected frameId is unchanged, so the
    // memoized selector returns the same value and there is no re-render.
    await act(async () => {
      testStore.setState({
        navigation: { frameId: 7 },
        ui: { hint: "changed" },
      });
    });
    expect(view.container.querySelector("output")?.textContent).toBe("7");
    expect(rendered).toBe(1);
    await view.unmount();
  });
});
