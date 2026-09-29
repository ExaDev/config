import { describe, expect, it } from 'vitest';

import {
  array,
  type Check,
  integer,
  isRecord,
  isString,
  literal,
  looseObject,
  optional,
  pair,
  type Path,
  required,
  standardSchema,
  strictObject,
} from './validation';

const NEGATIVE = -1;
const FRACTION = 1.5;

interface Problem {
  readonly path: Path;
  readonly message: string;
}

function run(check: Check<unknown>, value: unknown): { readonly valid: boolean; readonly problems: readonly Problem[] } {
  const problems: Problem[] = [];
  const valid = check(value, [], (path, message) => {
    problems.push({ path, message });
  });

  return { valid, problems };
}

describe('isRecord', () => {
  it.each([[{}], [{ a: 1 }], [Object.create(null)]])('accepts the object %j', (value) => {
    expect(isRecord(value)).toBe(true);
  });

  it.each([[null], [[]], ['a'], [1], [undefined]])('rejects %j', (value) => {
    expect(isRecord(value)).toBe(false);
  });
});

describe('isString', () => {
  it('accepts a string and reports nothing', () => {
    expect(run(isString, 'a')).toEqual({ valid: true, problems: [] });
  });

  it('reports anything else at the path it was given', () => {
    const problems: Problem[] = [];

    expect(
      isString(1, ['x', 2], (path, message) => {
        problems.push({ path, message });
      }),
    ).toBe(false);
    expect(problems).toEqual([{ path: ['x', 2], message: 'expected a string' }]);
  });
});

describe('integer', () => {
  it('accepts an integer, including zero and a negative one when there is no minimum', () => {
    expect(run(integer(), 0).valid).toBe(true);
    expect(run(integer(), NEGATIVE).valid).toBe(true);
  });

  it.each([[FRACTION], ['1'], [Number.NaN], [null]])('rejects %j as not an integer', (value) => {
    expect(run(integer(), value)).toEqual({ valid: false, problems: [{ path: [], message: 'expected an integer' }] });
  });

  it('accepts a value equal to the minimum and rejects one below it', () => {
    expect(run(integer(2), 2).valid).toBe(true);
    expect(run(integer(2), 1)).toEqual({ valid: false, problems: [{ path: [], message: 'expected an integer of at least 2' }] });
  });

  it('accepts a minimum of zero', () => {
    expect(run(integer(0), 0).valid).toBe(true);
    expect(run(integer(0), -1).valid).toBe(false);
  });
});

describe('literal', () => {
  it('accepts each allowed value', () => {
    expect(run(literal('a', 'b'), 'a').valid).toBe(true);
    expect(run(literal('a', 'b'), 'b').valid).toBe(true);
    expect(run(literal(true), true).valid).toBe(true);
  });

  it('names every allowed value when rejecting', () => {
    expect(run(literal('a', 'b'), 'c')).toEqual({ valid: false, problems: [{ path: [], message: 'expected "a" or "b"' }] });
  });

  it('does not coerce', () => {
    expect(run(literal(1), '1').valid).toBe(false);
  });
});

describe('array', () => {
  it('accepts an empty array and an array of valid items', () => {
    expect(run(array(isString), []).valid).toBe(true);
    expect(run(array(isString), ['a', 'b']).valid).toBe(true);
  });

  it.each([['a'], [{}], [null]])('rejects %j as not an array', (value) => {
    expect(run(array(isString), value)).toEqual({ valid: false, problems: [{ path: [], message: 'expected an array' }] });
  });

  it('reports every bad item at its index, not only the first', () => {
    expect(run(array(isString), [1, 'a', 2])).toEqual({
      valid: false,
      problems: [
        { path: [0], message: 'expected a string' },
        { path: [2], message: 'expected a string' },
      ],
    });
  });
});

describe('pair', () => {
  it('accepts exactly two valid items', () => {
    expect(run(pair(isString), ['a', 'b']).valid).toBe(true);
  });

  it.each([[[]], [['a']], [['a', 'b', 'c']], ['ab'], [null]])('rejects %j', (value) => {
    expect(run(pair(isString), value)).toEqual({
      valid: false,
      problems: [{ path: [], message: 'expected an array of exactly two items' }],
    });
  });

  it('reports each bad member at its index', () => {
    expect(run(pair(isString), [1, 2])).toEqual({
      valid: false,
      problems: [
        { path: [0], message: 'expected a string' },
        { path: [1], message: 'expected a string' },
      ],
    });
  });
});

