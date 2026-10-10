import type * as THREE from "three";

/**
 * A contributor of read-only projection targets for the editor e2e probe
 * (see `e2eProbe.ts`).
 *
 * Implemented by scene layers that expose inspectable targets. The composition root discovers
 * contributors structurally ({@link isEditorE2EProbeTargetsContributor}),
 * them structurally, without importing contributed packages.
 *
 * Both methods are strictly read-only: they expose world-space points and
 * live handle objects for projection, and must never mutate editor state.
 * They are only ever invoked through the probe, which exists solely when
 * its `VITE_STA_E2E_PROBE` env gate is set; implementations guard
 * accordingly and return `null` when it is not.
 */
export interface EditorE2EProbeTargetsContributor {
  /**
   * Gets the world-space (three.js coordinates) point of a contributed target,
   * or `null` if the probe is disabled or the target or sub-target does
   * not exist.
   *
   * @param id The unique identifier of the target.
   * @param subIndex The optional index of a sub-target, or `null` for the
   * contributor's default target.
   */
  getE2EProbeLabelPoint(
    id: string,
    subIndex: number | null,
  ): THREE.Vector3 | null;

  /**
   * Gets the live interaction object of a transform target, whose world
   * position the probe projects, or `null` if the probe is disabled or
   * no matching interaction target is active.
   *
   * @param mode The transformation mode (as understood by
   * the contributing layer).
   * @param subIndex The optional index of a sub-target, or `null` for the
   * contributor's default interaction object.
   */
  getE2EProbeTransformHandle(
    mode: string,
    subIndex: number | null,
  ): THREE.Object3D | null;

  /**
   * Gets the unique identifier of the target the layer's selector
   * currently reports as hovered, or `null` if the probe is disabled or
   * nothing is hovered. Lets e2e specs prove that a real pointer gesture
   * was routed to a particular rendered target.
   */
  getE2EProbeHoveredLabel(): string | null;

  /**
   * Raycasts the layer's selector groups with a caller-supplied raycaster
   * and returns how many candidate objects exist plus the closest hit id.
   * Diagnostic: distinguishes "no candidates / ray misses" from "hover
   * event never reached the selector". Read-only.
   */
  getE2EProbeSelectorRaycast(
    raycaster: THREE.Raycaster,
  ): { count: number; hitId: string | null } | null;

  /**
   * Reports the layer's live selector state: whether hover is enabled and
   * the ray its raycaster currently carries (updated by every pointer
   * event reaching the selector). Diagnostic: distinguishes "pointer
   * events never reached the selector" (stale ray) from "hover disabled".
   * Read-only.
   */
  getE2EProbeSelectorState(): {
    hoverEnabled: boolean;
    ray: { origin: THREE.Vector3; direction: THREE.Vector3 };
  } | null;
}

/** Structurally detects an {@link EditorE2EProbeTargetsContributor} without imports. */
export function isEditorE2EProbeTargetsContributor(
  value: unknown,
): value is EditorE2EProbeTargetsContributor {
  if (value == null || typeof value !== "object") return false;

  const candidate = value as EditorE2EProbeTargetsContributor;
  return (
    typeof candidate.getE2EProbeLabelPoint === "function" &&
    typeof candidate.getE2EProbeTransformHandle === "function" &&
    typeof candidate.getE2EProbeHoveredLabel === "function" &&
    typeof candidate.getE2EProbeSelectorRaycast === "function" &&
    typeof candidate.getE2EProbeSelectorState === "function"
  );
}
