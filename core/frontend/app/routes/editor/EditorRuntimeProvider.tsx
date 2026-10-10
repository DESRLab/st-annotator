import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Toast } from "react-bootstrap";
import { useBlocker } from "react-router";

import type { ProjectConfig as ProjectConfigPublic } from "../../../client";
import { getPlugins, type EditorOverlayDomSpec } from "../../config";

import {
  isEditorOverlayViewsContributor,
  type EditorOverlayViewsContributor,
} from "./overlayContributors";
import {
  createEditorRuntime,
  type CreateEditorRuntimeOptions,
  type EditorOverlayDom,
  type EditorOverlayDoms,
  type EditorLoadOptions,
  type EditorRuntimeElements,
  type EditorRuntime,
} from "./runtime";
import { DefaultSceneDisplayHost } from "./scene/display/DefaultSceneDisplay.react.tsx";
import {
  DefaultSceneDisplay,
  type DefaultSceneDisplayElements,
} from "./scene/display/DefaultSceneDisplay.tsx";
import { LayerCollectionOverlaysView } from "./scene/layer/LayerCollection.react.tsx";
import { OptionalEditorIntentsProvider } from "./store/EditorIntents.react.tsx";
import { OptionalEditorStoreProvider } from "./store/EditorStore.react.tsx";
import {
  FrameDataLoadingPanel,
  type FrameDataLoadingLayers,
} from "./app/FrameDataLoadingPanel.react.tsx";
import { createEditorIntents } from "./store/createEditorIntents";
import { useEditorStoreRuntime } from "./store/useEditorStoreRuntime";
import {
  useSourceEventVersion,
  type SourceEventTarget,
} from "./widgets/useSourceEvent.react.ts";

export type EditorRuntimeStatus = "loading" | "ready" | "error";
export type EditorLoadingPhase = "project" | "preparing-frame" | "frame-data";

export interface EditorRuntimeSnapshot {
  status: EditorRuntimeStatus;
  runtime: EditorRuntime | null;
  error: Error | null;
  loadingPhase: EditorLoadingPhase;
  loadingLayers: FrameDataLoadingLayers | null;
  /**
   * Explains that the frame requested by the initial URL could not be opened,
   * so the frame the load chose instead is never presented silently. `null`
   * when there is nothing to report.
   */
  frameLoadNotice: string | null;
}

export type EditorRuntimeFactory = (
  options: CreateEditorRuntimeOptions,
) => Promise<EditorRuntime>;

export interface EditorRuntimeProviderProps {
  children?: ReactNode;
  createRuntime?: EditorRuntimeFactory;
  getLoadOptions: () => EditorLoadOptions;
  initialProjectConfig?: ProjectConfigPublic;
  projectId: number;
}

interface EditorRuntimeLifecycleOptions extends Omit<
  EditorRuntimeProviderProps,
  "children" | "createRuntime"
> {
  createRuntime: EditorRuntimeFactory;
  elements: EditorRuntimeElements | null;
}

const EditorRuntimeContext = createContext<EditorRuntimeSnapshot | null>(null);

const AppViewComponent = lazy(async () => {
  const module = await import("./app/App.react.js");
  return { default: module.AppViewComponent };
});

