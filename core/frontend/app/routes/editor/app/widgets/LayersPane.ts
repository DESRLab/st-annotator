import { PaneElementFactoryBuilder, toDataTestSlug } from "../../widgets";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
} from "../../widgets";

/** A plain layer definition consumed by the native pane factory. */
export interface LayersPaneDefinition {
  readonly key: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface LayersInputtedData {
  layersEnabled: readonly boolean[];
}

interface LayersComputedData {
  activeKey: string | null;
}

interface LayersPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LayersSource {
  activeKey: string | null;
}

interface LayersState {
  isLayerEnabled: Map<string, boolean>;
}

export interface LayersPaneParams {
  inputtedData: LayersInputtedData;
  computedData: LayersComputedData;
  settings: LayersPaneSettings;
  internalData: LayersSource | null;
  outputData: LayersState;
}

type LayersPaneElementParams = PaneElementParams<LayersPaneParams>;

export interface LayersPaneEventMap {
  "click-toggleAll": {};
  "click-row": { key: string };
}

function getToggleAllButtonSettings(
  layers: readonly LayersPaneDefinition[],
  { settings: { disabled, hidden } }: Pick<LayersPaneParams, "settings">,
): { title: string; disabled: boolean; hidden: boolean } {
  return {
    title: layers.every((layer) => layer.enabled)
      ? "Disable All"
      : "Enable All",
    disabled,
    hidden,
  };
}

/** Gets default pane params for provided layers. */
function getLayersPaneFactoryParams(
  layers: readonly LayersPaneDefinition[],
): Readonly<LayersPaneElementParams> {
  return {
    inputtedData: {
      layersEnabled: layers.map(() => false),
    },
    computedData: {
      activeKey: null,
    },
    settings: {
      disabled: false,
      hidden: false,
    },
  };
}

/** Creates native Tweakpane layer controls. */
export function createLayersPaneElementFactory(
  layers: readonly LayersPaneDefinition[],
  actionHosts: ReadonlyMap<string, HTMLDivElement>,
): PaneElementFactory<LayersPaneElementParams, LayersPaneEventMap> {
  const builder = new PaneElementFactoryBuilder(
    getLayersPaneFactoryParams(layers),
    ["click-toggleAll", "click-row"],
  );

  const clickRowEventListeners = new Map<string, () => void>();

  return builder.sequential([
    builder.tableHead({
      options: ({ settings: { disabled, hidden } }) => ({
        label: "Layer",
        headers: [
          { label: "Enabled", width: "64px" },
          { label: "Actions", width: "auto" },
        ],
        disabled: disabled,
        hidden: hidden,
      }),
      modifyHTML: (element) => {
        element.classList.add("layer-menu-table-header");

        for (const label of element.querySelectorAll(".tp-lblv .tp-lblv_l")) {
          if (label instanceof HTMLDivElement) {
            label.style.textDecorationLine = "underline";
          }
        }

        const cellsContainer = element.querySelector(".tp-lblv_v");
        if (cellsContainer instanceof HTMLDivElement) {
          const cellsWrapper = cellsContainer.querySelector(
            ".tp-tablev.tp-headv",
          );
          if (cellsWrapper instanceof HTMLDivElement) {
            cellsWrapper.style.alignItems = "center";

            const lastCell = [
              ...cellsWrapper.querySelectorAll(".tp-headcv"),
            ].at(-1);
            if (lastCell instanceof HTMLDivElement) {
              lastCell.style.marginTop = "0px";
              lastCell.style.flexGrow = "1";
            } else {
              console.warn("Cannot find last cell");
            }
          } else {
            console.warn("Cannot find cells wrapper");
          }
        } else {
          console.warn("Cannot find cells container");
        }
      },
    }),
    ...layers.map((layer, i) =>
      builder.tableRow(
        [
          {
            factory: builder.input(
              ["inputtedData", "layersEnabled", i.toString()],
              {
                options: ({ settings: { disabled, hidden } }) => ({
                  disabled,
                  hidden,
                }),
              },
            ),
            options: ({ settings: { disabled, hidden } }) => ({
              width: "64px",
              disabled: disabled,
              hidden: hidden,
            }),
          },
          {
            factory: builder.htmlContainer({
              options: () => ({
                innerElem: actionHosts.get(layer.key)!,
              }),
              modifyHTML: (element) => {
                element.style.marginTop = "0px";
              },
            }),
            options: ({ settings: { disabled, hidden } }) => ({
              disabled,
              hidden,
            }),
          },
        ],
        {
          options: ({ settings: { disabled, hidden } }) => ({
            label: layer.name,
            disabled: disabled,
            hidden: hidden,
          }),
          modifyHTML: (element, { computedData: { activeKey } }, paneElem) => {
            element.classList.add("layer-menu-table-row");
            element.dataset.test =
              "editor-layer-row-" + toDataTestSlug(layer.name);

            const labelContainer = element.querySelector(".tp-lblv_l");
            if (labelContainer instanceof HTMLDivElement) {
              labelContainer.classList.add("layer-name");
              labelContainer.dataset.test = "editor-layer-name";

              if (layer.key === activeKey) {
                labelContainer.classList.add("active");
              } else {
                labelContainer.classList.remove("active");
              }

              const eventListener =
                clickRowEventListeners.get(layer.key) ??
                (() =>
                  paneElem.dispatchEvent({
                    type: "click-row",
                    key: layer.key,
                  }));
              clickRowEventListeners.set(layer.key, eventListener);

              if (layer.enabled) {
                labelContainer.style.cursor = "pointer";

                labelContainer.removeEventListener("click", eventListener);
                labelContainer.addEventListener("click", eventListener);
              } else {
                labelContainer.style.cursor = "not-allowed";

                labelContainer.removeEventListener("click", eventListener);
              }
            } else {
              console.warn("Cannot find label container");
            }

            const cellsContainer = element.querySelector(".tp-lblv_v");
            if (cellsContainer instanceof HTMLDivElement) {
              const cellsWrapper =
                cellsContainer.querySelector(".tp-tablev.tp-rowv");
              if (cellsWrapper instanceof HTMLDivElement) {
                cellsWrapper.style.alignItems = "center";

                const lastCell = [
                  ...cellsWrapper.querySelectorAll(".tp-rowcv"),
                ].at(-1);
                if (lastCell instanceof HTMLDivElement) {
                  lastCell.style.marginTop = "0px";
                  lastCell.style.flexGrow = "1";
                } else {
                  console.warn("Cannot find last cell");
                }
              } else {
                console.warn("Cannot find cells wrapper");
              }
            } else {
              console.warn("Cannot find cells container");
            }
          },
        },
      ),
    ),
    builder.separator({
      options: ({ settings: { disabled, hidden } }) => ({
        disabled,
        hidden,
      }),
    }),
    builder.button({
      options: (paneParams) => getToggleAllButtonSettings(layers, paneParams),
      eventHandlers: {
        click: (paneElem) =>
          paneElem.dispatchEvent({ type: "click-toggleAll" }),
      },
    }),
  ]);
}

/** Creates data processor bound to provided layers. */
export function createLayersPaneDataProcessor(
  layers: readonly LayersPaneDefinition[],
): PaneControllerDataProcessor<LayersPaneParams> {
  return {
    computeData: (_inputtedData, internalData) => ({
      activeKey: internalData?.activeKey ?? null,
    }),
    outputData: ({ inputtedData: { layersEnabled } }) => ({
      isLayerEnabled: new Map(
        layers.map((layer, i) => [layer.key, layersEnabled[i]]),
      ),
    }),
  };
}
