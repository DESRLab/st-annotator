import * as THREE from "three";

import type { ProjectConfig } from "../models";

import { CoordinateFormat } from "./CoordinateFormat";
import type { CoordinateFormatSpec } from "./CoordinateFormat";

/**
 * Represents the configuration of a project.
 */
export class EditorConfig {
  #coordinateFormat: CoordinateFormatSpec;

  /**
   * The coordinate format used.
   */
  get coordinateFormat(): CoordinateFormatSpec {
    return this.#coordinateFormat;
  }

  #frameCacheSize: number;

  /**
   * The maximum number of frames stored in the cache once loaded from the server.
   */
  get frameCacheSize(): number {
    return this.#frameCacheSize;
  }

  #initCameraPosition: THREE.Vector3;

  /**
   * The initial position of the camera relative to the origin of the frame.
   */
  get initCameraPosition(): THREE.Vector3 {
    return this.#initCameraPosition;
  }

  #initCameraTarget: THREE.Vector3;

  /**
   * The initial target of the camera relative to the origin of the frame.
   */
  get initCameraTarget(): THREE.Vector3 {
    return this.#initCameraTarget;
  }

  /**
   * The raw configuration for each layer.
   */
  #layerSettings: Record<string, unknown>;

  /** Additional configuration values owned by extensions. */
  #options: Readonly<Record<string, unknown>>;

  /**
   * Creates a new configuration instance for a project.
   *
   * @param data A JSON object containing the data of the configuration.
   */
  constructor(data: ProjectConfig) {
    this.#coordinateFormat = CoordinateFormat.ZXY;

    this.#options = data.extensionOptions ?? {};

    const frameCacheSize = data.frame_cache_size;
    if (!Number.isInteger(frameCacheSize) || frameCacheSize < 1) {
      throw new Error(
        `The maximum number of frames must be a positive integer. Found: ${frameCacheSize}`,
      );
    } else {
      this.#frameCacheSize = frameCacheSize;
    }

    this.#initCameraPosition = data.init_camera_position.toVector3();
    this.#initCameraTarget = data.init_camera_target.toVector3();

    // Placeholder for now
    this.#layerSettings = {};
  }

  /**
   * Gets the raw configuration of a layer.
   *
   * @param key A key used to identify the layer. This is usually the same as the `key`
   * of the data sender that builds the response on the backend.
   * @returns The configuration of the layer. This can be `null` or `undefined` if it does
   * not exist.
   */
  forLayer(key: string): unknown {
    return this.#layerSettings[key];
  }

  /** Gets an extension-defined configuration value. */
  getOption(key: string): unknown {
    return this.#options[key];
  }
}