function StartupLoadingOverlay({
  layers,
  phase,
}: {
  layers: FrameDataLoadingLayers | null;
  phase: EditorLoadingPhase;
}): React.JSX.Element {
  const [title, detail] =
    phase === "project"
      ? ["Loading project", "Preparing the annotation editor…"]
      : phase === "preparing-frame"
        ? ["Preparing frame", "Loading task and scene information…"]
        : ["Loading frame data", "Loading the selected frame’s layers…"];
  return (
    <div
      aria-labelledby="project-loading-title"
      aria-modal="true"
      data-test="project-loading-overlay"
      role="dialog"
      style={{
        alignItems: "center",
        background: "rgba(8, 12, 20, 0.78)",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        left: 0,
        pointerEvents: "auto",
        position: "fixed",
        top: 0,
        width: "100%",
        zIndex: 9999,
      }}
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
          id="project-loading-title"
          style={{ fontSize: "18px", fontWeight: 600 }}
        >
          {title}
        </div>
        {phase === "frame-data" && layers != null ? (
          <FrameDataLoadingPanel layers={layers} />
        ) : (
          <>
            <div
              aria-live="polite"
              style={{ color: "#b8c0cc", margin: "6px 0 18px" }}
            >
              {detail}
            </div>
            <progress
              aria-label={title}
              style={{ display: "block", width: "100%" }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Transient shell notice for a frame the initial load could not open.
 *
 * Whether it is still on screen is UI-only state, so it lives here rather than
 * on the imperative runtime. The caller keys this component by the message, so
 * a new notice remounts it and re-arms the auto-hide timer.
 */
function FrameLoadNoticeToast({ notice }: { notice: string }) {
  const [visible, setVisible] = useState(true);

  return (
    <Toast
      bg="warning"
      show={visible}
      autohide
      delay={10000}
      className="position-fixed top-0 start-50 translate-middle-x mt-3"
      style={{ zIndex: 1080 }}
      onClose={() => setVisible(false)}
    >
      <Toast.Header closeButton>
        <strong className="me-auto">Requested frame</strong>
      </Toast.Header>
      <Toast.Body>{notice}</Toast.Body>
    </Toast>
  );
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Owns an imperative editor runtime for the lifetime of the current route inputs. */
export function useEditorRuntimeLifecycle({
  createRuntime,
  elements,
  getLoadOptions,
  initialProjectConfig,
  projectId,
}: EditorRuntimeLifecycleOptions): EditorRuntimeSnapshot {
  const [snapshot, setSnapshot] = useState<EditorRuntimeSnapshot>({
    status: "loading",
    runtime: null,
    error: null,
    loadingPhase: "project",
    loadingLayers: null,
    frameLoadNotice: null,
  });

  useEffect(() => {
    if (elements == null) return undefined;

    let disposed = false;
    let runtime: EditorRuntime | null = null;

    setSnapshot({
      status: "loading",
      runtime: null,
      error: null,
      loadingPhase: "project",
      loadingLayers: null,
      frameLoadNotice: null,
    });

    const mountRuntime = async (): Promise<void> => {
      try {
        const loadOptions = getLoadOptions();
        const nextRuntime = await createRuntime({
          projectId,
          elements,
          initialProjectConfig,
        });

        if (disposed) {
          nextRuntime.dispose();
          return;
        }

        runtime = nextRuntime;
        // Keep the runtime private until its initial mount completes.
        // Publishing it here mounts the full editor React tree, whose
        // synchronous first render can delay the continuation below
        // and therefore delay the first frame-data requests.
        setSnapshot({
          status: "loading",
          runtime: null,
          error: null,
          loadingPhase: "preparing-frame",
          loadingLayers: nextRuntime.layers,
          frameLoadNotice: null,
        });
        const frameLoadNotice = await runtime.mount(loadOptions, {
          onFrameDataLoadStart: () => {
            if (!disposed) {
              setSnapshot({
                status: "loading",
                runtime: null,
                error: null,
                loadingPhase: "frame-data",
                loadingLayers: nextRuntime.layers,
                frameLoadNotice: null,
              });
            }
          },
        });

        if (disposed) {
          // The effect cleanup already disposed the runtime and
          // nulled the binding; do not dispose it a second time.
          runtime?.dispose();
          runtime = null;
          return;
        }

        setSnapshot({
          status: "ready",
          runtime,
          error: null,
          loadingPhase: "frame-data",
          loadingLayers: null,
          frameLoadNotice,
        });
      } catch (error) {
        runtime?.dispose();
        runtime = null;
        if (!disposed) {
          const initializationError = toError(error);
          console.error(
            "Unable to initialize annotation editor",
            initializationError,
          );
          setSnapshot({
            status: "error",
            runtime: null,
            error: initializationError,
            loadingPhase: "project",
            loadingLayers: null,
            frameLoadNotice: null,
          });
        }
      }
    };

    void mountRuntime();

    return (): void => {
      disposed = true;
      // Null the shared binding so a still-pending mount settling late
      // sees an already-disposed runtime and never disposes it again.
      const staleRuntime = runtime;
      runtime = null;
      staleRuntime?.dispose();
    };
  }, [
    createRuntime,
    elements,
    getLoadOptions,
    initialProjectConfig,
    projectId,
  ]);

  return snapshot;
}

/** An overlay slot declared by a plugin registration, with its plugin key. */
interface EditorOverlaySlot {
  pluginKey: string;
  doms: readonly EditorOverlayDomSpec[];
}

function getEditorOverlaySlots(): readonly EditorOverlaySlot[] {
  const slots: EditorOverlaySlot[] = [];
  for (const [pluginKey, plugin] of Object.entries(getPlugins())) {
    const overlayDoms = plugin.editor.overlayDoms;
    if (overlayDoms == null || overlayDoms.length === 0) continue;
    slots.push({ pluginKey, doms: overlayDoms });
  }
  return slots;
}

// Plugin registrations are static, so the declared slots never change.
const EDITOR_OVERLAY_SLOTS = getEditorOverlaySlots();

const overlaySlotDomKey = (pluginKey: string, domKey: string): string =>
  `${pluginKey}:${domKey}`;

/** Creates one overlay slot DOM element declared by a plugin registration. */
function EditorOverlayDomElement({
  children,
  domKey,
  pluginKey,
  registerDom,
  spec,
}: {
  children?: ReactNode;
  domKey: string;
  pluginKey: string;
  registerDom: (slotKey: string, element: HTMLElement | null) => void;
  spec: EditorOverlayDomSpec;
}): React.JSX.Element {
  const setRef = useCallback(
    (element: HTMLElement | null): void => {
      registerDom(overlaySlotDomKey(pluginKey, domKey), element);
    },
    [domKey, pluginKey, registerDom],
  );

  return spec.kind === "canvas" ? (
    <canvas data-test={spec.testId} id={spec.id} ref={setRef} />
  ) : (
    <div data-test={spec.testId} id={spec.id} ref={setRef}>
      {children}
    </div>
  );
}

/**
 * Creates the DOM consumed by the scene runtime without React reparenting it
 * later. The overlay slots are built from the DOM each plugin declares in its
 * registration (`editor.overlayDoms`); layers contributing React views for
 * their slot DOM ({@link EditorOverlayViewsContributor}) are re-rendered on
 * their `overlay-change` events.
 */
function EditorDisplayShell({
  onReady,
  runtime,
}: {
  onReady: (elements: EditorRuntimeElements) => void;
  runtime: EditorRuntime | null;
}): React.JSX.Element {
  const [displayElements, setDisplayElements] =
    useState<DefaultSceneDisplayElements | null>(null);
  const [overlayDoms, setOverlayDoms] = useState<
    Readonly<Record<string, HTMLElement>>
  >({});

  const registerOverlayDom = useCallback(
    (slotKey: string, element: HTMLElement | null): void => {
      setOverlayDoms((currentDoms) => {
        const existing = currentDoms[slotKey];
        if (element == null) {
          if (existing == null) return currentDoms;
          const nextDoms = { ...currentDoms };
          delete nextDoms[slotKey];
          return nextDoms;
        }
        if (existing === element) return currentDoms;
        return { ...currentDoms, [slotKey]: element };
      });
    },
    [],
  );

  const overlayViewSources =
    useMemo((): readonly (EditorOverlayViewsContributor &
      SourceEventTarget)[] => {
      if (runtime == null) return [];
      return Object.values(runtime.layersByKey).filter(
        isEditorOverlayViewsContributor,
      ) as (EditorOverlayViewsContributor & SourceEventTarget)[];
    }, [runtime]);
  useSourceEventVersion(overlayViewSources, "overlay-change");

  useLayoutEffect(() => {
    if (displayElements == null) return;

    const slotDoms: EditorOverlayDoms = {};
    for (const { pluginKey, doms } of EDITOR_OVERLAY_SLOTS) {
      const pluginDoms: Record<string, EditorOverlayDom> = {};
      for (const spec of doms) {
        const element = overlayDoms[overlaySlotDomKey(pluginKey, spec.key)];
        if (element == null) return;
        pluginDoms[spec.key] = element as EditorOverlayDom;
      }
      slotDoms[pluginKey] = pluginDoms;
    }

    onReady({ ...displayElements, overlayDoms: slotDoms });
  }, [displayElements, overlayDoms, onReady]);

  const overlayViewsByPlugin: Record<
    string,
    Readonly<Record<string, ReactNode>>
  > = {};
  if (runtime != null) {
    for (const [pluginKey, layer] of Object.entries(runtime.layersByKey)) {
      if (isEditorOverlayViewsContributor(layer))
        overlayViewsByPlugin[pluginKey] = layer.editorOverlayViews;
    }
  }

  const layerSlots: Record<string, ReactNode> = {};
  for (const { pluginKey, doms } of EDITOR_OVERLAY_SLOTS) {
    const views = overlayViewsByPlugin[pluginKey];
    layerSlots[pluginKey] = doms.map((spec) => (
      <EditorOverlayDomElement
        key={spec.key}
        domKey={spec.key}
        pluginKey={pluginKey}
        registerDom={registerOverlayDom}
        spec={spec}
      >
        {spec.kind === "div" ? (views?.[spec.key] ?? null) : null}
      </EditorOverlayDomElement>
    ));
  }

  const display = runtime?.context?.display;
  return (
    <>
      <DefaultSceneDisplayHost
        display={display instanceof DefaultSceneDisplay ? display : null}
        onReady={setDisplayElements}
      />
      <LayerCollectionOverlaysView
        source={runtime?.layers ?? null}
        layerSlots={layerSlots}
      />
    </>
  );
}

function sameOverlayDoms(a: EditorOverlayDoms, b: EditorOverlayDoms): boolean {
  const aPluginKeys = Object.keys(a);
  if (aPluginKeys.length !== Object.keys(b).length) return false;
  for (const pluginKey of aPluginKeys) {
    const aDoms = a[pluginKey];
    const bDoms = b[pluginKey];
    const aDomKeys = Object.keys(aDoms);
    if (bDoms == null || aDomKeys.length !== Object.keys(bDoms).length)
      return false;
    for (const domKey of aDomKeys) {
      if (aDoms[domKey] !== bDoms[domKey]) return false;
    }
  }
  return true;
}

/**
 * Owns the editor runtime lifecycle for the route and exposes its current
 * state to route-level React components.
 */
export function EditorRuntimeProvider({
  children,
  createRuntime = createEditorRuntime,
  getLoadOptions,
  initialProjectConfig,
  projectId,
}: EditorRuntimeProviderProps): React.JSX.Element {
  const [elements, setElements] = useState<EditorRuntimeElements | null>(null);
  const onDisplayReady = useCallback(
    (nextElements: EditorRuntimeElements): void => {
      setElements((currentElements) =>
        currentElements?.canvas === nextElements.canvas &&
        currentElements.displayDom === nextElements.displayDom &&
        currentElements.mainWindowDom === nextElements.mainWindowDom &&
        currentElements.minimapWindowDom === nextElements.minimapWindowDom &&
        sameOverlayDoms(currentElements.overlayDoms, nextElements.overlayDoms)
          ? currentElements
          : nextElements,
      );
    },
    [],
  );
  const snapshot = useEditorRuntimeLifecycle({
    createRuntime,
    elements,
    getLoadOptions,
    initialProjectConfig,
    projectId,
  });
  const editorStore = useEditorStoreRuntime(snapshot.runtime);
  const navigationBlocker = useBlocker(
    () =>
      snapshot.runtime?.context.currentLabelBranch?.hasUnsavedChanges ?? false,
  );
  useEffect(() => {
    if (navigationBlocker.state !== "blocked") return;
    if (window.confirm("Discard unsaved annotation changes?")) {
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  }, [navigationBlocker]);
  const editorIntents = useMemo(
    () =>
      snapshot.runtime == null ? null : createEditorIntents(snapshot.runtime),
    [snapshot.runtime],
  );

  const contextValue = useMemo(() => snapshot, [snapshot]);

  // The optional providers wrap the WHOLE tree, including the display
  // shell mounted before the runtime exists, so the tree shape stays
  // stable across the runtime arriving. The layer overlay views embed
  // selector/intent-based inspector containers and need these contexts.
  return (
    <EditorRuntimeContext.Provider value={contextValue}>
      <OptionalEditorStoreProvider store={editorStore}>
        <OptionalEditorIntentsProvider intents={editorIntents}>
          <div className="app">
            <EditorDisplayShell
              onReady={onDisplayReady}
              runtime={snapshot.runtime}
            />
            {snapshot.status === "loading" ? (
              <StartupLoadingOverlay
                layers={snapshot.loadingLayers}
                phase={snapshot.loadingPhase}
              />
            ) : null}
            {snapshot.error == null ? null : (
              <p role="alert">
                Unable to initialize annotation editor: {snapshot.error.message}
              </p>
            )}
            {snapshot.frameLoadNotice == null ? null : (
              <FrameLoadNoticeToast
                key={snapshot.frameLoadNotice}
                notice={snapshot.frameLoadNotice}
              />
            )}
            {snapshot.runtime?.app == null ||
            editorStore == null ||
            editorIntents == null ? null : (
              <Suspense fallback={null}>
                <AppViewComponent app={snapshot.runtime.app} />
              </Suspense>
            )}
          </div>
          {children}
        </OptionalEditorIntentsProvider>
      </OptionalEditorStoreProvider>
    </EditorRuntimeContext.Provider>
  );
}

export function useEditorRuntime(): EditorRuntimeSnapshot {
  const snapshot = useContext(EditorRuntimeContext);
  if (snapshot == null) {
    throw new Error(
      "useEditorRuntime must be used inside EditorRuntimeProvider",
    );
  }

  return snapshot;
}
