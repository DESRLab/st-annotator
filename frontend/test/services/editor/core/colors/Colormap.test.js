import { expect } from 'chai';
import fc from 'fast-check';
import { describe, it } from 'vitest';

import { checkArray, checkValue, makeColorArbitrary } from '../../../../../lib/common/lib/testing';

import { Colormap } from '../../../../../lib/services/editor/lib/core';

describe('Colormap', () => {
    describe('#constructor()', () => {
        it('instances should be frozen', () => {
            expect(new Colormap('', [])).to.be.frozen;
        });
    });

    describe('#apply()', () => {
        it('number of mapped colors should equal number of input values', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    fc.string(), fc.array(makeColorArbitrary()),
                    fc.array(fc.double()), makeColorArbitrary(),
                    fc.context(),
                    (name, colors, values, badColor, ctx) => {
                        const cmap = new Colormap(name, colors);
                        const mappedColors = cmap.apply(values, badColor);

                        return checkValue(mappedColors.length, values.length, ctx);
                    },
                ),
            );
        });
        it('should return badColor if the colormap is empty', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    fc.array(fc.double({ min: 0, max: 1, noNaN: true })), makeColorArbitrary(),
                    fc.context(),
                    (values, badColor, ctx) => {
                        const cmap = new Colormap('', []);
                        const mappedColors = cmap.apply(values, badColor);

                        return checkArray(
                            mappedColors,
                            mappedColors.map(() => badColor),
                            ctx,
                            (a, b) => a.equals(b),
                        );
                    },
                ),
            );
        });
        it('should return badColor for invalid input values', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    // @ts-expect-error
                    fc.array(makeColorArbitrary(), { minLength: 1 }),
                    fc.array(fc.oneof(
                        fc.constant(NaN),
                        fc.double({ max: 0, noNaN: true }).filter((v) => v < 0),
                        fc.double({ min: 1, noNaN: true }).filter((v) => v > 1),
                    )),
                    makeColorArbitrary(),
                    fc.context(),
                    (name, colors, values, badColor, ctx) => {
                        const cmap = new Colormap(name, colors);
                        const mappedColors = cmap.apply(values, badColor);

                        return checkArray(
                            mappedColors,
                            mappedColors.map(() => badColor),
                            ctx,
                            (a, b) => a.equals(b),
                        );
                    },
                ),
            );
        });
        it('should return closest color in colormap', () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    // @ts-expect-error
                    fc.array(makeColorArbitrary(), { minLength: 2, maxLength: 2 }),
                    fc.array(fc.double({ min: 0, max: 1, noNaN: true }))
                        .map((arr) => arr.sort((a, b) => a - b)),
                    fc.context(),
                    (name, [color1, color2], values, ctx) => {
                        const cmap = new Colormap(name, [color1, color2]);
                        const mappedColors = cmap.apply(values);

                        return checkArray(
                            mappedColors,
                            values.map((v) => ((v < 0.5) ? color1 : color2)),
                            ctx,
                            (a, b) => a.equals(b),
                        );
                    },
                ),
            );
        });
    });
});
