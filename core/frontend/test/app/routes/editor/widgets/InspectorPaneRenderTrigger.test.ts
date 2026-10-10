import { describe, expect, it, vi } from "vitest";

import { VanillaEventDispatcher } from "../../../../../app/routes/editor/utils/VanillaEventDispatcher";
import { InspectorRenderSignaller } from "../../../../../app/routes/editor/widgets/InspectorPaneRenderTrigger";

class FakeRenderLabels extends VanillaEventDispatcher {}

describe("InspectorRenderSignaller", () => {
  it("emits typed render events when its labels source changes", () => {
    const signallers = [
      new InspectorRenderSignaller({}),
      new InspectorRenderSignaller({}),
      new InspectorRenderSignaller({}),
    ];

    for (const signaller of signallers) {
      const listener = vi.fn();
      signaller.addEventListener("render", listener);
      signaller.labels = new FakeRenderLabels();
      expect(listener).toHaveBeenCalledOnce();

      signaller.removeEventListener("render", listener);
      signaller.labels = new FakeRenderLabels();
      expect(listener).toHaveBeenCalledOnce();

      signaller.dispose();
    }
  });
});
