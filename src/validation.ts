import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Location of a value inside the validated root, outermost key first; empty for the root itself.
 */
export type Path = readonly (string | number)[];

/**
 * Records one problem at `path`.
 */
export type Report = (path: Path, message: string) => void;

/**
 * A type guard that also explains itself. It reports every problem it finds, without stopping at the first, and returns `true` exactly when it reported none.
 */
export type Check<T> = (value: unknown, path: Path, report: Report) => value is T;

/**
 * One property of an object shape. `optional` is the property's presence rule, and the type parameter carries it so that a shape can be checked against the interface it describes.
 */
export interface Field<V, Optional extends boolean> {
  readonly check: Check<V>;
  readonly optional: Optional;
}

/**
 * The fields an object guard needs for `T`: one per property, optional exactly where `T`'s property is optional.
 */
export type Shape<T> = {
  readonly [K in keyof T]-?: object extends Pick<T, K> ? Field<Required<T>[K], true> : Field<T[K], false>;
};

/**
 * Whether `value` is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

/**
 * Check every element of `items` against `item`, reporting each failure at its index, and return whether all passed.
 */
function checkItems<T>(items: readonly unknown[], item: Check<T>, path: Path, report: Report): boolean {
  let valid = true;
  items.forEach((element, index) => {
    valid = item(element, [...path, index], report) && valid;
  });

  return valid;
}

/**
 * A property that must be present.
 */
export function required<V>(check: Check<V>): Field<V, false> {
  return { check, optional: false };
}

/**
 * A property that may be absent. A key that is present must still pass `check`, so `undefined` is not a way to omit it.
 */
export function optional<V>(check: Check<V>): Field<V, true> {
  return { check, optional: true };
}

/**
 * Accepts any string.
 */
export const isString: Check<string> = (value, path, report): value is string => {
  if (typeof value === 'string') {
    return true;
  }
  report(path, 'expected a string');

  return false;
};

/**
 * Accepts an integer no smaller than `minimum`, or any integer when `minimum` is omitted.
 */
export function integer(minimum?: number): Check<number> {
  return (value, path, report): value is number => {
    if (!isInteger(value)) {
      report(path, 'expected an integer');

      return false;
    }
    if (minimum !== undefined && value < minimum) {
      report(path, `expected an integer of at least ${String(minimum)}`);

      return false;
    }

    return true;
  };
}

/**
 * Accepts exactly one of `allowed`.
 */
export function literal<const V extends string | number | boolean>(...allowed: readonly V[]): Check<V> {
  return (value, path, report): value is V => {
    if (allowed.some((candidate) => candidate === value)) {
      return true;
    }
    report(path, `expected ${allowed.map((candidate) => JSON.stringify(candidate)).join(' or ')}`);

    return false;
  };
}

/**
 * Accepts an array whose every item passes `item`. All items are checked, so every bad item is reported.
 */
export function array<T>(item: Check<T>): Check<readonly T[]> {
  return (value, path, report): value is readonly T[] => {
    if (!Array.isArray(value)) {
      report(path, 'expected an array');

      return false;
    }

    return checkItems(value, item, path, report);
  };
}

/**
 * Accepts an array of exactly two items that each pass `item`.
 */
export function pair<T>(item: Check<T>): Check<readonly [T, T]> {
  return (value, path, report): value is readonly [T, T] => {
    if (!Array.isArray(value) || value.length !== 2) {
      report(path, 'expected an array of exactly two items');

      return false;
    }

    return checkItems(value, item, path, report);
  };
}

function objectOf(shape: Readonly<Record<string, Field<unknown, boolean>>>, rejectUnknownKeys: boolean): Check<object> {
  return (value, path, report): value is object => {
    if (!isRecord(value)) {
      report(path, 'expected an object');

      return false;
    }
    let valid = true;
    if (rejectUnknownKeys) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(shape, key)) {
          report([...path, key], 'unknown key');
          valid = false;
        }
      }
    }
    for (const [key, field] of Object.entries(shape)) {
      if (Object.hasOwn(value, key)) {
        valid = field.check(value[key], [...path, key], report) && valid;
      } else if (!field.optional) {
        report([...path, key], 'required');
        valid = false;
      }
    }

    return valid;
  };
}

/**
 * Accepts a plain object with exactly the keys of `shape`: a key outside it is reported as unknown, and a required key that is absent is reported as missing.
 */
export function strictObject<T extends object>(shape: Readonly<Shape<T>>): Check<T>;
export function strictObject(shape: Readonly<Record<string, Field<unknown, boolean>>>): Check<object> {
  return objectOf(shape, true);
}

/**
 * Accepts a plain object that has the keys of `shape` and checks them, but ignores any other key. It is for a document that other parties extend, where a key this version does not know about is not an error.
 */
export function looseObject<T extends object>(shape: Readonly<Shape<T>>): Check<T>;
export function looseObject(shape: Readonly<Record<string, Field<unknown, boolean>>>): Check<object> {
  return objectOf(shape, false);
}

/**
 * Wrap a guard as a Standard Schema whose input and output are both `T`: a value that passes is returned as it is, with nothing defaulted or stripped.
 */
export function standardSchema<T>(vendor: string, check: Check<T>): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate: (value) => {
        const issues: StandardSchemaV1.Issue[] = [];
        const valid = check(value, [], (path, message) => {
          issues.push({ path, message });
        });

        return valid ? { value } : { issues };
      },
    },
  };
}
