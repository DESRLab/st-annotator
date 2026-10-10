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

export interface AccordionPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface AccordionPaneParams {
  inputtedData: {};
  computedData: {};
  settings: AccordionPaneSettings;
  internalData: {};
  outputData: {};
}

type AccordionPaneElementParams = PaneElementParams<AccordionPaneParams>;

/** Dummy arguments to pass into {@link PaneElementFactoryBuilder}. */
export const accordionPaneFactoryParams = {
  inputtedData: {},
  computedData: {},
  settings: {
    disabled: false,
    hidden: false,
  },
};

/** Creates native Tweakpane folders for supplied elements. */
function createAccordionPaneElementFactory(
  folders: Record<string, HTMLElement>,
): PaneElementFactory<AccordionPaneElementParams, {}> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    accordionPaneFactoryParams,
  );

  return builder.sequential(
    Object.entries(folders).map(([title, elem]) =>
      builder.folder(builder.htmlContainer({ options: { innerElem: elem } }), {
        options: ({ settings: { disabled, hidden } }) => ({
          title,
          disabled,
          hidden,
        }),
      }),
    ),
  );
}

/** Data processor for accordion panes. */
export const accordionPaneDataProcessor: PaneControllerDataProcessor<AccordionPaneParams> =
  {
    computeData: () => ({}),
    outputData: () => ({}),
  };

export interface AccordionPaneViewProps {
  folders: Record<string, React.ReactNode>;
  paneParams: Pick<AccordionPaneParams, "inputtedData" | "settings"> &
    Partial<Pick<AccordionPaneParams, "internalData">>;
  onInputChange: (change: {}) => void;
}

export function AccordionPaneView({
  folders,
  paneParams,
  onInputChange,
}: AccordionPaneViewProps): React.JSX.Element {
  const { elements: folderElements, portals } = useTweakpaneSlots(folders);
  const definition = useMemo(
    () => ({
      dataProcessor: accordionPaneDataProcessor,
      factory: createAccordionPaneElementFactory(folderElements),
    }),
    [folderElements],
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

/** Native Tweakpane accordion with no application state bridge. */
export function AccordionPaneHost({
  folders,
}: {
  folders: Record<string, React.ReactNode>;
}): React.JSX.Element {
  return (
    <AccordionPaneView
      folders={folders}
      onInputChange={() => {}}
      paneParams={{
        inputtedData: accordionPaneFactoryParams.inputtedData,
        settings: accordionPaneFactoryParams.settings,
      }}
    />
  );
}
