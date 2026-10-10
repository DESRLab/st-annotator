import { default as React, useState, type ReactNode } from "react";

import { TabberPaneView } from "../../widgets/TabberPane.react.tsx";

import { LayerSelectionPaneView } from "./LayerSelectionPane.react.tsx";
import type { LayerSelectionOption } from "./LayerSelectionPane.react.tsx";

interface TabSpec {
  title: string;
  children: React.ReactNode;
}

interface TabbedReactHostProps {
  tabs: readonly TabSpec[];
  disabled?: boolean;
  hidden?: boolean;
  initialTab?: string;
}

export function TabbedReactHost({
  tabs,
  disabled = false,
  hidden = false,
  initialTab,
}: TabbedReactHostProps): React.JSX.Element {
  return (
    <TabberPaneView
      initialTab={initialTab}
      onInputChange={() => {}}
      paneParams={{
        inputtedData: {},
        settings: { disabled, hidden },
      }}
      tabs={Object.fromEntries(
        tabs.map(({ title, children }) => [title, children]),
      )}
    />
  );
}

/**
 * Hosts the content of the active layer, remounting it whenever the active
 * layer changes so layer-owned React state never leaks across layers.
 */
export function ActiveLayerReactHost({
  activeKey,
  content,
  emptyText = "(No layer selected)",
}: {
  activeKey: string | null;
  /** The rendered content of the active layer, or `null` if it has none. */
  content: ReactNode;
  emptyText?: string;
}): React.JSX.Element {
  return (
    <React.Fragment key={activeKey ?? ""}>
      {activeKey == null ? emptyText : content}
    </React.Fragment>
  );
}

interface LayerSelectHostProps {
  activeKey: string | null;
  layerOptions: readonly LayerSelectionOption[];
  renderLayerContent: (key: string) => ReactNode;
}

/**
 * Shows a layer selector plus the content of the selected layer.
 *
 * The selection defaults to the active layer and resets whenever the active
 * layer changes, as the former `layer-activate` subscription did.
 */
export function LayerSelectHost({
  activeKey,
  layerOptions,
  renderLayerContent,
}: LayerSelectHostProps): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(activeKey);
  const [trackedActiveKey, setTrackedActiveKey] = useState<string | null>(
    activeKey,
  );

  if (trackedActiveKey !== activeKey) {
    setTrackedActiveKey(activeKey);
    setSelectedKey(activeKey);
  }

  return (
    <LayerSelectionPaneView
      onInputChange={({ selectedKey: nextKey }): void =>
        setSelectedKey(nextKey)
      }
      paneParams={{
        computedData: { layers: layerOptions },
        inputtedData: { selectedKey },
        settings: { disabled: false, hidden: false },
      }}
    >
      {selectedKey == null ? null : renderLayerContent(selectedKey)}
    </LayerSelectionPaneView>
  );
}
