import fc from "fast-check";
import type { Arbitrary, Command } from "fast-check";
import { describe, it } from "vitest";

import { CollectionUtils } from "../../../lib/common/lib/utils";

import { DefaultMapCommands, KeyViewCommands } from "./collection/commands";
import {
  DefaultMapValidators,
  KeyViewValidators,
} from "./collection/validators";
import type {
  DefaultMapValidator,
  KeyViewValidator,
} from "./collection/validators";

const makeItemArbitrary = () => fc.anything({ maxDepth: 2 });

const makeEntryArbitrary = () =>
  fc.tuple(makeItemArbitrary(), makeItemArbitrary());

const makeKeyViewDepsArbitrary: (
  valFunc: KeyViewValidator<unknown>,
) => Arbitrary<{
  initEntries: readonly [unknown, unknown][];
  commands: Iterable<
    Command<Map<unknown, unknown>, CollectionUtils.KeyView<unknown>>
  >;
}> = (valFunc) =>
  fc.array(makeEntryArbitrary()).chain((entries) => {
    const keys = entries.map(([k]) => k);
    const initEntries = entries.slice(0, Math.floor(entries.length / 2));

    return fc.record({
      initEntries: fc.constant(initEntries),
      commands: fc.commands([
        fc
          .constantFrom(entries)
          .map(([k, v]) => new KeyViewCommands.SetCommand(keys, valFunc, k, v)),
        fc
          .constantFrom(entries)
          .map(([k, v]) => new KeyViewCommands.DeleteCommand(keys, valFunc, k)),
      ]),
    });
  });

const makeKeyViewConsistencyTest: (
  valFunc: KeyViewValidator<unknown>,
) => void = (valFunc) => {
  it("should be consistent with new set constructed from keys of underlying map", () => {
    fc.assert(
      fc.property(
        makeKeyViewDepsArbitrary(valFunc),
        ({ initEntries, commands }) => {
          const model = new Map(initEntries);
          const real = new CollectionUtils.KeyView(model);

          fc.modelRun(() => ({ model, real }), commands);
        },
      ),
    );
  });
};

describe("CollectionUtils.KeyView", () => {
  const keyViewValidators = new KeyViewValidators();

  describe("#forEach()", () => {
    makeKeyViewConsistencyTest(keyViewValidators.validateForEach);
  });
  describe("#has()", () => {
    makeKeyViewConsistencyTest(keyViewValidators.validateHas);
  });
  describe("#size", () => {
    makeKeyViewConsistencyTest(keyViewValidators.validateSize);
  });
  describe("#[Symbol.iterator]()", () => {
    makeKeyViewConsistencyTest(keyViewValidators.validateIterator);
  });
  describe("#values()", () => {
    makeKeyViewConsistencyTest(keyViewValidators.validateValues);
  });
  describe("#keys()", () => {
    makeKeyViewConsistencyTest(keyViewValidators.validateKeys);
  });
  describe("#entries()", () => {
    makeKeyViewConsistencyTest(keyViewValidators.validateEntries);
  });
});

const makeDefaultMapDepsArbitrary: (
  valFunc: DefaultMapValidator<unknown, unknown>,
) => Arbitrary<{
  initEntries: readonly [unknown, unknown][];
  commands: Iterable<
    Command<Map<unknown, unknown>, CollectionUtils.DefaultMap<unknown, unknown>>
  >;
}> = (valFunc) =>
  fc.array(makeEntryArbitrary()).chain((entries) => {
    const initEntries = entries.slice(0, Math.floor(entries.length / 2));

    return fc.record({
      initEntries: fc.constant(initEntries),
      commands: fc.commands([
        fc
          .constantFrom(entries)
          .map(
            ([k, v]) =>
              new DefaultMapCommands.GetOrSetCommand(entries, valFunc, k),
          ),
        fc
          .constantFrom(entries)
          .map(
            ([k, v]) =>
              new DefaultMapCommands.SetCommand(entries, valFunc, k, v),
          ),
        fc
          .constantFrom(entries)
          .map(
            ([k, v]) =>
              new DefaultMapCommands.DeleteCommand(entries, valFunc, k),
          ),
        fc
          .constantFrom(entries)
          .map(() => new DefaultMapCommands.ClearCommand(entries, valFunc)),
      ]),
    });
  });

const makeDefaultMapConsistencyTest: (
  valFunc: DefaultMapValidator<unknown, unknown>,
) => void = (valFunc) => {
  it("should be consistent with underlying map", () => {
    fc.assert(
      fc.property(
        makeDefaultMapDepsArbitrary(valFunc),
        fc.object({ maxDepth: 2 }),
        ({ initEntries, commands }, defaultValue) => {
          const model = new Map(initEntries);
          const real = new CollectionUtils.DefaultMap(
            () => defaultValue,
            initEntries,
          );

          fc.modelRun(() => ({ model, real }), commands);
        },
      ),
    );
  });
};

describe("CollectionUtils.DefaultMap", () => {
  const defaultMapValidators = new DefaultMapValidators();

  describe("#forEach()", () => {
    makeDefaultMapConsistencyTest(defaultMapValidators.validateForEach);
  });
  describe("#has()", () => {
    makeDefaultMapConsistencyTest(defaultMapValidators.validateHas);
  });
  describe("#size", () => {
    makeDefaultMapConsistencyTest(defaultMapValidators.validateSize);
  });
  describe("#[Symbol.iterator]()", () => {
    makeDefaultMapConsistencyTest(defaultMapValidators.validateIterator);
  });
  describe("#keys()", () => {
    makeDefaultMapConsistencyTest(defaultMapValidators.validateKeys);
  });
  describe("#values()", () => {
    makeDefaultMapConsistencyTest(defaultMapValidators.validateValues);
  });
  describe("#entries()", () => {
    makeDefaultMapConsistencyTest(defaultMapValidators.validateEntries);
  });
});
