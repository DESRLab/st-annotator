import { default as React, useMemo } from "react";

import { TweakpanePaneHost } from "../../widgets";
import type { TweakpanePaneDefinition } from "../../widgets";

import {
  createLayersPaneDataProcessor,
  createLayersPaneElementFactory,
} from "./LayersPane.ts";
import type {
  LayersInputtedData,
  LayersPaneDefinition,
  LayersPaneEventMap,
  LayersPaneParams,
} from "./LayersPane.ts";

export * from "./LayersPane.ts";

/** A layer row plus the React-owned Actions-column leaf. */
export interface LayersPaneRow extends LayersPaneDefinition {
  readonly actionsView: React.ReactNode;
}

interface LayersPaneViewProps {
  layers: readonly LayersPaneRow[];
  paneParams: Pick<LayersPaneParams, "inputtedData" | "settings"> &
    Partial<Pick<LayersPaneParams, "computedData" | "internalData">>;
  onInputChange: (change: LayersInputtedData) => void;
  onToggleAll?: () => void;
  onClickRow?: (key: string) => void;
  onPaneEvent?: (event: { type: string; key?: string }) => void;
}

export function LayersPaneView({
  layers,
  paneParams,
  onInputChange,
  onToggleAll,
  onClickRow,
  onPaneEvent,
}: LayersPaneViewProps): React.JSX.Element {
  const activeKey =
    paneParams.internalData?.activeKey ??
    paneParams.computedData?.activeKey ??
    null;
  const actionSlotNames = useMemo(
    () => layers.map((_, index) => `actions-${index}`),
    [layers],
  );
  const actionSlots = useMemo(
    () =>
      Object.fromEntries(
        layers.map((layer, index) => [
          actionSlotNames[index],
          layer.actionsView,
        ]),
      ),
    [actionSlotNames, layers],
  );
  const definition = useMemo(
    () =>
      (
        slots: Readonly<Record<string, HTMLDivElement>>,
      ): TweakpanePaneDefinition<LayersPaneParams, LayersPaneEventMap> => ({
        dataProcessor: createLayersPaneDataProcessor(layers),
        factory: createLayersPaneElementFactory(
          layers,
          new Map(
            layers.map((layer, index) => [
              layer.key,
              slots[actionSlotNames[index]],
            ]),
          ),
        ),
      }),
    [actionSlotNames, layers],
  );

  return (
    <>
      <TweakpanePaneHost
        definition={definition}
        mapOutputChange={({ outputData }) => ({
          layersEnabled: layers.map(
            (layer) => outputData.isLayerEnabled.get(layer.key) ?? false,
          ),
        })}
        onInputChange={onInputChange}
        onPaneEvent={(event) => {
          onPaneEvent?.(event);
          if (event.type === "click-toggleAll") onToggleAll?.();
          if (event.type === "click-row" && "key" in event)
            onClickRow?.(event.key);
        }}
        paneEventTypes={["click-toggleAll", "click-row"]}
        paneParams={{
          inputtedData: paneParams.inputtedData,
          internalData: { activeKey },
          settings: paneParams.settings,
        }}
        slots={actionSlots}
      />
    </>
  );
}
