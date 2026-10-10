/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { GroundMeshMetadataPublic as GroundMeshMetadata } from "sta/client";

import {
  GroundMeshMetadataFields,
  groundMeshMetadataToFormState,
} from "../../../../app/source/data/metadata";
import type { GroundMeshMetadataFormState } from "../../../../app/source/data/metadata";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // The plugin test transform keeps the classic JSX runtime (`jsx: "preserve"` in the
  // shared tsconfig), and route modules rely on the automatic runtime instead. The
  // factory only has to exist where the emitted calls are looked up.
  globalThis.React = React;
});

const SPATIAL_BOUNDS = ["min_x", "min_y", "min_z", "max_x", "max_y", "max_z"];

function metadataRecord(
  overrides: Partial<GroundMeshMetadata> = {},
): GroundMeshMetadata {
  return {
    id: 3,
    group_id: 7,
    uri: "meshes/terrain.obj",
    group: { id: 7, name: "Ground" },
    min_x: "-1",
    min_y: "-1",
    min_z: "-1",
    max_x: "1",
    max_y: "1",
    max_z: "1",
    ...overrides,
  };
}

async function renderFields(
  formData: GroundMeshMetadataFormState,
): Promise<{ submitted: FormData; boundsInputs: HTMLInputElement[] }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <form>
        <GroundMeshMetadataFields
          formData={formData}
          sourceGroups={[]}
          readOnly={false}
          onChange={vi.fn()}
        />
      </form>,
    );
  });

  const form = container.querySelector("form")!;
  const boundsInputs = SPATIAL_BOUNDS.map((name) =>
    form.querySelector<HTMLInputElement>(`[name="${name}"]`)!,
  );
  // Exactly what the browser hands the route action on submit.
  const submitted = new FormData(form);
  await act(async () => {
    root.unmount();
  });
  return { submitted, boundsInputs };
}

function disabledState(boundsInputs: HTMLInputElement[]): boolean[] {
  // The shared fields component greys a vector group out through its wrapper
  // fieldset, which is also what keeps the controls out of the submission.
  return boundsInputs.map(
    (input) => input.closest("fieldset")?.hasAttribute("disabled") ?? false,
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ground-mesh metadata bounds form", () => {
  it("reopens a hand-set record unticked with its stored box prefilled", () => {
    const state = groundMeshMetadataToFormState(
      metadataRecord({ auto_bounds: false }),
    );
    expect(state.auto_bounds).toBe("false");
    expect(state.min_x).toBe("-1.000000");
    expect(state.max_z).toBe("1.000000");
  });

  it("reopens a derived record ticked, and reads a legacy row as derived", () => {
    expect(
      groundMeshMetadataToFormState(metadataRecord({ auto_bounds: true }))
        .auto_bounds,
    ).toBe("true");
    expect(groundMeshMetadataToFormState(metadataRecord()).auto_bounds).toBe(
      "true",
    );
  });

  it("shows the bound inputs greyed out and submits none for a derived record", async () => {
    const { submitted, boundsInputs } = await renderFields(
      groundMeshMetadataToFormState(metadataRecord()),
    );

    // The box stays visible for reading, and staying disabled is what keeps the
    // prefilled values out of the payload that would otherwise pin the record.
    expect(boundsInputs).toHaveLength(SPATIAL_BOUNDS.length);
    expect(disabledState(boundsInputs)).toEqual(SPATIAL_BOUNDS.map(() => true));

    // A single entry: the visible checkbox carries no name, so the hidden field that
    // mirrors it is the only thing the route action reads the mode from.
    expect(submitted.getAll("auto_bounds")).toEqual(["true"]);
    for (const bound of SPATIAL_BOUNDS) {
      expect(submitted.has(bound)).toBe(false);
    }
  });

  it("submits the six bound inputs once derivation is unticked", async () => {
    const { submitted, boundsInputs } = await renderFields(
      groundMeshMetadataToFormState(metadataRecord({ auto_bounds: false })),
    );

    expect(disabledState(boundsInputs)).toEqual(
      SPATIAL_BOUNDS.map(() => false),
    );
    expect(submitted.getAll("auto_bounds")).toEqual(["false"]);
    for (const bound of SPATIAL_BOUNDS) {
      expect(submitted.get(bound)).toBeTruthy();
    }
  });
});
