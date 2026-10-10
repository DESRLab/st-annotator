import { default as React } from "react";
import { EventDispatcher, Scene } from "three";
import WEBGL from "three/examples/jsm/capabilities/WebGL.js";
import Stats from "three/examples/jsm/libs/stats.module";

import { SceneRenderer } from "../scene";
import type { LayerCollection, SceneContext, WindowMapper } from "../scene";

import {
  ComposableKeybindHandler,
  KeybindHandlerGlobalContext,
} from "./Keybinds";
import type { Keybind } from "./Keybinds";
import { MenuKeybinds } from "./widgets";
import type { ProjectMenu } from "./widgets";
import type { MenuKeybindOwner } from "./widgets/MenuKeybinds.ts";

export type { default as Stats } from "three/examples/jsm/libs/stats.module";

export interface MenuMapper {
  project: ProjectMenu;
  tools: MenuKeybindOwner;
  prefs: PreferencesMenu;
  layers: MenuKeybindOwner;
  controls: MenuKeybindOwner;
}

export interface PreferencesMenu extends MenuKeybindOwner {
  renderView: () => React.ReactNode;
}

export interface AppMenuParams {
  project: ProjectMenu;
  prefs: PreferencesMenu;
  tools: MenuKeybindOwner;
}

const CHOOSE_TASK_HINT = <>Choose a task to open</>;
const CHOOSE_BRANCH_HINT = <>Choose a branch to open</>;
const SELECT_FRAME_HINT = <>Select a frame to open</>;

/**
 * Interface through which components can control the active scene.
 */
export class App<
  WM extends WindowMapper = WindowMapper,
