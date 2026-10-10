import { describe, expect, it } from "vitest";

import { deriveTimestampBoundsFromFilename } from "sta/app/plugins";

describe("point-cloud filename timestamp derivation", () => {
  it("parses the folder5 calendar-clock filenames", () => {
    const local = new Date(2023, 1, 6, 3, 25, 47, 533).toISOString();
    expect(
      deriveTimestampBoundsFromFilename(
        "app/data/Data/folder5/2023_02_06=03_25_47_533.bin",
      ),
    ).toEqual({ minTimestamp: local, maxTimestamp: local });

    const microseconds = local.replace(".533Z", ".533456Z");
    expect(
      deriveTimestampBoundsFromFilename("2023_02_06=03_25_47_533456.pcd"),
    ).toEqual({ minTimestamp: microseconds, maxTimestamp: microseconds });
  });

  it("parses the balloon1 epoch-millisecond filenames", () => {
    const iso = new Date(1645208349200).toISOString();
    expect(
      deriveTimestampBoundsFromFilename(
        "app/data/filtered_18feb2022/Data/balloon1/1645208349200.bin",
      ),
    ).toEqual({ minTimestamp: iso, maxTimestamp: iso });
  });

  it("rejects other formats and invalid clocks without reading parent-directory names", () => {
    for (const path of [
      "scans/2024-01-02T03:04:05Z.bin",
      "scans/20240102_030405.bin",
      "scans/1704164645.bin",
      "scans/1704164645123456.bin",
      "scans/scan_1645208349200.bin",
      "scans/2023_02_30=03_25_47_533.bin",
      "scans/2023_02_06=25_25_47_533.bin",
      "filtered_18feb2022/Data/balloon1/plain.bin",
    ]) {
      expect(deriveTimestampBoundsFromFilename(path), path).toBeNull();
    }
  });

  it("uses a custom Python calendar pattern", () => {
    expect(
      deriveTimestampBoundsFromFilename(
        "scans/scan_20240203_040506.pcd",
        "scan_%Y%m%d_%H%M%S",
      ),
    ).toEqual({
      minTimestamp: new Date(2024, 1, 3, 4, 5, 6)
        .toISOString()
        .replace(".000Z", ".000000Z"),
      maxTimestamp: new Date(2024, 1, 3, 4, 5, 6)
        .toISOString()
        .replace(".000Z", ".000000Z"),
    });
    expect(
      deriveTimestampBoundsFromFilename(
        "scan_20240230_040506.pcd",
        "scan_%Y%m%d_%H%M%S",
      ),
    ).toBeNull();
  });
});
