import type { SelectableItem } from "../../store";
import { lazyPaneFactory, PaneElementFactoryBuilder } from "../../widgets";
import type { PaneElementParams, TweakpanePaneDefinition } from "../../widgets";

interface SceneSelectionInputtedData {
  taskId: number | null;
  sourceGroupId: number | null;
  labelBranchId: number | null;
  frameProgress: { completed: number; total: number };
}

interface SceneSelectionComputedData {
  tasks: readonly SelectableItem[];
  sourceGroups: readonly SelectableItem[];
  labelBranches: readonly SelectableItem[];
  unsavedBranchIds: ReadonlySet<number>;
  isSaving: boolean;
}

interface SceneSelectionPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disableSave: boolean;
}

interface SceneSelectionSource {
  tasks: readonly SelectableItem[];
  sourceGroups: readonly SelectableItem[];
  labelBranches: readonly SelectableItem[];
  unsavedBranchIds: ReadonlySet<number>;
  isSaving: boolean;
}

/** The id-based scene-selection output emitted by the pane. */
export interface SceneSelectionState {
  taskId: number | null;
  sourceGroupId: number | null;
  labelBranchId: number | null;
}

export interface SceneSelectionPaneParams {
  inputtedData: SceneSelectionInputtedData;
  computedData: SceneSelectionComputedData;
  settings: SceneSelectionPaneSettings;
  internalData: SceneSelectionSource | null;
  outputData: SceneSelectionState;
}

interface SceneSelectionPaneEventMap {
  "click-save": {};
}

/** Native Tweakpane definition hosted by SceneSelectionPaneView. */
export function createSceneSelectionPaneDefinition(
  historyElem: HTMLElement,
): TweakpanePaneDefinition<
  SceneSelectionPaneParams,
  SceneSelectionPaneEventMap
