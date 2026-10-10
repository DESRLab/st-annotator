/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  EditorIntentsProvider,
  useEditorIntents,
} from "../../../../../app/routes/editor/store/EditorIntents.react.tsx";
import type { EditorBaseIntents } from "../../../../../app/routes/editor/store/intents";
import { noopEditorIntents } from "../../../../../app/routes/editor/store/testing";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach((): void => {
  document.body.replaceChildren();
});

interface TestPluginIntents {
  myPlugin: {
    setAction(action: string): void;
  };
}

async function renderWithIntents(
  intents: EditorBaseIntents,
  node: React.ReactNode,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <EditorIntentsProvider intents={intents}>{node}</EditorIntentsProvider>,
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

describe("useEditorIntents", () => {
  it("returns the provided base intents", async () => {
    let received: EditorBaseIntents | null = null;

    function Reader(): null {
      received = useEditorIntents();
      return null;
    }

    const view = await renderWithIntents(noopEditorIntents, <Reader />);
    expect(received).toBe(noopEditorIntents);
    await view.unmount();
  });

  it("narrows the plugin intent groups of the composition root", async () => {
    const calls: string[] = [];
    const intents: EditorBaseIntents & TestPluginIntents = {
      ...noopEditorIntents,
      myPlugin: {
        setAction(action: string): void {
          calls.push(action);
        },
      },
    };
    let received: TestPluginIntents["myPlugin"] | null = null;

    function Reader(): null {
      received = useEditorIntents<TestPluginIntents>().myPlugin;
      return null;
    }

    const view = await renderWithIntents(intents, <Reader />);
    expect(received).not.toBeNull();
    received?.setAction("draw");
    expect(calls).toEqual(["draw"]);
    await view.unmount();
  });
});
