import { expect } from "chai";
import * as THREE from "three";
import { afterEach, describe, it, vi } from "vitest";

import { client } from "sta/client-instance";
import {
  CoordinateFormat,
  EditorConfig,
  EditorViews,
  PointBuffer,
  ProjectConfig,
} from "sta/app/editor";
import { Vector3Data } from "sta/common";

import { PointPrompt } from "../app/editor/scene/controls/PointPrompts";
import { SegmentationReceiver } from "../app/editor/scene/data/SegmentationLookup";
import { PointCloudUtils } from "../app/editor/scene/utils/PointCloudUtils";

function makeReceiver(): SegmentationReceiver {
  const config = new EditorConfig(
    ProjectConfig.create({
      frame_cache_size: 1,
      init_camera_position: Vector3Data.create({ x: 0, y: 0, z: 0 }),
      init_camera_target: Vector3Data.create({ x: 0, y: 0, z: 0 }),
    }),
  );

  return new SegmentationReceiver(config, new EditorViews());
}

function stubFetch(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(
    async (_request: RequestInfo | URL, _init?: RequestInit) => response(),
  );
  vi.stubGlobal("fetch", fetchMock);

  return {
    mock: fetchMock,
    calls: () =>
      fetchMock.mock.calls.map(([request, init]) => ({
        url: request instanceof Request ? request.url : request.toString(),
        init:
          request instanceof Request
            ? {
                method: request.method,
                headers: Object.fromEntries(request.headers),
              }
            : init,
      })),
  };
}

describe("SegmentationReceiver (labeling assistant)", () => {
  client.setConfig({ baseUrl: "http://backend.test" });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("encodes a point cloud through the assistant", async () => {
    const stub = stubFetch(() => new Response(null, { status: 200 }));
    const receiver = makeReceiver();

    const pcdArr = new Float32Array([0, 0, 0, 1, 2, 3]);
    const encoded = await receiver.encodePointCloud(pcdArr, 2, 42);

    expect(encoded).to.equal(true);

    const [{ url, init }] = stub.calls();
    expect(url).to.equal("http://backend.test/editor/segmentation/encode_pcd");
    expect(init?.method).to.equal("POST");
    expect(init?.headers).to.deep.include({
      "content-type": "application/octet-stream",
      "x-num-points": "2",
      "x-pcd-id": "42",
    });
  });

  it("reports a failed encoding", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    const receiver = makeReceiver();

    const encoded = await receiver.encodePointCloud(new Float32Array(3), 1, 42);

    expect(encoded).to.equal(false);
  });

  it("reports an aborted encoding without treating it as a failure", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    stubFetch(() => Promise.reject(new DOMException("Aborted", "AbortError")));
    const receiver = makeReceiver();

    const encoded = await receiver.encodePointCloud(
      new Float32Array(3),
      1,
      42,
      AbortSignal.abort(),
    );

    expect(encoded).to.equal(false);
    expect(warnSpy.mock.calls.length).to.equal(0);
  });

  it("predicts a mask through the annotator backend", async () => {
    const logits = new Float32Array([0.25, 0.75]);
    const stub = stubFetch(
      () => new Response(logits.slice().buffer, { status: 200 }),
    );
    const receiver = makeReceiver();

    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)];
    const mask = await receiver.predictMask(points, [1, 0], 42);

    expect(mask).to.not.equal(null);
    expect([...(mask?.logits ?? [])]).to.deep.equal([0.25, 0.75]);

    const [{ url, init }] = stub.calls();
    expect(url).to.equal(
      "http://backend.test/editor/segmentation/predict_mask",
    );
    expect(init?.method).to.equal("POST");
    expect(init?.headers).to.deep.include({
      "content-type": "application/octet-stream",
      "x-num-points": "2",
      "x-labels": "1,0",
      "x-pcd-id": "42",
    });
  });

  it("returns null when the assistant fails to predict a mask", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    const receiver = makeReceiver();

    const mask = await receiver.predictMask([new THREE.Vector3()], [1], 42);

    expect(mask).to.equal(null);
  });
});

