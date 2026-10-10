import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export interface RenderedTestView {
  readonly container: HTMLDivElement;
  rerender(node: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

/** Mounts a React node in a disposable DOM container with updates wrapped in `act`. */
export async function renderTestView(
  node: ReactNode,
): Promise<RenderedTestView> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const rerender = async (nextNode: ReactNode): Promise<void> => {
    await act(async () => root.render(nextNode));
  };
  await rerender(node);

  return {
    container,
    rerender,
    unmount: async (): Promise<void> => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
