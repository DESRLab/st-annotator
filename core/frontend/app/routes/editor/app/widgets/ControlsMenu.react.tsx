import { parseKeyCombo } from "@rwh/keystrokes";
import { default as React, useMemo } from "react";

import { LayerControlsContentView } from "../../scene/layer/LayerControlsContent.react.tsx";
import { useEditorSelector } from "../../store";
import type { LayerControlsSource } from "../../store";
import { useSourceEventVersion } from "../../widgets/useSourceEvent.react.ts";
import type { ComposableKeybindHandler, Keybind } from "../Keybinds";

import { LayerSelectHost, TabbedReactHost } from "./MenuHosts.react.tsx";

interface GeneralControlsViewProps {
  generalHandlers: Record<string, ComposableKeybindHandler>;
}

interface ControlsSection {
  title: string;
  keybinds: readonly Keybind[];
}

function getGeneralControlsSections(
  generalHandlers: Record<string, ComposableKeybindHandler>,
): ControlsSection[] {
  return Object.entries(generalHandlers).flatMap(
    ([title, { children, keybinds }]) => {
      const keybindsArr = [...keybinds].concat(
        children.flatMap(({ keybinds: childKeybinds }) => [...childKeybinds]),
      );

      return keybindsArr.length === 0 ? [] : [{ title, keybinds: keybindsArr }];
    },
  );
}

export function KeybindText({
  keybind,
}: {
  keybind: Keybind;
}): React.JSX.Element {
  return (
    <>
      {parseKeyCombo(keybind.keyCombo).map((sequence, sequenceIndex) => (
        <React.Fragment key={sequenceIndex}>
          {sequenceIndex === 0 ? null : " "}
          <kbd>
            {sequence
              .map((group) => group.map((unit) => unit.toUpperCase()).join("+"))
              .join(" > ")}
          </kbd>
        </React.Fragment>
      ))}{" "}
      {keybind.name}
    </>
  );
}

export function GeneralControlsView({
  generalHandlers,
}: GeneralControlsViewProps): React.JSX.Element {
  const keybindHandlers = useMemo(
    () => Object.values(generalHandlers),
    [generalHandlers],
  );
  useSourceEventVersion(keybindHandlers, "change");

  const sections = getGeneralControlsSections(generalHandlers);

  return (
    <div style={{ width: "100%", paddingLeft: "var(--cnt-hp)" }}>
      {sections.map(({ keybinds, title }, sectionIndex) => (
        <React.Fragment key={title}>
          {sectionIndex === 0 ? null : <div style={{ marginTop: "8px" }} />}
          <b>{title}</b>
          {keybinds.map((keybind) => (
            <div
              key={`${keybind.keyCombo}:${keybind.name}`}
              style={{ marginTop: "2px" }}
            >
              <KeybindText keybind={keybind} />
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

interface LayerControlsViewProps {
  controls: LayerControlsSource;
}

export function LayerControlsView({
  controls,
}: LayerControlsViewProps): React.ReactNode {
  useSourceEventVersion(
    controls.controlsSections == null ? null : controls,
    "controls-change",
  );

  if (controls.controlsSections == null) return controls.controlsView;

  return <LayerControlsContentView sections={controls.controlsSections} />;
}

export interface ControlsMenuViewProps {
  generalHandlers: Record<string, ComposableKeybindHandler>;
}

export function ControlsMenuView({
  generalHandlers,
}: ControlsMenuViewProps): React.JSX.Element {
  const activeKey = useEditorSelector((state) => state.ui.activeLayerKey);
  const order = useEditorSelector((state) => state.layers.order);
  const metadata = useEditorSelector((state) => state.layers.metadata);
  const views = useEditorSelector((state) => state.layers.views);

  const layerOptions = useMemo(
    () => order.map((key) => ({ key, name: metadata.get(key)?.name ?? key })),
    [metadata, order],
  );

  return (
    <div className="keybinds" style={{ width: "100%" }}>
      <TabbedReactHost
        tabs={[
          {
            title: "General",
            children: <GeneralControlsView generalHandlers={generalHandlers} />,
          },
          {
            title: "Layer",
            children: (
              <LayerSelectHost
                activeKey={activeKey}
                layerOptions={layerOptions}
                renderLayerContent={(key) => {
                  const controls = views.get(key)?.controls;
                  return controls == null ? null : (
                    <LayerControlsView controls={controls} />
                  );
                }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
