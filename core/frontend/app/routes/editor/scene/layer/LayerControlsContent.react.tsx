import { default as React } from "react";

import type { Keybind } from "../../app/Keybinds";
import { KeybindText } from "../../app/widgets/ControlsMenu.react.tsx";

export interface LayerControlsSection {
  title: string;
  keybinds: readonly Keybind[];
}

export interface LayerControlsContentViewProps {
  sections: readonly LayerControlsSection[];
}

export function LayerControlsContentView({
  sections,
}: LayerControlsContentViewProps): React.JSX.Element {
  return (
    <div style={{ width: "100%", paddingLeft: "var(--cnt-hp)" }}>
      {sections.map(({ title, keybinds }, sectionIndex) => (
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
