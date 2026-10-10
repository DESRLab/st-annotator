import {
  default as React,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useEditorSelector } from "../store";
import { DraggablePanel } from "../widgets";
import type { DraggablePanelPosition } from "../widgets/DraggablePanel.react.tsx";

import type { MenuMapper } from "./App.tsx";
import { FrameDataLoadingPanel } from "./FrameDataLoadingPanel.react.tsx";
import {
  ControlsMenuView,
  LayersMenuView,
  ProjectMenuView,
  ToolsMenuView,
} from "./widgets";

const FULL_SIZE_HOST_STYLE: React.CSSProperties = {
  height: "100%",
  left: 0,
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  width: "100%",
};

function WebGLUnavailableMessage({
  hasWebGL2,
}: {
  hasWebGL2: boolean;
}): React.JSX.Element {
  const subject = hasWebGL2 ? "graphics card" : "browser";

  return (
    <div style={FULL_SIZE_HOST_STYLE}>
      <div
        id="webglmessage"
        style={{
          background: "#fff",
          color: "#000",
          fontFamily: "monospace",
          fontSize: "13px",
          fontWeight: "normal",
          margin: "5em auto 0",
          padding: "1.5em",
          pointerEvents: "auto",
          textAlign: "center",
          width: "400px",
        }}
      >
        Your {subject} does not seem to support{" "}
        <a
          href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation"
          style={{ color: "#000" }}
        >
          WebGL 2
        </a>
      </div>
    </div>
  );
}

/** Attaches the third-party Stats canvas to a React-owned container. */
function StatsPanel({
  stats,
}: {
  stats: { dom: HTMLElement };
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host == null) return undefined;

    host.append(stats.dom);
    stats.dom.style.removeProperty("left");
    stats.dom.style.setProperty("right", "0");
    return () => {
      stats.dom.style.removeProperty("right");
      stats.dom.remove();
    };
  }, [stats]);

  return <div ref={hostRef} style={FULL_SIZE_HOST_STYLE} />;
}

const PANEL_CONTENT_STYLE: Record<
  Exclude<keyof MenuMapper, "controls">,
  React.CSSProperties
> = {
  project: { maxHeight: "360px", width: "384px" },
  tools: { maxHeight: "160px", width: "384px" },
  prefs: { maxHeight: "240px", width: "384px" },
  layers: { maxHeight: "240px", width: "384px" },
};

const CONTROLS_PANEL_STYLE: React.CSSProperties = {
  maxHeight: "240px",
  width: "384px",
};

const PANEL_TITLES: Record<keyof MenuMapper, string> = {
  project: "Project",
  tools: "Tools",
  prefs: "Preferences",
  layers: "Layers",
  controls: "Controls",
};

interface EditorPanelsViewProps {
  bindPanel: (key: keyof MenuMapper, element: HTMLDivElement | null) => void;
  panelViews: Record<keyof MenuMapper, React.ReactNode>;
  positions: Record<keyof MenuMapper, DraggablePanelPosition>;
  setPosition: (
    key: keyof MenuMapper,
    position: DraggablePanelPosition,
  ) => void;
}

function EditorPanel({
  bindPanel,
  panel,
  panelView,
  position,
  setPosition,
}: {
  bindPanel: EditorPanelsViewProps["bindPanel"];
  panel: keyof MenuMapper;
  panelView: React.ReactNode;
  position: DraggablePanelPosition;
  setPosition: EditorPanelsViewProps["setPosition"];
}): React.JSX.Element {
  const onElementChange = useCallback(
    (element: HTMLDivElement | null): void => {
      bindPanel(panel, element);
    },
    [bindPanel, panel],
  );
  const onPositionChange = useCallback(
    (nextPosition: DraggablePanelPosition): void => {
      setPosition(panel, nextPosition);
    },
    [panel, setPosition],
  );

  return (
    <DraggablePanel
      contentStyle={
        panel === "controls" ? undefined : PANEL_CONTENT_STYLE[panel]
      }
      onElementChange={onElementChange}
      onPositionChange={onPositionChange}
      position={position}
      style={panel === "controls" ? CONTROLS_PANEL_STYLE : undefined}
      title={PANEL_TITLES[panel]}
    >
      {panelView}
    </DraggablePanel>
  );
}

export function EditorPanelsView({
  bindPanel,
  panelViews,
  positions,
  setPosition,
}: EditorPanelsViewProps): React.JSX.Element {
  return (
    <>
      {(Object.keys(PANEL_TITLES) as (keyof MenuMapper)[]).map((panel) => (
        <EditorPanel
          bindPanel={bindPanel}
          key={panel}
          panel={panel}
          panelView={panelViews[panel]}
          position={positions[panel]}
          setPosition={setPosition}
        />
      ))}
    </>
  );
}

