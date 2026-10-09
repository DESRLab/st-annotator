
import { type STAPlugin } from "../../../app/config";
import { FILE_HANDLERS } from "../../../app/plugins/source-files";
import {
  IMPORT_POINT_CLOUD_ACTION,
  importPointCloudFiles,
  listPointCloudRegistrations,
  PointCloudMetadataModal as ImportPointCloudModal,
} from "./source/files/modal";

const PLUGIN_ROOT = "../plugins/pcd/app";
const POINT_CLOUD_FILE_PATTERN = /\.(bin|pcd|laz|las|npy|ply)$/i;

export default {
  routes: {
    source: {
      data: [
        {
          path: "pcd",
          module: `${PLUGIN_ROOT}/source/data/metadata.tsx`,
          title: "Point Cloud Metadata",
        },
      ],
      specs: [
        {
          path: "pcd",
          module: `${PLUGIN_ROOT}/source/specs/specs.tsx`,
          title: "Point Cloud Specifications",
        },
      ],
    }
  },
  entrypoint: () => {
    FILE_HANDLERS["Import Point Cloud"] = {
      allowMultiple: true,
      pattern: POINT_CLOUD_FILE_PATTERN,
      iconCssClass: 'fas fa-cube fa-fw',
      actionType: IMPORT_POINT_CLOUD_ACTION,
      action: importPointCloudFiles,
      registrationLookup: listPointCloudRegistrations,
      modal: ImportPointCloudModal,
    };
  },
} satisfies STAPlugin;
