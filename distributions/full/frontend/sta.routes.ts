import bboxRoutes from "../../../plugins/bbox/frontend/app/routes";
import gmeshRoutes from "../../../plugins/gmesh/frontend/app/routes";
import pcdRoutes from "../../../plugins/pcd/frontend/app/routes";
import segmentationRoutes from "../../../plugins/segmentation/frontend/app/routes";
import vectorRoutes from "../../../plugins/vector/frontend/app/routes";

export default {
  plugins: {
    gmesh: {
      routes: gmeshRoutes,
    },
    pcd: {
      routes: pcdRoutes,
    },
    bbox: {
      routes: bboxRoutes,
    },
    segmentation: {
      routes: segmentationRoutes,
    },
    vector: {
      routes: vectorRoutes,
    },
  },
};
