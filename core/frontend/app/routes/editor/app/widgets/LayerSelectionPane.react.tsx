import { default as React, useMemo } from "react";

import {
  lazyPaneFactory,
  TweakpanePaneHost,
  PaneElementFactoryBuilder,
} from "../../widgets";
import type { PaneElementParams, TweakpanePaneDefinition } from "../../widgets";

/** Plain option for the layer selector. */
export interface LayerSelectionOption {
  readonly key: string;
  readonly name: string;
}

interface LayerSelectionInputtedData {
  selectedKey: string | null;
}

interface LayerSelectionComputedData {
  layers: readonly LayerSelectionOption[];
}

interface LayerSelectionPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LayerSelectionSource {
  layers: readonly LayerSelectionOption[];
}

export interface LayerSelectionState {
  selectedKey: string | null;
}

export interface LayerSelectionPaneParams {
  inputtedData: LayerSelectionInputtedData;
  computedData: LayerSelectionComputedData;
  settings: LayerSelectionPaneSettings;
  internalData: LayerSelectionSource | null;
  outputData: LayerSelectionState;
}

type LayerSelectionPaneElementParams =
  PaneElementParams<LayerSelectionPaneParams>;

function createLayerSelectionPaneDefinition(
  contentElem: HTMLElement,
): TweakpanePaneDefinition<LayerSelectionPaneParams> {
  const definition: TweakpanePaneDefinition<LayerSelectionPaneParams> & {
    FACTORY_PARAMS: LayerSelectionPaneElementParams;
  } = {
    FACTORY_PARAMS: {
      inputtedData: { selectedKey: null },
      computedData: {
        layers: [] as readonly LayerSelectionOption[],
      },
      settings: { disabled: false, hidden: false },
    },

    factory: lazyPaneFactory(
      [],
      () => {
        const builder = PaneElementFactoryBuilder.withoutEvents(
          definition.FACTORY_PARAMS,
        );

        return builder.sequential([
          builder.list(["inputtedData", "selectedKey"], {
            options: ({
              computedData: { layers },
              settings: { disabled, hidden },
            }) => ({
              label: "Configure Layer:",
              options: [
                { text: "(No layer selected)", value: null },
                ...layers.map((layer) => ({
                  text: layer.name,
                  value: layer.key,
                })),
              ],
              disabled,
              hidden,
            }),
          }),
          builder.separator({
            options: ({ settings: { disabled, hidden } }) => ({
              disabled,
              hidden,
            }),
          }),
          builder.separator({
            options: ({ settings: { disabled, hidden } }) => ({
              disabled,
              hidden,
            }),
            modifyHTML: (element) => {
              element.style.paddingTop = "2px";
            },
          }),
          builder.htmlContainer({
            options: () => ({ innerElem: contentElem }),
          }),
        ]);
      },
      { operationPath: ["layerSelection"] },
    ),

    dataProcessor: {
      computeData: (
        _inputtedData: Readonly<LayerSelectionInputtedData>,
        internalData: Readonly<LayerSelectionSource | null>,
      ) => ({
        layers: internalData?.layers ?? [],
      }),
      outputData: ({
        inputtedData: { selectedKey },
      }: Readonly<LayerSelectionPaneElementParams>) => ({ selectedKey }),
    },
  };
  return definition;
}

interface LayerSelectionPaneViewProps {
  children?: React.ReactNode;
  paneParams: Pick<LayerSelectionPaneParams, "inputtedData" | "settings"> & {
    computedData: Pick<LayerSelectionComputedData, "layers">;
  };
  onInputChange: (change: LayerSelectionState) => void;
}

export function LayerSelectionPaneView({
  children,
  paneParams,
  onInputChange,
}: LayerSelectionPaneViewProps): React.JSX.Element {
  const internalData = useMemo<LayerSelectionSource>(
    () => ({
      layers: paneParams.computedData.layers,
    }),
    [paneParams.computedData.layers],
  );
  const definition = useMemo(
    () =>
      (
        slots: Readonly<Record<string, HTMLDivElement>>,
      ): TweakpanePaneDefinition<LayerSelectionPaneParams> =>
        createLayerSelectionPaneDefinition(slots.content),
    [],
  );

  return (
    <>
      <TweakpanePaneHost
        definition={definition}
        onInputChange={onInputChange}
        paneParams={{
          inputtedData: paneParams.inputtedData,
          internalData,
          settings: paneParams.settings,
        }}
        slots={{ content: children ?? null }}
      />
    </>
  );
}
