import fc from 'fast-check';

import { LevelDescriptor } from '../../lib/label/lib';

/**
 * Creates an arbitrary that returns a {@link LevelDescriptor}.
 * 
 * @returns {fc.Arbitrary<LevelDescriptor>} The new Arbitrary.
 */
export function makeLevelDescriptorArbitrary() {
    return fc.record({
        title: fc.string(),
        value: fc.integer(),
        description: fc.string(),
    }).map(({ title, value, description }) => new LevelDescriptor(title, value, description));
}
