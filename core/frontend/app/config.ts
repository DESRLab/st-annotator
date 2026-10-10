import config from "./sta-config.shim";

export interface RoutePlugin {
  path: string;
  module: string;
  title: string;
}

/** The kind of DOM element the editor shell creates for an overlay slot. */
export type EditorOverlayDomKind = "canvas" | "div";

/**
 * One DOM element of a plugin's editor overlay slot, created by the editor
 * display shell before the runtime is built and handed to the plugin's layer
 * keyed by `key` (see `EditorRuntimeElements.overlayDoms`).
 */
export interface EditorOverlayDomSpec {
  /** Identifies the element within the plugin's overlay slot. */
  key: string;
  kind: EditorOverlayDomKind;
  /** DOM `id` applied to the created element. */
  id?: string;
  /** `data-test` attribute applied to the created element. */
  testId?: string;
}

/**
 * One source metadata record as returned by a plugin's
 * `client.source.loader.loadMetadatas`, mirroring the backend metadata endpoints.
 */
export interface SourceMetadataRecord {
  id: number;
  group?: {
    id: number;
    name: unknown;
  } | null;
  min_x?: string | null;
  min_y?: string | null;
  min_z?: string | null;
  max_x?: string | null;
  max_y?: string | null;
  max_z?: string | null;
  min_timestamp?: string | null;
  max_timestamp?: string | null;
}

/** The plugin-side hook loading source metadata for the frame creation dialog. */
export interface SourceMetadataSource {
  /** The source lookup names (source data types) this loader serves. */
  sourceLookupNames: string[];
  /** Loads the metadata records of a source group; throws on API errors. */
  loadMetadatas(options: {
    auth?: string;
    query: { group_id: number };
  }): Promise<readonly SourceMetadataRecord[]>;
}

/**
 * One source data type whose spatial bounds the backend derives in the background.
 *
 * Re-deriving a group's bounds re-reads its stored files, which is too much to do inside
 * the save that invalidated them, so the work is queued and the data manager reports how
 * much is still outstanding. Only the plugin that owns a data type knows its endpoint, its
 * route and what a record of that type is called, so it contributes this descriptor and
 * core merely aggregates whatever appeared -- a type that derives no bounds in the
 * background contributes nothing and is absent from the summary rather than listed as
 * empty.
 */
export interface BoundsPendingSource {
  /** The data type's source lookup name, as the backend knows it (e.g. `pcd`). */
  itemType: string;
  /** Display name for a data manager (e.g. `Point clouds`). */
  label: string;
  /** Route of the type's Data Storage tab, so a non-zero count is actionable. */
  href: string;
  /**
   * Count the records whose derived bounds await recomputation.
   *
   * Reads one page of a `bounds_pending` listing and takes the total off its
   * `Content-Range` header. Throws on an API error, which the caller reports as an unknown
   * count rather than a false zero.
   */
  countPending(options: { auth?: string }): Promise<number>;
}

export interface STAPlugin {
  routes: {
    source?: {
      data?: RoutePlugin[];
      specs?: RoutePlugin[];
    };
    label?: {
      data?: RoutePlugin[];
      specs?: RoutePlugin[];
    };
  };
  entrypoint?: () => void;
  /** The plugin's annotation editor integration. */
  editor: {
    /** Loads the plugin's editor modules (browser-only). */
    loader: () => Promise<any>;
    /**
     * Overlay DOM the plugin's editor layer needs inside the scene overlay.
     * The editor display shell creates it before the runtime is built.
     */
    overlayDoms?: EditorOverlayDomSpec[];
  };
  /** The plugin's frontend client integrations. */
  client?: {
    source?: {
      /** Loads the plugin's source metadata for the frame creation dialog. */
      loader?: SourceMetadataSource;
      /** Data types of this plugin whose derived bounds are recomputed in a job. */
      bounds?: BoundsPendingSource[];
    };
  };
}

export interface STAConfig {
  plugins: Record<string, STAPlugin>;
}

/**
 * The serializable part of a plugin registration.
 *
 * Loader data round-trips through serialization, which drops the function
 * members (`entrypoint`, `editor`); consumers of plugin data in route
 * components see this shape.
 */
export type PluginRoutes = Pick<STAPlugin, "routes">;

/** The plugins selected by the consuming application's STA configuration. */
export type Plugins = Record<string, STAPlugin>;

const plugins: Plugins = config.plugins;
let pluginEntrypointsInitialized = false;

export function getPlugins(): Plugins {
  return plugins;
}

export function initializePluginEntrypoints() {
  if (pluginEntrypointsInitialized) {
    return;
  }

  for (const [name, plugin] of Object.entries(plugins)) {
    console.info(`Loading plugin: ${name}`);
    plugin.entrypoint?.();
  }

  pluginEntrypointsInitialized = true;
}
