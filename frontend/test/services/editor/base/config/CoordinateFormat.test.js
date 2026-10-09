import { expect } from 'chai';
import fc from 'fast-check';
import { describe, it } from 'vitest';

import { checkValue, makeVector3Arbitrary, tensorApprox } from '../../../../../lib/common/lib/testing';

import { CoordinateFormat } from '../../../../../lib/services/editor/lib/base';
import { makeCoordinateFormatArbitrary } from '../../../../../lib/services/editor/lib/testing';

describe('CoordinateFormat', () => {
    it('should be frozen', () => {
        expect(CoordinateFormat).to.be.frozen;
    });
});

describe('CoordinateFormatSpec', () => {
    it('instances should be frozen', () => {
        Object.values(CoordinateFormat).forEach((format) => {
            expect(format).to.be.frozen;
        });
    });
    it('conversion from project to threejs coordinates and back should be cycle-consistent', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeCoordinateFormatArbitrary(), makeVector3Arbitrary(), fc.context(),
                (format, dbCoords, ctx) => {
                    const result = format.toDatabaseCoords(format.toThreeJSCoords(dbCoords));
                    return checkValue(result, dbCoords, ctx, tensorApprox);
                },
            ),
        );
    });
    it('conversion from threejs to project coordinates and back should be cycle-consistent', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeCoordinateFormatArbitrary(), makeVector3Arbitrary(), fc.context(),
                (format, threeJSCoords, ctx) => {
                    const result = format.toThreeJSCoords(format.toDatabaseCoords(threeJSCoords));
                    return checkValue(result, threeJSCoords, ctx, tensorApprox);
                },
            ),
        );
    });
});
