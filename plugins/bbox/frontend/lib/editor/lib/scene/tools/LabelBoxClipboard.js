import { Clipboard } from 'sta/services/editor/core';

/**
 * @typedef {import('../data').BoxParams} BoxParams
 */

/**
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {Omit<BoxParams, 'id' | 'timestamp' | 'opacity'
 * | 'showForwardIndicator' | 'showFrame' | 'showPerceivedClass' | 'showColor'>} BoxClipboardData
 */

/**
 * Contains a user interface for copy and pasting bounding boxes in the scene.
 * 
 * @augments {Clipboard<ReadonlyLabelBox, BoxClipboardData>}
 */
export class LabelBoxClipboard extends Clipboard {

    /**
     * Creates a new clipboard for copy/pasting in a scene.
     */
    constructor() {
        super({
            objToData: (box) => ({
                boxType: box.boxType,
                center: box.center.clone(),
                angle: box.angle,
                size: box.size.clone(),
                qualityRank: box.qualityRank,
                distinctiveLv: box.distinctiveLv,
                occlusionLv: box.occlusionLv,
                perceivedClassId: box.perceivedClassId,
                entityId: box.entityId,
            }),
        });
    }
}
