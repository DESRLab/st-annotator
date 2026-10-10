import { default as React, useMemo } from "react";

import { useEditorIntents, useEditorSelector } from "../../store";

import { LayersPaneView } from "./LayersPane.react.tsx";
import type { LayersPaneRow } from "./LayersPane.react.tsx";
import { TabbedReactHost } from "./MenuHosts.react.tsx";

const SOURCE_TAB = "Source Data";
const LABEL_TAB = "Label Data";

interface LayersTabProps {
  activeKey: string | null;
  layerEntries: readonly LayersPaneRow[];
  activateLayer: (key: string) => void;
  setLayerEnabled: (key: string, enabled: boolean) => void;
}

function LayersTab({
  activeKey,
  layerEntries,
  activateLayer,
  setLayerEnabled,
}: LayersTabProps): React.JSX.Element {
  return (
    <LayersPaneView
      layers={layerEntries}
      onClickRow={activateLayer}
      onInputChange={({ layersEnabled }) =>
        layerEntries.forEach((entry, index) => {
          setLayerEnabled(entry.key, layersEnabled[index] ?? false);
        })
      }
      onToggleAll={() => {
        const enabled = !layerEntries.every((entry) => entry.enabled);
        for (const entry of layerEntries) setLayerEnabled(entry.key, enabled);
      }}
      paneParams={{
        inputtedData: {
          layersEnabled: layerEntries.map(({ enabled }) => enabled),
        },
        computedData: { activeKey },
        settings: { disabled: false, hidden: false },
      }}
    />
  );
}

/**
 * The Layers panel: per-tab rows for the source and label data layers, read
 * from the editor state snapshot and mutated through the editor intents.
 */
export function LayersMenuView(): React.JSX.Element {
  const order = useEditorSelector((state) => state.layers.order);
  const metadata = useEditorSelector((state) => state.layers.metadata);
  const views = useEditorSelector((state) => state.layers.views);
  const layerUi = useEditorSelector((state) => state.ui.layers);
  const activeKey = useEditorSelector((state) => state.ui.activeLayerKey);
  const intents = useEditorIntents();

  const rows = useMemo(
    () =>
      order.map((key) => {
        const descriptor = metadata.get(key);
        return {
          key,
          kind: descriptor?.kind ?? "source",
          row: {
            key,
            name: descriptor?.name ?? key,
            enabled: layerUi.get(key)?.enabled ?? false,
            actionsView: views.get(key)?.actionsView ?? null,
          } satisfies LayersPaneRow,
        };
      }),
    [layerUi, metadata, order, views],
  );
  const sourceDataLayers = useMemo(
    () =>
      rows.filter((entry) => entry.kind === "source").map((entry) => entry.row),
    [rows],
  );
  const labelDataLayers = useMemo(
    () =>
      rows.filter((entry) => entry.kind === "label").map((entry) => entry.row),
    [rows],
  );

  return (
    <div className="layer-menu" data-test="editor-layers-menu">
      <TabbedReactHost
        initialTab={LABEL_TAB}
        tabs={[
          {
            title: SOURCE_TAB,
            children: (
              <LayersTab
                activeKey={activeKey}
                activateLayer={intents.activateLayer.bind(intents)}
                layerEntries={sourceDataLayers}
                setLayerEnabled={intents.setLayerEnabled.bind(intents)}
              />
            ),
          },
          {
            title: LABEL_TAB,
            children: (
              <LayersTab
                activeKey={activeKey}
                activateLayer={intents.activateLayer.bind(intents)}
                layerEntries={labelDataLayers}
                setLayerEnabled={intents.setLayerEnabled.bind(intents)}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