describe('strictObject', () => {
  interface Sample {
    readonly a: string;
    readonly b?: number;
  }
  const isSample = strictObject<Sample>({ a: required(isString), b: optional(integer()) });

  it('accepts an object with the required key, with or without the optional one', () => {
    expect(run(isSample, { a: 'x' }).valid).toBe(true);
    expect(run(isSample, { a: 'x', b: 1 }).valid).toBe(true);
  });

  it.each([[null], [[]], ['a']])('rejects %j as not an object', (value) => {
    expect(run(isSample, value)).toEqual({ valid: false, problems: [{ path: [], message: 'expected an object' }] });
  });

  it('reports a missing required key', () => {
    expect(run(isSample, {})).toEqual({ valid: false, problems: [{ path: ['a'], message: 'required' }] });
  });

  it('reports an unknown key', () => {
    expect(run(isSample, { a: 'x', c: 1 })).toEqual({ valid: false, problems: [{ path: ['c'], message: 'unknown key' }] });
  });

  it('checks a present optional key, and treats undefined as a value rather than as absence', () => {
    expect(run(isSample, { a: 'x', b: 'y' }).problems).toEqual([{ path: ['b'], message: 'expected an integer' }]);
    expect(run(isSample, { a: 'x', b: undefined }).valid).toBe(false);
  });

  it('reports every problem in one pass and nests paths', () => {
    const nested = strictObject<{ readonly inner: Sample }>({ inner: required(isSample) });

    expect(run(nested, { inner: { b: 'y', c: 1 }, extra: 1 }).problems).toEqual([
      { path: ['extra'], message: 'unknown key' },
      { path: ['inner', 'c'], message: 'unknown key' },
      { path: ['inner', 'a'], message: 'required' },
      { path: ['inner', 'b'], message: 'expected an integer' },
    ]);
  });

  it('does not take a key from the prototype as present', () => {
    expect(run(isSample, Object.create({ a: 'x' })).problems).toEqual([{ path: ['a'], message: 'required' }]);
  });

  it('treats a key named after an Object.prototype member as unknown', () => {
    expect(run(isSample, { a: 'x', toString: 1 }).problems).toEqual([{ path: ['toString'], message: 'unknown key' }]);
  });
});

describe('looseObject', () => {
  interface Sample {
    readonly a: string;
    readonly b?: number;
  }
  const isSample = looseObject<Sample>({ a: required(isString), b: optional(integer()) });

  it('accepts an object with the required key, whatever other keys it has', () => {
    expect(run(isSample, { a: 'x' }).valid).toBe(true);
    expect(run(isSample, { a: 'x', b: 1, c: 'anything' }).valid).toBe(true);
  });

  it.each([[null], [[]], ['a']])('rejects %j as not an object', (value) => {
    expect(run(isSample, value)).toEqual({ valid: false, problems: [{ path: [], message: 'expected an object' }] });
  });

  it('still reports a missing required key and a bad value of a known key', () => {
    expect(run(isSample, { c: 1 })).toEqual({ valid: false, problems: [{ path: ['a'], message: 'required' }] });
    expect(run(isSample, { a: 'x', b: 'y', c: 1 }).problems).toEqual([{ path: ['b'], message: 'expected an integer' }]);
  });
});

describe('standardSchema', () => {
  const schema = standardSchema('test-vendor', array(isString));

  it('declares Standard Schema version 1 and its vendor', () => {
    expect(schema['~standard'].version).toBe(1);
    expect(schema['~standard'].vendor).toBe('test-vendor');
  });

  it('returns a valid value as it is', () => {
    const value = ['a'];

    expect(schema['~standard'].validate(value)).toEqual({ value });
    expect(schema['~standard'].validate(value)).toHaveProperty('value', value);
  });

  it('returns every issue with its path when the value is invalid', () => {
    expect(schema['~standard'].validate(['a', 1, 2])).toEqual({
      issues: [
        { path: [1], message: 'expected a string' },
        { path: [2], message: 'expected a string' },
      ],
    });
  });
});
