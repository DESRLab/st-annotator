import type { STAPlugin } from "sta/app";
import {
  normalizeError,
  totalItemsFromContentRange,
  FILE_HANDLERS,
} from "sta/app/plugins";
import { listMetadatasSourceDataPcdMetadataGet } from "sta/client";

import {
  IMPORT_POINT_CLOUD_ACTION,
  importPointCloudFiles,
  listPointCloudRegistrations,
} from "./source/files/action";
import routes from "./routes";

const POINT_CLOUD_FILE_PATTERN = /\.(bin|pcd|laz|las|npy|ply)$/i;

const editorLoader = () => import("./editor/index.js");

export default {
  routes,
  entrypoint: () => {
    FILE_HANDLERS["Import Point Cloud"] = {
      allowMultiple: true,
      pattern: POINT_CLOUD_FILE_PATTERN,
      iconCssClass: "fas fa-cube fa-fw",
      actionType: IMPORT_POINT_CLOUD_ACTION,
      action: importPointCloudFiles,
      registrationLookup: listPointCloudRegistrations,
      loadModal: async () =>
        (await import("./source/files/modal")).PointCloudMetadataModal,
    };
  },
  editor: {
    loader: editorLoader,
  },
  client: {
    source: {
      loader: {
        sourceLookupNames: ["pcd"],
        loadMetadatas: async ({ auth, query }) => {
          const result = await listMetadatasSourceDataPcdMetadataGet({
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
          itemType: "pcd",
          label: "Point clouds",
          href: "/source/data/pcd",
          countPending: async ({ auth }) => {
            // A scan's box follows the group's reading configuration, and re-reading a
            // group's whole inventory is job work, so this is the type whose recomputation
            // a data manager most often has to wait for. `limit: 1` because only the
            // `Content-Range` total is wanted: the records themselves are not fetched.
            const result = await listMetadatasSourceDataPcdMetadataGet({
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