interface AppViewContentProps {
  panelViews: Record<keyof MenuMapper, React.ReactNode>;
  panelLayout: EditorPanelLayout;
  stats: { dom: HTMLElement };
  hintText: React.ReactNode;
  webgl2Available: boolean;
  loadingOverlay: React.ReactNode;
}

function AppViewContent({
  panelViews,
  panelLayout,
  stats,
  hintText,
  webgl2Available,
  loadingOverlay,
}: AppViewContentProps): React.JSX.Element {
  return (
    <>
      {webgl2Available ? null : (
        <WebGLUnavailableMessage
          hasWebGL2={typeof window.WebGL2RenderingContext !== "undefined"}
        />
      )}
      <EditorPanelsView panelViews={panelViews} {...panelLayout} />
      <div className="top-mid">
        <div className="hint">
          <span>{hintText}</span>
        </div>
      </div>
      <StatsPanel stats={stats} />
      {loadingOverlay}
    </>
  );
}

type EditorPanelLayout = Pick<
  EditorPanelsViewProps,
  "bindPanel" | "positions" | "setPosition"
> & {
  bindElement: (element: HTMLDivElement | null) => void;
};

const INITIAL_PANEL_POSITIONS: Record<
  keyof MenuMapper,
  DraggablePanelPosition
> = {
  project: { top: 0, left: 0 },
  tools: { top: 0, left: 0 },
  prefs: { top: 0, left: 0 },
  layers: { top: 0, left: 0 },
  controls: { top: 0, left: 0 },
};

