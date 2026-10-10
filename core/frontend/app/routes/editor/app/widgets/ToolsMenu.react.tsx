import { default as React } from "react";

import { useEditorSelector } from "../../store";

import { ActiveLayerReactHost } from "./MenuHosts.react.tsx";

/** The Tools panel: renders the tools view of the active layer. */
export function ToolsMenuView(): React.JSX.Element {
  const activeKey = useEditorSelector((state) => state.ui.activeLayerKey);
  const views = useEditorSelector((state) => state.layers.views);

  const content =
    activeKey == null ? null : (views.get(activeKey)?.toolsView ?? null);
  return <ActiveLayerReactHost activeKey={activeKey} content={content} />;
}
