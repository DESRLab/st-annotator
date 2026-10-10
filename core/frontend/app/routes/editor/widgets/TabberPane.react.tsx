import { default as React, useMemo } from "react";

import {
  TweakpanePaneHost,
  useTweakpaneSlots,
} from "./TweakpanePaneHost.react.tsx";
import { PaneElementFactoryBuilder } from "./pane";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
} from "./pane";

export interface TabberPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface TabberPaneParams {
  inputtedData: {};
  computedData: {};
  settings: TabberPaneSettings;
  internalData: {};
  outputData: {};
}

type TabberPaneElementParams = PaneElementParams<TabberPaneParams>;

/**
 * Represents a tabber with React content hosted in native Tweakpane slots.
 */
/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
const tabberPaneFactoryParams = {
  inputtedData: {},
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
  },
};

/** Creates native Tweakpane tabs for React-owned slot elements. */
function createTabberPaneElementFactory(
  tabElements: Record<string, HTMLElement>,
  initialTab?: string,
): PaneElementFactory<TabberPaneElementParams, {}> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    tabberPaneFactoryParams,
  );

  return builder.tab(
    Object.entries(tabElements).map(([title, innerElem]) => ({
      factory: builder.htmlContainer({ options: { innerElem } }),
      options:
        initialTab == null
          ? { title }
          : { selected: title === initialTab, title },
    })),
    {
      options: ({ settings: { disabled, hidden } }) => ({
        disabled,
        hidden,
      }),
    },
  );
}

/** Data processor for tab panes. */
export const tabberPaneDataProcessor: PaneControllerDataProcessor<TabberPaneParams> =
  {
    computeData: () => ({}),
    outputData: () => ({}),
  };

export interface TabberPaneViewProps {
  tabs: Record<string, React.ReactNode>;
  paneParams: Pick<TabberPaneParams, "inputtedData" | "settings"> &
    Partial<Pick<TabberPaneParams, "internalData">>;
  onInputChange: (change: {}) => void;
  initialTab?: string;
}

export function TabberPaneView({
  tabs,
  paneParams,
  onInputChange,
  initialTab,
}: TabberPaneViewProps): React.JSX.Element {
  const { elements: tabElements, portals } = useTweakpaneSlots(tabs);
  const definition = useMemo(
    () => ({
      dataProcessor: tabberPaneDataProcessor,
      factory: createTabberPaneElementFactory(tabElements, initialTab),
    }),
    [initialTab, tabElements],
  );

  return (
    <>
      <TweakpanePaneHost
        definition={definition}
        onInputChange={onInputChange}
        paneParams={paneParams}
      />
      {portals}
    </>
  );
}
