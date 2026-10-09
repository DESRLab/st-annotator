import { expect } from 'chai';
import fc from 'fast-check';
import { describe, it } from 'vitest';

import { checkValue, makeColorArbitrary, makeOptionalVector3Arbitrary } from 'sta/common/testing';
import { ThreeUtils } from 'sta/common/utils';
import { makeEditorConfigArbitrary } from 'sta/services/editor/testing';

import { LabelClass } from '../../../../lib/editor/lib/scene/data/LabelClass';

const MIN_ABS = Math.sqrt(ThreeUtils.EPSILON);
const MAX_ABS = 1 / MIN_ABS;

const makeSizeComponentArbitrary = () => fc.double({ min: 0, max: MAX_ABS, noNaN: true });

const makeDefaultSizeArbitrary = () => makeOptionalVector3Arbitrary(makeSizeComponentArbitrary);

const makeLabelClassParamsArbitrary = () => fc.record({
    config: makeEditorConfigArbitrary(),
    labels: fc.constant(null),  // Placeholder
    id: fc.integer(),
    name: fc.string(),
    boxColor: makeColorArbitrary(),
    defaultSizeDatabase: makeDefaultSizeArbitrary(),
});

describe('LabelClass', () => {
    describe('#constructor()', () => {
        it('should set properties according to passed arguments', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeLabelClassParamsArbitrary(), fc.context(),
                    (params, ctx) => {
                        const labelClass = new LabelClass(params);

                        expect(checkValue(
                            labelClass.name,
                            params.name,
                            ctx,
                        ), 'Incorrect value of name').to.be.true;

                        expect(checkValue(
                            labelClass.boxColor.getHex(),
                            params.boxColor.getHex(),
                            ctx,
                        ), 'Incorrect value of boxColor').to.be.true;

                        expect(checkValue(
                            labelClass.defaultSizeDatabase,
                            params.defaultSizeDatabase,
                            ctx,
                            (a, b) => a.equals(b),
                        ), 'Incorrect value of defaultSizeDatabase').to.be.true;
                    },
                ),
            );
        });
    });
});

describe('#name', () => {
    it('should have consistent getter and setter', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeLabelClassParamsArbitrary(), fc.string(), fc.context(),
                (params, name, ctx) => {
                    const labelClass = new LabelClass(params);

                    labelClass.name = name;

                    return checkValue(
                        labelClass.name,
                        name,
                        ctx,
                    );
                },
            ),
        );
    });
});

describe('#boxColor', () => {
    it('should have consistent getter and setter', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeLabelClassParamsArbitrary(), makeColorArbitrary(), fc.context(),
                (params, boxColor, ctx) => {
                    const labelClass = new LabelClass(params);

                    labelClass.boxColor = boxColor;

                    return checkValue(
                        labelClass.boxColor,
                        boxColor,
                        ctx,
                    );
                },
            ),
        );
    });
});

describe('#defaultSizeDatabase', () => {
    it('should have consistent getter and setter', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                makeLabelClassParamsArbitrary(), makeDefaultSizeArbitrary(), fc.context(),
                (params, defaultSizeDatabase, ctx) => {
                    const labelClass = new LabelClass(params);

                    labelClass.defaultSizeDatabase = defaultSizeDatabase;

                    return checkValue(
                        labelClass.defaultSizeDatabase,
                        defaultSizeDatabase,
                        ctx,
                        (a, b) => a.equals(b),
                    );
                },
            ),
        );
    });
});
