import { default as React, useMemo } from "react";

import { useEditorSelector } from "../../store";

import { LayerSelectHost, TabbedReactHost } from "./MenuHosts.react.tsx";

export interface PreferencesMenuViewProps {
  globalSettingsTabs: Record<string, React.ReactNode>;
}

/**
 * The Preferences panel: the global settings tabs plus a generated "Layer"
 * tab showing the preferences view of the selected layer.
 */
export function PreferencesMenuView({
  globalSettingsTabs,
}: PreferencesMenuViewProps): React.JSX.Element {
  if ("Layer" in globalSettingsTabs) {
    throw new Error(
      'PreferencesMenuView generates a tab called "Layer", which conflicts with the provided global settings tabs',
    );
  }

  const activeKey = useEditorSelector((state) => state.ui.activeLayerKey);
  const order = useEditorSelector((state) => state.layers.order);
  const metadata = useEditorSelector((state) => state.layers.metadata);
  const views = useEditorSelector((state) => state.layers.views);

  const layerOptions = useMemo(
    () => order.map((key) => ({ key, name: metadata.get(key)?.name ?? key })),
    [metadata, order],
  );

  return (
    <TabbedReactHost
      tabs={[
        ...Object.entries(globalSettingsTabs).map(([title, element]) => ({
          title,
          children: element,
        })),
        {
          title: "Layer",
          children: (
            <LayerSelectHost
              activeKey={activeKey}
              layerOptions={layerOptions}
              renderLayerContent={(key) => views.get(key)?.prefsView ?? null}
            />
          ),
        },
      ]}
    />
  );
}
