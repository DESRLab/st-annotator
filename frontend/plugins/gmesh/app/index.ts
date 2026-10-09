import { type STAPlugin } from "../../../app/config";
import { FILE_HANDLERS } from "../../../app/plugins/source-files";
import {
  GroundMeshMetadataModal as ImportGroundMeshModal,
  IMPORT_GROUND_MESH_ACTION,
  importGroundMeshFiles,
  listGroundMeshRegistrations,
} from "./source/files/modal";

const PLUGIN_ROOT = "../plugins/gmesh/app";
const GROUND_MESH_FILE_PATTERN = /\.(obj|ply|off|stl|gltf|glb)$/i;

export default {
  routes: {
    source: {
      data: [
        {
          path: "gmesh",
          module: `${PLUGIN_ROOT}/source/data/metadata.tsx`,
          title: "Ground Mesh Metadata",
        },
      ],
    },
  },
  entrypoint: () => {
    FILE_HANDLERS["Import Ground Mesh"] = {
      allowMultiple: true,
      pattern: GROUND_MESH_FILE_PATTERN,
      iconCssClass: "fas fa-mountain fa-fw",
      actionType: IMPORT_GROUND_MESH_ACTION,
      action: importGroundMeshFiles,
      registrationLookup: listGroundMeshRegistrations,
      modal: ImportGroundMeshModal,
    };
  },
} satisfies STAPlugin;