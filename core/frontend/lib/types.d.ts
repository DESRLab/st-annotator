/// <reference types="vite/client" />

// Environment variables read by plugin code at runtime. Declared here (once,
// shared by every typechecking program) instead of per-plugin `vite-env.d.ts`
// files, because the plugin registry pulls every plugin's sources into every
// program.
interface ImportMetaEnv {
  /** Unique identity generated whenever the frontend build/dev server starts. */
  readonly VITE_STA_BUILD_HASH?: string;

  /**
   * Enables the read-only editor e2e projection probe
   * (`window.__STA_E2E_PROBE__`). Only set by the fixture-backed
   * with-data Playwright environment; never set in dev/production
   * otherwise, so the probe stays a test-only surface.
   */
  readonly VITE_STA_E2E_PROBE?: string;
}

// Type declarations for third-party modules without type definitions

declare module "three/examples/jsm/capabilities/WebGL.js" {
  export function isWebGLAvailable(): boolean;
  export function isWebGL2Available(): boolean;
  export function getWebGLErrorMessage(): HTMLElement;
  export function getWebGL2ErrorMessage(): HTMLElement;
}

declare module "three/examples/jsm/libs/stats.module" {
  export default class Stats {
    dom: HTMLDivElement;
    showPanel(panel: number): void;
    begin(): void;
    end(): void;
    update(): void;
  }
}

declare module "three/examples/jsm/controls/OrbitControls" {
  import { Camera, EventDispatcher, Vector3 } from "three";

  export class OrbitControls extends EventDispatcher {
    constructor(camera: Camera, domElement?: HTMLElement);
    object: Camera;
    domElement: HTMLElement | undefined;
    enabled: boolean;
    target: Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    zoomSpeed: number;
    enableRotate: boolean;
    rotateSpeed: number;
    enablePan: boolean;
    panSpeed: number;
    screenSpacePanning: boolean;
    minDistance: number;
    maxDistance: number;
    minPolarAngle: number;
    maxPolarAngle: number;
    minAzimuthAngle: number;
    maxAzimuthAngle: number;
    update(): void;
    dispose(): void;
    getDistance(): number;
    getPolarAngle(): number;
    getAzimuthalAngle(): number;
    saveState(): void;
    reset(): void;
  }
}
