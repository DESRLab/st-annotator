import type { STAPlugin } from "sta/app";
import {
  normalizeError,
  totalItemsFromContentRange,
  FILE_HANDLERS,
} from "sta/app/plugins";
import { listMetadatasSourceDataGmeshMetadataGet } from "sta/client";

import {
  IMPORT_GROUND_MESH_ACTION,
  importGroundMeshFiles,
  listGroundMeshRegistrations,
} from "./source/files/action";
import routes from "./routes";

const GROUND_MESH_FILE_PATTERN = /\.(obj|ply|off|stl|gltf|glb)$/i;

const editorLoader = () => import("./editor/index.js");

export default {
  routes,
  entrypoint: () => {
    FILE_HANDLERS["Import Ground Mesh"] = {
      allowMultiple: true,
      pattern: GROUND_MESH_FILE_PATTERN,
      iconCssClass: "fas fa-mountain fa-fw",
      actionType: IMPORT_GROUND_MESH_ACTION,
      action: importGroundMeshFiles,
      registrationLookup: listGroundMeshRegistrations,
      loadModal: async () =>
        (await import("./source/files/modal")).GroundMeshMetadataModal,
    };
  },
  editor: {
    loader: editorLoader,
  },
  client: {
    source: {
      loader: {
        sourceLookupNames: ["gmesh"],
        loadMetadatas: async ({ auth, query }) => {
          const result = await listMetadatasSourceDataGmeshMetadataGet({
            auth,
            query,
          });
          if (result.error) {
            throw new Error(normalizeError(result.error));
          }
          return result.data ?? [];
        },
      },
      bounds: [
        {
          itemType: "gmesh",
          label: "Ground meshes",
          href: "/source/data/gmesh",
          countPending: async ({ auth }) => {
            // A mesh has no reading configuration, so a sweep only ever owes a record whose
            // own file or transform moved -- which a bulk edit of a group's meshes does in
            // one request. `limit: 1` because only the total is read.
            const result = await listMetadatasSourceDataGmeshMetadataGet({
              auth,
              query: { bounds_pending: true, limit: 1 },
            });
            if (result.error) {
              throw new Error(normalizeError(result.error));
            }

            return totalItemsFromContentRange(result.response);
          },
        },
      ],
    },
  },
} satisfies STAPlugin;
