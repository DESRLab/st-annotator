import { UnitDataLoader, SourceDataView } from "sta/app/editor";
import type {
  SceneContext,
  WindowMapper,
  EditableFrame,
  DownloadProgressListener,
} from "sta/app/editor";

import type { GroundMesh } from "./GroundMesh";
import { GroundMeshLookup } from "./GroundMeshLookup";

/**
 * Given a frame, loads ground mesh data for that single frame.
 */
export class GroundMeshLoader extends UnitDataLoader<GroundMesh | null> {
  /**
   * Creates a new data loader for single frames.
   */
  constructor(lookup: GroundMeshLookup) {
    super(lookup);
  }
}

/**
 * Represents a view of a ground mesh that updates based on the active frame.
 */
export class GroundMeshView extends SourceDataView<GroundMesh | null> {
  override async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<GroundMesh | null> {
    const mesh = await super.getData(frame, signal, onProgress);
    return mesh?.clone() ?? null;
  }

  /**
   * Creates a new view of ground mesh data that updates based on the active frame.
   */
  static create<WM extends WindowMapper>(
    context: SceneContext<WM>,
    maxCacheSize?: number,
  ): GroundMeshView {
    const { config, views } = context;
    const lookup = GroundMeshLookup.create(config, views, maxCacheSize);
    const loader = new GroundMeshLoader(lookup);

    return new GroundMeshView(loader);
  }

  /**
   * Creates a new view of ground mesh data that updates based on the active frame.
   */
  constructor(loader: GroundMeshLoader) {
    super(loader);
  }
}