> extends EventDispatcher<{ "hint-change": {} }> {
  /** Number of WebGL scene frames completed by this app. */
  #renderGeneration = 0;

  get renderGeneration(): number {
    return this.#renderGeneration;
  }

  /** Whether a demand-rendered frame is currently queued. */
  get isRenderPending(): boolean {
    return this.#animationFrameId != null;
  }

  #hintText: React.ReactNode = null;

  readonly stats: Stats;
  readonly webgl2Available: boolean;

  get hintText(): React.ReactNode {
    return this.#hintText;
  }

  /**
   * A handle to the state of the scene in this application.
   */
  readonly context: SceneContext<WM>;

  /**
   * Contains each layer in this application.
   */
  readonly layers: LayerCollection<WM>;

  /**
   * Contains each menu in this application.
   */
  readonly menus: MenuMapper;

  readonly #keydownGlobalCtx: KeybindHandlerGlobalContext;

  /**
   * Handles the event when a key is pressed in this application.
   */
  readonly keydownHandler: ComposableKeybindHandler;

  readonly #keyupGlobalCtx: KeybindHandlerGlobalContext;

  /**
   * Handles the event when a key is released in this application.
   */
  readonly keyupHandler: ComposableKeybindHandler;

  /**
   * Contains all `three.js` objects to display in the application.
   */
  readonly #scene: Scene;

  /**
   * Renders the scene in this application.
   */
  readonly #renderer: SceneRenderer<WM>;

  /**
   * Handle of the pending animation frame.
   */
  #animationFrameId: number | null = null;

  /** Removes scene invalidation listeners installed at construction. */
  readonly #renderInvalidationCleanups: (() => void)[] = [];

  /**
   * Whether this app has been disposed.
   */
  #isDisposed = false;

  /** Schedules one scene frame, coalescing repeated invalidations. */
  requestRender = (): void => {
    if (this.#isDisposed || this.#animationFrameId != null) return;
    this.#animationFrameId = window.requestAnimationFrame(this.#animate);
  };

  /**
   * Handles the event when a source of the hint of this application
   * has changed, re-reading the hint.
   */
  #onHintSourceChange = (): void => {
    this.#setHintText(this.getHint());
  };

  /**
   * Handles the event the window is about to be unloaded.
   *
   */
  #onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.context.hasUnsavedChanges) {
      event.returnValue =
        "Are you sure you want to leave the page? Some labelsets still have unsaved changes.";

      event.preventDefault();
      event.stopPropagation();
    }

    return event.returnValue;
  };

  /**
   * Creates a new application instance.
   *
   * (Except for the controls menu; that one is created by the application object.)
   *
   */
  constructor(
    context: SceneContext<WM>,
    layers: LayerCollection<WM>,
    menus: AppMenuParams,
  ) {
    super();

    this.context = context;
    this.layers = layers;
    this.menus = {
      project: menus.project,
      prefs: menus.prefs,
      tools: menus.tools,
      layers: new MenuKeybinds(),
      controls: new MenuKeybinds(),
    };
    this.#scene = new Scene();
    this.#scene.add(this.layers.objects);

    this.#renderer = new SceneRenderer(
      this.context.display,
      this.context.display.canvas,
      this.requestRender,
    );

    this.stats = new Stats();
    this.webgl2Available = WEBGL.isWebGL2Available();
    window.addEventListener("beforeunload", this.#onBeforeUnload);

    this.keydownHandler = new ComposableKeybindHandler([] as Keybind[], [
      ...Object.values(this.menus).map(({ keydownHandler }) => keydownHandler),
      this.layers.keydownHandler,
    ]);
    this.keyupHandler = new ComposableKeybindHandler([] as Keybind[], [
      ...Object.values(this.menus).map(({ keyupHandler }) => keyupHandler),
      this.layers.keyupHandler,
    ]);

    this.#keydownGlobalCtx = new KeybindHandlerGlobalContext(
      this.keydownHandler,
      "keydown",
    );
    this.#keyupGlobalCtx = new KeybindHandlerGlobalContext(
      this.keyupHandler,
      "keyup",
    );

    this.layers.addEventListener("hint-change", this.#onHintSourceChange);
    // The project-level hints depend on the navigation state of the
    // context, rather than on the layers.
    this.context.addEventListener("nav-frame", this.#onHintSourceChange);
    this.context.addEventListener("nav-label-branch", this.#onHintSourceChange);
    this.context.addEventListener("nav-source-group", this.#onHintSourceChange);

    this.layers.addEventListener("render-request", this.requestRender);
    this.#renderInvalidationCleanups.push(() => {
      this.layers.removeEventListener("render-request", this.requestRender);
    });

    // Camera controls and pointer-driven tools mutate Three.js objects
    // directly. Each emitted input/change event therefore requests one
    // coalesced frame; no frame remains scheduled once input becomes idle.
    for (const sceneWindow of Object.values(this.context.display.windows)) {
      const cameraSource = sceneWindow as typeof sceneWindow & {
        addEventListener(type: "camera-update", listener: () => void): void;
        removeEventListener(type: "camera-update", listener: () => void): void;
      };
      if (typeof cameraSource.addEventListener === "function") {
        cameraSource.addEventListener("camera-update", this.requestRender);
        this.#renderInvalidationCleanups.push(() => {
          cameraSource.removeEventListener("camera-update", this.requestRender);
        });
      }

      for (const eventType of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
      ] as const) {
        if (sceneWindow.dom == null) continue;
        sceneWindow.dom.addEventListener(eventType, this.requestRender);
        this.#renderInvalidationCleanups.push(() => {
          sceneWindow.dom.removeEventListener(eventType, this.requestRender);
        });
      }
    }
    window.addEventListener("keydown", this.requestRender);
    window.addEventListener("keyup", this.requestRender);
    document.addEventListener("input", this.requestRender);
    document.addEventListener("change", this.requestRender);
    this.#renderInvalidationCleanups.push(() => {
      window.removeEventListener("keydown", this.requestRender);
      window.removeEventListener("keyup", this.requestRender);
      document.removeEventListener("input", this.requestRender);
      document.removeEventListener("change", this.requestRender);
    });

    // The hint is updated by events from now on, so read the initial
    // hint explicitly instead of waiting for the first animation frame.
    this.#setHintText(this.getHint());

    this.requestRender();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.#isDisposed = true;
    if (this.#animationFrameId != null) {
      window.cancelAnimationFrame(this.#animationFrameId);
      this.#animationFrameId = null;
    }

    this.#keydownGlobalCtx.dispose();
    this.#keyupGlobalCtx.dispose();

    for (const cleanup of this.#renderInvalidationCleanups) cleanup();
    this.#renderInvalidationCleanups.length = 0;

    this.keydownHandler.dispose();
    this.keyupHandler.dispose();

    this.#renderer.dispose();

    window.removeEventListener("beforeunload", this.#onBeforeUnload);

    this.layers.removeEventListener("hint-change", this.#onHintSourceChange);
    this.context.removeEventListener("nav-frame", this.#onHintSourceChange);
    this.context.removeEventListener(
      "nav-label-branch",
      this.#onHintSourceChange,
    );
    this.context.removeEventListener(
      "nav-source-group",
      this.#onHintSourceChange,
    );

    for (const menu of Object.values(this.menus)) {
      menu.dispose();
    }

    this.layers.dispose();

    this.context.dispose();
  }

  /**
   * Gets the content to display as a hint to the user.
   *
   * If `null`, no hint is displayed.
   */
  getHint(): React.ReactNode {
    if (this.context.currentFrame == null) {
      if (this.context.currentTask == null) {
        return CHOOSE_TASK_HINT;
      }
      if (this.context.currentLabelBranch == null) {
        return CHOOSE_BRANCH_HINT;
      }

      return SELECT_FRAME_HINT;
    }

    return this.layers.getHint();
  }

  /**
   * Begins the rendering loop.
   */
  #animate = () => {
    this.#animationFrameId = null;
    this.render();
  };

  /**
   * Updates the display in this application.
   *
   * It is called during each animation frame.
   */
  render() {
    if (this.#isDisposed) return;

    this.stats.begin();

    this.layers.render();
    this.#renderer.render(this.#scene);
    this.#renderGeneration += 1;

    this.stats.end();
  }

  #setHintText(value: React.ReactNode): void {
    if (this.#hintText === value) return;

    this.#hintText = value;
    this.dispatchEvent({ type: "hint-change" });
  }
}
