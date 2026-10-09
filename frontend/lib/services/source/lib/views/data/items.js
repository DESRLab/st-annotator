import { IOUtils } from '../../../../../common/lib/utils';

/**
 * Obtains the list of all data under a source group. (Data Manager Only)
 * 
 * @template {import('../../domain').SourceDataState} T The type of source data.
 * @param {string} urlPrefix The base URI of the item browser.
 * @param {number} groupId The unique identifier of the source group.
 * @param {(obj: unknown) => T} deserializer Deserializes each entry from the request data.
 * @returns {Promise<T[]>} A promise that resolves to the requested data.
 */
export async function managerListSourceDataItems(urlPrefix, groupId, deserializer) {
    return IOUtils.get(`${urlPrefix}/data?group_id=${groupId}`, { dataType: 'json' })
        .then((data) => IOUtils.parseArray(data).map(deserializer))
        .catch((reason) => {
            console.error('Failed to get list of source data instances:', reason);
            return [];
        });
}
