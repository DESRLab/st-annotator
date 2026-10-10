import bboxPlugin from "sta-bbox/app";
import gmeshPlugin from "sta-gmesh/app";
import pcdPlugin from "sta-pcd/app";
import segmentationPlugin from "sta-segmentation/app";
import vectorPlugin from "sta-vector/app";

import type { STAConfig } from "sta/app";

export default {
  plugins: {
    gmesh: gmeshPlugin,
    pcd: pcdPlugin,
    bbox: bboxPlugin,
    segmentation: segmentationPlugin,
    vector: vectorPlugin,
  },
} satisfies STAConfig;
