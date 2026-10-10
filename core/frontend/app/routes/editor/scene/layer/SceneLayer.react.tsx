import type { CSSProperties, ReactNode } from "react";

export function LayerPanelPlaceholder({
  text,
  align = "center",
}: {
  text: string;
  align?: CSSProperties["justifyContent"];
}): ReactNode {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        height: "100%",
        justifyContent: align,
        width: "100%",
      }}
    >
      {text}
    </div>
  );
}

/** Cache for {@link memoizeRender}. */
export interface RenderMemo {
  built?: boolean;
  deps?: readonly unknown[];
  node?: ReactNode;
}

/**
 * Returns a React node rebuilt only when `deps` changes (shallow compare).
 *
 * The node keeps its identity between rebuilds, so reference equality can be
 * used to detect that the rendered content changed.
 */
export function memoizeRender(
  memo: RenderMemo,
  deps: readonly unknown[],
  render: () => ReactNode,
): ReactNode {
  const prevDeps = memo.deps;
  if (
    memo.built === true &&
    prevDeps?.length === deps.length &&
    deps.every((dep, i) => Object.is(dep, prevDeps[i]))
  ) {
    return memo.node;
  }

  memo.built = true;
  memo.deps = deps;
  memo.node = render();
  return memo.node;
}
