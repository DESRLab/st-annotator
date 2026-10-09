import fc from 'fast-check';
import { describe } from 'vitest';

import { makeEquatableTests, makeHashableTests } from '../../../../../../lib/common/lib/testing';
import { EquatableStub, HashableStub } from '../../../../../../lib/common/lib/testing/utils/interfaces/stubs';

const makeEquatableStubArbitrary = () => fc.constant(undefined)
    .map(() => new EquatableStub());

const makeHashableStubArbitrary = () => fc.constant(undefined)
    .map(() => new HashableStub());

describe('EquatableStub', () => {
    makeEquatableTests(makeEquatableStubArbitrary());
});

describe('HashableStub', () => {
    makeEquatableTests(makeHashableStubArbitrary());
    makeHashableTests(makeHashableStubArbitrary());
});
