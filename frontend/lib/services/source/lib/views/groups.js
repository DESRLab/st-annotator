import { IOUtils } from '../../../../common/lib/utils';

import { SourceGroupState } from '../domain';

/**
 * Obtains the list of all source groups that are available to the user.
 * 
 * @returns {Promise<SourceGroupState[]>} A promise that resolves to the requested data.
 */
export async function listSourceGroups() {
    return IOUtils.get('source/groups/data', { dataType: 'json' })
        .then((data) => IOUtils.parseArray(data).map((d) => SourceGroupState.fromJSON(d)))
        .catch((reason) => {
            console.error('Failed to get list of source groups:', reason);
            return [];
        });
}
