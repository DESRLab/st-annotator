/**
 * Compile-time drift guard between the plugins' label-element state adapters
 * (`plugins/<p>/frontend/models`), the typed `/editor/label/data/bulk`
 * response (the backend `*BulkPublic` models), and the group-scoped
 * object-class selection response.
 *
 * Checked by tsc via `tsconfig.type-contracts.json` (`npm run typecheck`),
 * after regenerating the client with `npm run openapi-ts` in
 * `core/frontend/`. If a check fails, follow the backend change: update the
 * adapter schema (and the serializer model when the wire shape itself
 * changed).
 *
 * Lives in the frontend test tree because it spans every label plugin
 * package.
 *
 * Note: the bbox object classes pass through `normalizeBBoxClass`, which
 * derives `default_size` from the flat `default_size_*` fields before
 * parsing; the checks below model that pre-parse shape explicitly.
 */

import type { z } from "zod";

import type {
  BBoxData,
  ObjectClassPublic,
  ObjectClassSelectionPublic,
  ReadLabelDataBulkEditorLabelDataBulkPostResponses,
  ListSelectionsLabelSpecObjclassSelectionsGetResponses,
  SegmentationData,
  VectorData,
} from "sta/client";

import type {
  BBoxClassSelectionState,
  LabelBoxState,
  LabelTrackState,
} from "../../../plugins/bbox/frontend/models";
import type {
  LabelInstanceState,
  LabelSelectionState,
  SegmentationClassSelectionState,
} from "../../../plugins/segmentation/frontend/models";
import type {
  LabelVectorState,
  VectorClassSelectionState,
} from "../../../plugins/vector/frontend/models";

type AssertExtends<A, B> = [A] extends [B] ? true : false;
type AssertTrue<T extends true> = T;

type LabelBulkResponse = ReadLabelDataBulkEditorLabelDataBulkPostResponses[200];
type DecodedLabelSelection = Omit<
  SegmentationData["selections"][number],
  "points"
> & {
  points: Float32Array<ArrayBuffer>;
};

/** The bulk endpoint must stay typed as an ordered array of plugin containers. */
export interface LabelBulkResponseConformance {
  ResponseIsTypedUnion: AssertTrue<
    AssertExtends<
      LabelBulkResponse,
      (BBoxData | VectorData | SegmentationData)[]
    >
  >;
  /**
   * The instance list always arrives populated, so the segmentation receiver
   * maps it without a null check; a widened wire field would break that reading.
   */
  SegmentationInstancesAreRequired: AssertTrue<
    AssertExtends<SegmentationData["instances"], readonly unknown[]>
  >;
}

/**
 * Wire elements must satisfy each adapter after the segmentation decoder packs
 * its flat numeric coordinate array into a `Float32Array`.
 */
export interface LabelElementConformance {
  LabelBoxState: AssertTrue<
    AssertExtends<
      BBoxData["boxes"][number],
      z.input<typeof LabelBoxState.PLAIN_SCHEMA>
    >
  >;
  LabelTrackState: AssertTrue<
    AssertExtends<
      BBoxData["tracks"][number],
      z.input<typeof LabelTrackState.PLAIN_SCHEMA>
    >
  >;
  LabelVectorState: AssertTrue<
    AssertExtends<
      VectorData["vectors"][number],
      z.input<typeof LabelVectorState.PLAIN_SCHEMA>
    >
  >;
  LabelInstanceState: AssertTrue<
    AssertExtends<
      SegmentationData["instances"][number],
      z.input<typeof LabelInstanceState.PLAIN_SCHEMA>
    >
  >;
  LabelSelectionState: AssertTrue<
    AssertExtends<
      DecodedLabelSelection,
      z.input<typeof LabelSelectionState.PLAIN_SCHEMA>
    >
  >;
  LabelSelectionWirePoints: AssertTrue<
    AssertExtends<SegmentationData["selections"][number]["points"], number[]>
  >;
}

/**
 * The reverse direction of {@link LabelElementConformance}: every field an
 * adapter reads must exist on the wire model. The checks above alone pass when a
 * wire model silently drops a field the adapter declares `.optional()`, which is
 * exactly how the compact bulk models lost their class ids and reloaded saved
 * frames as unclassified. Scoped to the label elements; the class-selection
 * adapters intentionally extend their wire model with fields the endpoint does
 * not send.
 */
export interface LabelElementFieldPresence {
  LabelBoxState: AssertTrue<
    AssertExtends<
      keyof z.input<typeof LabelBoxState.PLAIN_SCHEMA>,
      keyof BBoxData["boxes"][number]
    >
  >;
  LabelTrackState: AssertTrue<
    AssertExtends<
      keyof z.input<typeof LabelTrackState.PLAIN_SCHEMA>,
      keyof BBoxData["tracks"][number]
    >
  >;
  LabelVectorState: AssertTrue<
    AssertExtends<
      keyof z.input<typeof LabelVectorState.PLAIN_SCHEMA>,
      keyof VectorData["vectors"][number]
    >
  >;
  LabelInstanceState: AssertTrue<
    AssertExtends<
      keyof z.input<typeof LabelInstanceState.PLAIN_SCHEMA>,
      keyof SegmentationData["instances"][number]
    >
  >;
  LabelSelectionState: AssertTrue<
    AssertExtends<
      keyof z.input<typeof LabelSelectionState.PLAIN_SCHEMA>,
      keyof SegmentationData["selections"][number]
    >
  >;
}

/**
 * The object-class shape seen by `BBoxClassState.SCHEMA` after
 * `normalizeBBoxClass` derives `default_size` from the flat fields.
 */
type NormalizedBBoxObjectClass = Omit<
  ObjectClassPublic,
  "default_size_x" | "default_size_y" | "default_size_z"
> & {
  default_size: { x: string | null; y: string | null; z: string | null };
};

type BBoxClassSelectionWire = Omit<ObjectClassSelectionPublic, "objclasses"> & {
  objclasses: NormalizedBBoxObjectClass[];
};

/** The wire class selections must satisfy each plugin's selection schema input. */
export interface ClassSelectionConformance {
  GroupFilterReturnsSelections: AssertTrue<
    AssertExtends<
      ListSelectionsLabelSpecObjclassSelectionsGetResponses[200],
      ObjectClassSelectionPublic[]
    >
  >;
  BulkResponseOmitsClassSelection: AssertTrue<
    AssertExtends<
      Extract<
        "class_selection",
        keyof BBoxData | keyof VectorData | keyof SegmentationData
      >,
      never
    >
  >;
  BBoxClassSelectionState: AssertTrue<
    AssertExtends<
      BBoxClassSelectionWire,
      z.input<typeof BBoxClassSelectionState.PLAIN_SCHEMA>
    >
  >;
  VectorClassSelectionState: AssertTrue<
    AssertExtends<
      ObjectClassSelectionPublic,
      z.input<typeof VectorClassSelectionState.PLAIN_SCHEMA>
    >
  >;
  SegmentationClassSelectionState: AssertTrue<
    AssertExtends<
      ObjectClassSelectionPublic,
      z.input<typeof SegmentationClassSelectionState.PLAIN_SCHEMA>
    >
  >;
}