describe("PointPrompt", () => {
  const makeCoords = (count: number): THREE.Vector3[] =>
    Array.from({ length: count }, (_, i) => new THREE.Vector3(i, i, i));

  it("keeps persistent foreground/background markers across updates", () => {
    const prompt = new PointPrompt();
    const group = prompt.asObject3D();

    prompt.add(makeCoords(2), [1, 0]);
    const [positive, negative] = group.children;

    prompt.add(makeCoords(3), [1, 1, 0]);

    expect(group.children).to.deep.equal([positive, negative]);
    expect(positive.visible).to.equal(true);
    expect(negative.visible).to.equal(true);

    prompt.dispose();
  });

  it("disposes replaced geometries when prompts are updated", () => {
    const prompt = new PointPrompt();
    const group = prompt.asObject3D();

    prompt.add(makeCoords(1), [1]);
    const [positive] = group.children as THREE.Points<
      THREE.BufferGeometry,
      THREE.PointsMaterial
    >[];

    const replacedGeometry = positive.geometry;
    const disposeSpy = vi.spyOn(replacedGeometry, "dispose");

    prompt.add(makeCoords(2), [1, 1]);

    expect(disposeSpy.mock.calls.length).to.equal(1);
    expect(positive.geometry).to.not.equal(replacedGeometry);

    prompt.dispose();
  });

  it("hides markers without prompts and disposes everything on disposal", () => {
    const prompt = new PointPrompt();
    const group = prompt.asObject3D();

    prompt.add(makeCoords(1), [0]);

    const [positive, negative] = group.children as THREE.Points<
      THREE.BufferGeometry,
      THREE.PointsMaterial
    >[];
    expect(positive.visible).to.equal(false);
    expect(negative.visible).to.equal(true);

    const resources = [
      positive.geometry,
      positive.material,
      negative.geometry,
      negative.material,
    ];
    const disposeSpies = resources.map((resource) =>
      vi.spyOn(resource, "dispose"),
    );

    prompt.dispose();

    for (const spy of disposeSpies) expect(spy.mock.calls.length).to.equal(1);
    expect(group.children).to.have.length(0);
  });
});

describe("PointCloudUtils assistant encoding state", () => {
  const makeUtils = (): PointCloudUtils => {
    const buffer = new PointBuffer(
      new Float32Array([0, 0, 0, 1, 2, 3]),
      CoordinateFormat.ZXY,
      3,
    );
    return new PointCloudUtils(buffer, new THREE.Vector3(), 1);
  };

  it("resolves whenEncoded once encoding finishes successfully", async () => {
    const utils = makeUtils();

    expect(utils.encoded).to.equal(false);

    const waiting = utils.whenEncoded();
    utils.finishEncode(true);

    expect(await waiting).to.equal(true);
    expect(utils.encoded).to.equal(true);
  });

  it("resolves whenEncoded to false when encoding fails", async () => {
    const utils = makeUtils();

    utils.finishEncode(false);

    expect(await utils.whenEncoded()).to.equal(false);
    expect(utils.encoded).to.equal(false);
  });

  it("keeps the outcome of the first encoding only", async () => {
    const utils = makeUtils();

    utils.finishEncode(true);
    utils.finishEncode(false);

    expect(await utils.whenEncoded()).to.equal(true);
  });
});

describe("PointCloudUtils assistant mask lifecycle", () => {
  const makeUtils = (): PointCloudUtils => {
    const buffer = new PointBuffer(
      new Float32Array([0, 0, 0, 1, 2, 3]),
      CoordinateFormat.ZXY,
      3,
    );
    return new PointCloudUtils(buffer, new THREE.Vector3(), 1);
  };

  it("yields no selection points before any mask is predicted", () => {
    const utils = makeUtils();

    expect(utils.maskLogits).to.equal(null);
    // A discarded / never-predicted mask must not materialize a selection.
    expect(utils.filterMaskLogitsByThreshold(0.5)).to.have.length(0);
  });

  it("keeps only the points above the threshold and discards the mask when cleared", () => {
    const utils = makeUtils();
    utils.maskLogits = new Float32Array([0.9, 0.1]);

    expect(utils.filterMaskLogitsByThreshold(0.5)).to.have.length(1);

    // Clearing the logits (e.g. a superseded prediction) discards the mask.
    utils.maskLogits = null;
    expect(utils.filterMaskLogitsByThreshold(0.5)).to.have.length(0);
  });

  it("keeps a replacement point cloud free of its predecessor mask", () => {
    const superseded = makeUtils();
    superseded.maskLogits = new Float32Array([0.9, 0.9]);

    // The frame/project generation guard relies on the replacement being
    // a distinct point cloud that carries no mask of the previous one.
    const current = makeUtils();
    expect(current.maskLogits).to.equal(null);
    expect(current.filterMaskLogitsByThreshold(0.5)).to.have.length(0);
  });
});