> {
  const definition: TweakpanePaneDefinition<
    SceneSelectionPaneParams,
    SceneSelectionPaneEventMap
  > & {
    FACTORY_PARAMS: Pick<
      SceneSelectionPaneParams,
      "inputtedData" | "computedData" | "settings"
    >;
    getSaveButtonSettings(
      params: Pick<SceneSelectionPaneParams, "computedData" | "settings">,
    ): { title: string; disabled: boolean; hidden: boolean };
  } = {
    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     */
    FACTORY_PARAMS: {
      inputtedData: {
        taskId: null,
        sourceGroupId: null,
        labelBranchId: null,
        frameProgress: { completed: 0, total: 0 },
      },
      computedData: {
        tasks: [],
        sourceGroups: [],
        labelBranches: [],
        unsavedBranchIds: new Set<number>(),
        isSaving: false,
      },
      settings: {
        disabled: false,
        hidden: false,
        disableSave: false,
      },
    },

    /**
     * Obtains the settings for the save button.
     *
     * The parameters of the pane.
     *
     */
    getSaveButtonSettings({
      computedData: { isSaving },
      settings: { disabled, hidden, disableSave },
    }: Pick<SceneSelectionPaneParams, "computedData" | "settings">): {
      title: string;
      disabled: boolean;
      hidden: boolean;
    } {
      return {
        title: isSaving ? "Saving..." : "Save Changes",
        disabled: disabled || disableSave,
        hidden: hidden,
      };
    },

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * scene-selection pane elements.
     *
     * The resulting pane element factory.
     */
    factory: lazyPaneFactory(
      ["click-save"],
      () => {
        const builder = new PaneElementFactoryBuilder(
          definition.FACTORY_PARAMS,
          ["click-save"],
        );

        return builder.sequential([
          builder.list(["inputtedData", "taskId"], {
            options: ({
              computedData: { tasks },
              settings: { disabled, hidden },
            }) => ({
              label: "Task:",
              options:
                tasks.length === 0
                  ? [
                      {
                        text: "(No task selected)",
                        value: null,
                      },
                    ]
                  : tasks.map((task) => ({
                      text: `[#${task.id}] ${task.name}`,
                      value: task.id,
                    })),
              disabled: disabled,
              hidden: hidden,
            }),
            modifyHTML: (element) => {
              const listContainer = element.querySelector(".tp-lblv_v");
              if (listContainer instanceof HTMLDivElement) {
                listContainer.style.width = "80%";
              } else {
                console.warn("Cannot find list container");
              }
            },
          }),
          builder.separator({
            options: ({ settings: { disabled, hidden } }) => ({
              disabled,
              hidden,
            }),
          }),
          builder.list(["inputtedData", "sourceGroupId"], {
            options: ({
              computedData: { sourceGroups },
              settings: { disabled, hidden },
            }) => ({
              label: "Source Group:",
              options:
                sourceGroups.length === 0
                  ? [
                      {
                        text: "(No group selected)",
                        value: null,
                      },
                    ]
                  : sourceGroups.map((group) => ({
                      text: `[#${group.id}] ${group.name}`,
                      value: group.id,
                    })),
              disabled: disabled,
              hidden: hidden,
            }),
            modifyHTML: (element) => {
              const listContainer = element.querySelector(".tp-lblv_v");
              if (listContainer instanceof HTMLDivElement) {
                listContainer.style.width = "66%";
              } else {
                console.warn("Cannot find list container");
              }
            },
          }),
          builder.list(["inputtedData", "labelBranchId"], {
            options: ({
              computedData: { labelBranches, unsavedBranchIds },
              settings: { disabled, hidden },
            }) => ({
              label: "Label Branch:",
              options:
                labelBranches.length === 0
                  ? [
                      {
                        text: "(No branch selected)",
                        value: null,
                      },
                    ]
                  : labelBranches.map((branch) => ({
                      text: `[#${branch.id}] ${branch.name}${unsavedBranchIds.has(branch.id) ? "*" : ""}`,
                      value: branch.id,
                    })),
              disabled: disabled,
              hidden: hidden,
            }),
            modifyHTML: (element) => {
              const listContainer = element.querySelector(".tp-lblv_v");
              if (listContainer instanceof HTMLDivElement) {
                listContainer.style.width = "66%";
              } else {
                console.warn("Cannot find list container");
              }
            },
          }),
          builder.separator({
            options: ({ settings: { disabled, hidden } }) => ({
              disabled,
              hidden,
            }),
          }),
          builder.text({
            options: ({
              inputtedData: { frameProgress },
              settings: { disabled, hidden },
            }) => ({
              view: "text",
              label: "Frame Progress",
              value: frameProgress,
              parse: (s) => {
                const matches = /^[0-9,.]+\/[0-9,.]+/.exec(s);
                const [completed, total] = matches
                  ?.slice(1)
                  .map((x) => Number.parseInt(x, 10)) ?? [0, 0];

                return { completed, total };
              },
              format: ({ completed, total }) => {
                const completedFrac = total === 0 ? 0 : completed / total;
                return `${completed}/${total} (${(completedFrac * 100).toPrecision(3)}%) completed`;
              },
              disabled: disabled || true,
              hidden: hidden,
            }),
            modifyHTML: (element) => {
              const listContainer = element.querySelector(".tp-lblv_v");
              if (listContainer instanceof HTMLDivElement) {
                listContainer.style.width = "66%";
              } else {
                console.warn("Cannot find list container");
              }
            },
          }),
          builder.separator({
            options: ({ settings: { disabled, hidden } }) => ({
              disabled,
              hidden,
            }),
          }),
          builder.folder(
            builder.htmlContainer({
              options: () => ({ innerElem: historyElem }),
            }),
            {
              options: ({ settings: { disabled, hidden } }) => ({
                title: "History",
                disabled: disabled,
                hidden: hidden,
              }),
            },
          ),
          builder.separator({
            options: ({ settings: { disabled, hidden } }) => ({
              disabled,
              hidden,
            }),
          }),
          builder.button({
            options: (paneParams) =>
              definition.getSaveButtonSettings(paneParams),
            eventHandlers: {
              click: (paneElem) =>
                paneElem.dispatchEvent({ type: "click-save" }),
            },
          }),
        ]);
      },
      { operationPath: ["sceneSelection"] },
    ),

    /**
     * Data processor for this pane.
     */
    dataProcessor: {
      computeData: (
        _inputtedData: Readonly<SceneSelectionInputtedData>,
        internalData: Readonly<SceneSelectionSource | null>,
      ) => ({
        tasks: internalData?.tasks ?? [],
        sourceGroups: internalData?.sourceGroups ?? [],
        labelBranches: internalData?.labelBranches ?? [],
        unsavedBranchIds: internalData?.unsavedBranchIds ?? new Set<number>(),
        isSaving: internalData?.isSaving ?? false,
      }),
      outputData: (
        paneParams: Readonly<PaneElementParams<SceneSelectionPaneParams>>,
      ) => ({
        taskId: paneParams.inputtedData.taskId,
        sourceGroupId: paneParams.inputtedData.sourceGroupId,
        labelBranchId: paneParams.inputtedData.labelBranchId,
      }),
    },
  };
  return definition;
}
