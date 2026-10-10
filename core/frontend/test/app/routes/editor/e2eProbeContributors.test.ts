import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { isEditorE2EProbeTargetsContributor } from "../../../../app/routes/editor/e2eProbeContributors";

describe("editor e2e probe contributors", () => {
  it("recognizes a structurally contributed probe target adapter", () => {
    const contributor = {
      getE2EProbeLabelPoint: () => new THREE.Vector3(),
      getE2EProbeTransformHandle: () => new THREE.Object3D(),
      getE2EProbeHoveredLabel: () => null,
      getE2EProbeSelectorRaycast: () => ({ count: 0, hitId: null }),
      getE2EProbeSelectorState: () => null,
    };

    expect(isEditorE2EProbeTargetsContributor(contributor)).toBe(true);
  });

  it("rejects an incomplete adapter without referring to a concrete layer", () => {
    expect(
      isEditorE2EProbeTargetsContributor({
        getE2EProbeLabelPoint: () => null,
      }),
    ).toBe(false);
  });
});
