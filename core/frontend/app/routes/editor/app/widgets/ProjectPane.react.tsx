import { default as React } from "react";

import { TabbedReactHost } from "./MenuHosts.react.tsx";

interface ProjectPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface ProjectPaneViewProps {
  paneParams: { settings: ProjectPaneSettings };
  tabChildren?: Partial<Record<"Task" | "Scene" | "Frame", React.ReactNode>>;
}

export function ProjectPaneView({
  paneParams,
  tabChildren = {},
}: ProjectPaneViewProps): React.JSX.Element {
  const { settings } = paneParams;

  return (
    <TabbedReactHost
      disabled={settings.disabled}
      hidden={settings.hidden}
      tabs={[
        {
          title: "Task",
          children: tabChildren.Task,
        },
        {
          title: "Scene",
          children: tabChildren.Scene,
        },
        {
          title: "Frame",
          children: tabChildren.Frame,
        },
      ]}
    />
  );
}