function useEditorPanelLayout(): EditorPanelLayout {
  const [positions, setPositions] = useState(INITIAL_PANEL_POSITIONS);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelsRef = useRef<
    Partial<Record<keyof MenuMapper, HTMLDivElement | null>>
  >({});

  const alignPanels = useCallback((): void => {
    const root = rootRef.current;
    if (root == null) return;
    const { height, width } = root.getBoundingClientRect();
    const getSize = (
      key: keyof MenuMapper,
    ): Pick<DOMRect, "height" | "width"> =>
      panelsRef.current[key]?.getBoundingClientRect() ?? {
        height: 0,
        width: 0,
      };
    const toolsHeight = getSize("tools").height;
    const prefsHeight = getSize("prefs").height;
    const layersSize = getSize("layers");
    const controlsWidth = getSize("controls").width;

    const next: Record<keyof MenuMapper, DraggablePanelPosition> = {
      project: { top: 0, left: 0 },
      tools: { top: (height - toolsHeight) / 2, left: 0 },
      prefs: { top: height - prefsHeight - 160, left: 0 },
      layers: {
        top: height - layersSize.height,
        left: width - layersSize.width,
      },
      controls: { top: 0, left: width - controlsWidth },
    };
    setPositions((previous) =>
      Object.keys(next).every((key) => {
        const panel = key as keyof MenuMapper;
        return (
          previous[panel].top === next[panel].top &&
          previous[panel].left === next[panel].left
        );
      })
        ? previous
        : next,
    );
  }, []);
  const observerRef = useRef<ResizeObserver | null>(null);

  const bindElement = useCallback(
    (element: HTMLDivElement | null): void => {
      rootRef.current = element;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (element == null) return;

      const ResizeObserverCtor = globalThis.ResizeObserver;
      observerRef.current =
        ResizeObserverCtor == null ? null : new ResizeObserverCtor(alignPanels);
      observerRef.current?.observe(element);
      alignPanels();
    },
    [alignPanels],
  );

  useLayoutEffect(() => {
    alignPanels();
    const animationFrameId = window.requestAnimationFrame(alignPanels);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [alignPanels]);

  const bindPanel = useCallback(
    (key: keyof MenuMapper, element: HTMLDivElement | null): void => {
      if (panelsRef.current[key] === element) return;
      panelsRef.current[key] = element;
      if (element != null) alignPanels();
    },
    [alignPanels],
  );
  const setPosition = useCallback(
    (key: keyof MenuMapper, position: DraggablePanelPosition): void => {
      setPositions((previous) => {
        const current = previous[key];
        return current.top === position.top && current.left === position.left
          ? previous
          : { ...previous, [key]: position };
      });
    },
    [],
  );

  return { bindElement, bindPanel, positions, setPosition };
}

interface AppViewState {
  menus: MenuMapper;
  stats: { dom: HTMLElement };
  webgl2Available: boolean;
  context: { readonly currentFrame: unknown };
  layers: {
    readonly layerEntries: readonly {
      key: string;
      layer: {
        readonly name: string;
        readonly dataView?: {
          readonly isLoading: boolean;
          readonly loadError?: string | null;
          retry?(): Promise<void>;
          readonly downloadProgress?: {
            loadedBytes: number;
            totalBytes: number | null;
          } | null;
          addEventListener(
            type: "beforeload" | "afterload" | "progress",
            listener: () => void,
          ): void;
          removeEventListener(
            type: "beforeload" | "afterload" | "progress",
            listener: () => void,
          ): void;
        };
      };
    }[];
  };
}

const FRAME_LOADING_OVERLAY_STYLE: React.CSSProperties = {
  alignItems: "center",
  background: "rgba(8, 12, 20, 0.78)",
  display: "flex",
  height: "100%",
  justifyContent: "center",
  left: 0,
  pointerEvents: "auto",
  position: "absolute",
  top: 0,
  width: "100%",
  zIndex: 10000,
};

/** Blocks editing and reports every plugin's state while the current frame loads. */
function FrameDataLoadingOverlay({
  app,
}: {
  app: AppViewState;
}): React.JSX.Element | null {
  const [, setVersion] = useState(0);
  const dataLayers = app.layers.layerEntries.filter(
    (entry) => entry.layer.dataView != null,
  );
  const playback = app.menus.project.playback;

  useEffect(() => {
    const refresh = (): void => setVersion((version) => version + 1);
    for (const { layer } of dataLayers) {
      layer.dataView?.addEventListener("beforeload", refresh);
      layer.dataView?.addEventListener("afterload", refresh);
      layer.dataView?.addEventListener("progress", refresh);
    }
    return () => {
      for (const { layer } of dataLayers) {
        layer.dataView?.removeEventListener("beforeload", refresh);
        layer.dataView?.removeEventListener("afterload", refresh);
        layer.dataView?.removeEventListener("progress", refresh);
      }
    };
  }, [app.layers]);

  useEffect(() => {
    if (playback == null) return undefined;
    const refresh = (): void => setVersion((version) => version + 1);
    playback.addEventListener("change", refresh);
    return () => playback.removeEventListener("change", refresh);
  }, [playback]);

  const visible =
    playback?.isPlaying !== true &&
    app.context.currentFrame != null &&
    dataLayers.some(
      ({ layer }) =>
        (layer.dataView?.isLoading ?? false) ||
        layer.dataView?.loadError != null,
    );

  if (!visible) return null;

  return (
    <div
      aria-labelledby="frame-data-loading-title"
      aria-modal="true"
      data-test="frame-data-loading-overlay"
      role="dialog"
      style={FRAME_LOADING_OVERLAY_STYLE}
    >
      <div
        style={{
          background: "#171b24",
          borderRadius: "6px",
          boxShadow: "0 12px 40px rgba(0, 0, 0, .45)",
          boxSizing: "border-box",
          color: "#fff",
          maxWidth: "calc(100vw - 48px)",
          padding: "24px 28px",
          width: "560px",
        }}
      >
        <div
          id="frame-data-loading-title"
          style={{ fontSize: "18px", fontWeight: 600 }}
        >
          Frame data
        </div>
        <FrameDataLoadingPanel layers={app.layers} />
      </div>
    </div>
  );
}

/** Renders an {@link App} from the route-owned React tree. */
export function AppViewComponent({
  app,
}: {
  app: AppViewState;
}): React.JSX.Element {
  const hintText = useEditorSelector((state) => state.ui.hint);
  const panelLayout = useEditorPanelLayout();
  const panelViews = useMemo(() => {
    const generalHandlers = {
      Project: app.menus.project.keydownHandler,
      Tools: app.menus.tools.keydownHandler,
      Preferences: app.menus.prefs.keydownHandler,
      Layers: app.menus.layers.keydownHandler,
    };

    return {
      project: <ProjectMenuView playback={app.menus.project.playback} />,
      prefs: app.menus.prefs.renderView(),
      controls: <ControlsMenuView generalHandlers={generalHandlers} />,
      layers: <LayersMenuView />,
      tools: <ToolsMenuView />,
    };
  }, [app]);

  return (
    <React.Fragment>
      <div
        data-test="editor-app-view"
        ref={panelLayout.bindElement}
        style={FULL_SIZE_HOST_STYLE}
      >
        <AppViewContent
          hintText={hintText}
          panelViews={panelViews}
          panelLayout={panelLayout}
          stats={app.stats}
          webgl2Available={app.webgl2Available}
          loadingOverlay={<FrameDataLoadingOverlay app={app} />}
        />
      </div>
    </React.Fragment>
  );
}
