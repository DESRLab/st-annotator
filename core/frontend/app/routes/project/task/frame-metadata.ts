import {
  getPlugins,
  type SourceMetadataRecord,
  type SourceMetadataSource,
} from "sta/app/config";
import { PartialSTBounds } from "sta/common";

import { normalizeError } from "../../../errors";
import type { SourceDataRecord, SourceMetadataLoader } from "./components";
import { toDisplayText } from "./frame-domain";

function sourceDataRecordFromMetadata(
  item: SourceMetadataRecord,
): SourceDataRecord {
  return {
    id: item.id,
    st_bounds: PartialSTBounds.fromJSON({
      min_coords: {
        x: item.min_x ?? null,
        y: item.min_y ?? null,
        z: item.min_z ?? null,
      },
      max_coords: {
        x: item.max_x ?? null,
        y: item.max_y ?? null,
        z: item.max_z ?? null,
      },
      min_timestamp: item.min_timestamp ?? null,
      max_timestamp: item.max_timestamp ?? null,
    }),
    group:
      item.group == null
        ? null
        : {
            id: item.group.id,
            name: toDisplayText(item.group.name),
          },
  };
}

export function createSourceMetadataLoader(): SourceMetadataLoader | undefined {
  const sourceMetadataByLookupName = new Map<string, SourceMetadataSource>();
  for (const plugin of Object.values(getPlugins())) {
    const sourceLoader = plugin.client?.source?.loader;
    if (sourceLoader == null) continue;
    for (const sourceLookupName of sourceLoader.sourceLookupNames) {
      sourceMetadataByLookupName.set(sourceLookupName, sourceLoader);
    }
  }

  return async (sourceLookup, sourceGroupId) => {
    const sourceMetadata = sourceMetadataByLookupName.get(sourceLookup.name);
    if (sourceMetadata == null) {
      throw new Error(`Unsupported source data type: ${sourceLookup.name}.`);
    }

    try {
      const records = await sourceMetadata.loadMetadatas({
        query: { group_id: sourceGroupId },
      });
      return (records ?? []).map(sourceDataRecordFromMetadata);
    } catch (error) {
      throw new Error(normalizeError(error));
    }
  };
}
