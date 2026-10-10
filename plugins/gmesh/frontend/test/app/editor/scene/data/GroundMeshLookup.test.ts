import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import {
  GroundMeshReceiver,
  estimateGroundMeshCacheSize,
} from "../../../../../app/editor/scene/data/GroundMeshLookup";
import { GroundMesh } from "../../../../../app/editor/scene/data/GroundMesh";

const config = new EditorConfig(
  ProjectConfig.fromJSON({ frame_cache_size: 2 }),
);
const frame = { id: 9 } as any;

function meshResponse(
  vertices: Float32Array,
  faces: Int32Array,
  overrideHeaders: Record<string, string> = {},
) {
  const body = new Uint8Array(vertices.byteLength + faces.byteLength);
  body.set(new Uint8Array(vertices.buffer), 0);
  body.set(new Uint8Array(faces.buffer), vertices.byteLength);
  return new Response(body, {
    headers: {
      "X-Vertices-ByteLength": String(vertices.byteLength),
      "X-Faces-ByteLength": String(faces.byteLength),
      ...overrideHeaders,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GroundMeshReceiver", () => {
  it("assigns a positive cache size to null and empty meshes", () => {
    const empty = {
      verticesBuffer: { numPoints: 0 },
      facesBuffer: new Int32Array(),
    } as GroundMesh;

    expect(estimateGroundMeshCacheSize(null)).toBe(1);
    expect(estimateGroundMeshCacheSize(empty)).toBe(1);
  });

  it("returns null for missing mesh data and rejects server/header errors", async () => {
    const bulkGetSourceData = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const receiver = new GroundMeshReceiver(config, {
      bulkGetSourceData,
    } as any);
    expect(await receiver.getDataNoCache(frame)).toBeNull();

    vi.spyOn(console, "error").mockImplementation(() => {});
    bulkGetSourceData.mockResolvedValueOnce(
      new Response("broken", { status: 500 }),
    );
    await expect(receiver.getDataNoCache(frame)).rejects.toThrow("broken");
    bulkGetSourceData.mockResolvedValueOnce(new Response(new ArrayBuffer(4)));
    await expect(receiver.getDataNoCache(frame)).rejects.toThrow(
      "Invalid headers",
    );
  });

  it("parses vertices/faces and supports a valid mesh with no faces", async () => {
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const faces = new Int32Array([0, 1, 2]);
    const bulkGetSourceData = vi
      .fn()
      .mockResolvedValueOnce(meshResponse(vertices, faces));
    const receiver = new GroundMeshReceiver(config, {
      bulkGetSourceData,
    } as any);
    const mesh = await receiver.getDataNoCache(frame);
    expect(mesh?.verticesBuffer.getCoords()).toHaveLength(3);
    expect(mesh?.facesBuffer).toEqual(faces);

    bulkGetSourceData.mockResolvedValueOnce(
      meshResponse(vertices, new Int32Array()),
    );
    const faceless = await receiver.getDataNoCache(frame);
    expect(faceless?.facesBuffer).toHaveLength(0);
  });

  it("rejects byte lengths that cannot represent the declared buffers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = meshResponse(
      new Float32Array([0, 0, 0]),
      new Int32Array(),
      {
        "X-Vertices-ByteLength": "11",
      },
    );
    const receiver = new GroundMeshReceiver(config, {
      bulkGetSourceData: vi.fn().mockResolvedValue(response),
    } as any);
    await expect(receiver.getDataNoCache(frame)).rejects.toThrow();
  });

  it("aborts pending requests on disposal", async () => {
    let signal: AbortSignal | undefined;
    const bulkGetSourceData = vi.fn(
      (_key, _ids, _args, requestSignal: AbortSignal) => {
        signal = requestSignal;
        return new Promise<Response>((_resolve, reject) =>
          requestSignal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        );
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const receiver = new GroundMeshReceiver(config, {
      bulkGetSourceData,
    } as any);
    const pending = receiver.getDataNoCache(frame);
    receiver.dispose();
    expect(signal?.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
