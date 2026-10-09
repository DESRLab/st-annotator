import { describe } from 'vitest';

import { BoundingCuboidBuilder } from '../../../../lib/editor/lib/scene/data/views';

import {
    makeCenterTest,
    makeConstructorTest,
    makeFacesTest,
    makeForwardIndicatorFacesTest,
} from './BoundingBox.test';

describe('BoundingCuboid', () => {
    const testBuilder = new BoundingCuboidBuilder();

    makeConstructorTest(testBuilder);
    makeCenterTest(testBuilder);
    makeFacesTest(testBuilder);
    makeForwardIndicatorFacesTest(testBuilder);
});
