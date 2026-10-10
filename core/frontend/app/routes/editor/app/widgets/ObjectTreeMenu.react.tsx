import { default as React } from "react";

import { useEditorSelector } from "../../store";

import { ActiveLayerReactHost } from "./MenuHosts.react.tsx";

/** The Scene Objects panel: renders the object tree of the active layer. */
export function ObjectTreeMenuView(): React.JSX.Element {
  const activeKey = useEditorSelector((state) => state.ui.activeLayerKey);
  const views = useEditorSelector((state) => state.layers.views);

  const content =
    activeKey == null ? null : (views.get(activeKey)?.objectTreeView ?? null);
  return <ActiveLayerReactHost activeKey={activeKey} content={content} />;
}
