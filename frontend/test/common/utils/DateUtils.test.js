import { expect } from 'chai';
import fc from 'fast-check';

import { describe, it } from 'vitest';

import { Timestamp } from '../../../lib/common/lib/utils';
import { checkValue, floatApprox, makeEquatableTests, makeHashableTests } from '../../../lib/common/lib/testing';
import { makeTimestampArbitrary, makeUnixTimeArbitrary } from '../../../lib/common/lib/testing/utils/arbitraries';

describe('Timestamp', () => {
    describe('#constructor()', () => {
        it('instances should be frozen', () => {
            expect(new Timestamp()).to.be.frozen;
        });
        it('should default to valid timestamp', () => {
            const timestamp = new Timestamp();

            expect(timestamp.getDate().getTime(), 'Invalid date').to.not.be.NaN;
            expect(timestamp.getTime(), 'Invalid time').to.not.be.NaN;
        });
        it('should preserve Unix timestamp', () => {
            fc.assert(
                fc.property(
                    makeUnixTimeArbitrary(),
                    // @ts-expect-error
                    fc.context(),
                    (unixTime, ctx) => {
                        const timestamp = new Timestamp(unixTime);
                        ctx.log(`timestamp=${fc.stringify({
                            date: timestamp.getDate(),
                            time: timestamp.getTime(),
                        })}`);

                        expect(timestamp.getTime()).to.equal(Number(unixTime));
                    },
                ),
            );
        });
        it('should preserve value of Date object', () => {
            fc.assert(
                fc.property(
                    fc.date(),
                    // @ts-expect-error
                    fc.context(),
                    (date, ctx) => {
                        const timestamp = new Timestamp(date);
                        ctx.log(`timestamp=${fc.stringify({
                            date: timestamp.getDate(),
                            time: timestamp.getTime(),
                        })}`);

                        expect(timestamp.getDate().getTime()).to.equal(date.getTime());
                    },
                ),
            );
        });
        it('should preserve value of Date string', () => {
            fc.assert(
                fc.property(
                    fc.date(),
                    // @ts-expect-error
                    fc.context(),
                    (date, ctx) => {
                        // Other string methods do not preserve the full resolution of Date
                        const timestamp = new Timestamp(date.toISOString());
                        ctx.log(`timestamp=${fc.stringify({
                            date: timestamp.getDate(),
                            time: timestamp.getTime(),
                        })}`);

                        expect(timestamp.getDate().getTime()).to.equal(date.getTime());
                    },
                ),
            );
        });
        it('should reject invalid Unix timestamps', () => {
            fc.assert(
                fc.property(
                    makeUnixTimeArbitrary(false),
                    // @ts-expect-error
                    fc.context(),
                    (unixTime, ctx) => {
                        expect(() => new Timestamp(unixTime)).to.throw(Error);
                    },
                ),
            );
        });
        it('should reject invalid date strings', () => {
            expect(() => new Timestamp('Invalid Date')).to.throw(Error);
        });
        it('should reject invalid date objects', () => {
            expect(() => new Timestamp(new Date(NaN))).to.throw(Error);
        });
    });

    makeEquatableTests(makeTimestampArbitrary());
    makeHashableTests(makeTimestampArbitrary());

    describe('#getDate(), #getTime()', () => {
        it('should have a resolution no less than that of Date', () => {
            fc.property(
                // @ts-expect-error
                makeTimestampArbitrary(), fc.context(),
                (timestamp, ctx) => {
                    expect(checkValue(
                        timestamp.getTime(),
                        timestamp.getDate().getTime(),
                        ctx,
                        (a, b) => floatApprox(a, b, { atol: 0.5 }),
                    )).to.be.true;
                },
            );
        });
    });

    describe('#clone()', () => {
        it('should return a new Timestamp that is equal to the original', () => {
            fc.assert(
                fc.property(
                    // @ts-expect-error
                    makeTimestampArbitrary(), fc.context(),
                    (date, ctx) => {
                        expect(checkValue(
                            date,
                            date.clone(),
                            ctx,
                            (a, b) => a.equals(b),
                        )).to.be.true;
                    },
                ),
            );
        });
    });
});
