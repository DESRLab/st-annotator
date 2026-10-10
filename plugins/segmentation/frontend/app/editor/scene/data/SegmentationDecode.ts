interface RawPoint {
  x: string | number;
  y: string | number;
  z: string | number;
}
interface RawSelection {
  points?: RawPoint[] | number[] | Float32Array;
}
interface RawSegmentationPayload {
  selections?: RawSelection[];
}

function assertFiniteCoordinate(
  value: unknown,
): asserts value is string | number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !Number.isFinite(Number(value))
  )
    throw new Error("Segmentation payload contains a non-finite coordinate");
}

/** Parses segmentation JSON and packs its dense coordinate arrays. */
export function decodeSegmentationPayload(buffer: ArrayBuffer): unknown {
  const payload = JSON.parse(new TextDecoder().decode(buffer)) as
    RawSegmentationPayload | RawSegmentationPayload[];
  const payloads = Array.isArray(payload) ? payload : [payload];
  for (const item of payloads)
    for (const selection of item.selections ?? []) {
      if (!Array.isArray(selection.points))
        throw new Error("Segmentation payload points must be an array");
      if (
        selection.points.length === 0 ||
        typeof selection.points[0] === "number"
      ) {
        if (selection.points.length % 3 !== 0)
          throw new Error(
            "Segmentation payload coordinate count is not divisible by three",
          );
        for (const coordinate of selection.points)
          assertFiniteCoordinate(coordinate);
        selection.points = new Float32Array(selection.points as number[]);
        continue;
      }
      const points = selection.points as RawPoint[];
      const packed = new Float32Array(points.length * 3);
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        assertFiniteCoordinate(point.x);
        assertFiniteCoordinate(point.y);
        assertFiniteCoordinate(point.z);
        packed[index * 3] = Number(point.x);
        packed[index * 3 + 1] = Number(point.y);
        packed[index * 3 + 2] = Number(point.z);
      }
      selection.points = packed;
    }
  return payload;
}

/** Decodes the response and packs dense coordinates on the calling thread. */
export async function decodeSegmentationResponse(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted)
    throw new DOMException("Segmentation decoding was aborted", "AbortError");
  return decodeSegmentationPayload(buffer);
}
