import type { WorkspaceArchitectureOptions } from '@exadev/eslint-config';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { type LayoutConfig, layoutSchema, layoutSection } from './layout';

interface Problem {
  readonly path: readonly (string | number | symbol | { readonly key: PropertyKey })[] | undefined;
  readonly message: string;
}

async function validate(value: unknown): Promise<{ readonly valid: boolean; readonly problems: readonly Problem[] }> {
  const result = await layoutSchema['~standard'].validate(value);

  return result.issues === undefined
    ? { valid: true, problems: [] }
    : { valid: false, problems: result.issues.map(({ path, message }) => ({ path, message })) };
}

async function problemsOf(value: unknown): Promise<readonly Problem[]> {
  return (await validate(value)).problems;
}

const groupRankLayout: LayoutConfig = {
  root: '.',
  packages: ['core/*', 'features/*', 'targets/*', '!**/test/**'],
  dependencyFields: ['dependencies', 'peerDependencies'],
  groups: [
    { name: 'contracts', rank: 0 },
    { name: 'core', rank: 1, naming: 'drop-group' },
    { name: 'features', path: 'packages/features', rank: 2, naming: 'keep-group', slice: { segment: 0 } },
    { name: 'targets', rank: 3, naming: 'basename', slice: { namePrefix: true } },
  ],
  defaultRank: 1,
  rankSkip: { maxDistance: 1, exemptRanks: [0] },
  isolatedGroups: [['features', 'targets']],
  naming: { scope: '@acme', separator: '-' },
};

const nameRoleLayout: LayoutConfig = {
  groups: [{ name: 'libs' }, { name: 'apps' }],
  nameRanks: [
    { pattern: '-contract$', rank: 0 },
    { pattern: '^@acme/app-', rank: 3 },
  ],
  defaultRank: 1,
  rankSkip: { maxDistance: 0, exemptRanks: [] },
};

describe('layoutSection', () => {
  it('is the section named layout, validated by the layout schema', () => {
    expect(layoutSection.name).toBe('layout');
    expect(layoutSection.schema).toBe(layoutSchema);
  });

  it('describes the same options as the workspace architecture rules of @exadev/eslint-config', () => {
    expectTypeOf<LayoutConfig>().toEqualTypeOf<WorkspaceArchitectureOptions>();
  });
});

describe('layoutSchema', () => {
  it.each([
    ['the smallest layout', { groups: [] }],
    ['a group-rank model with slices, naming and isolation', groupRankLayout],
    ['a name-role model with rank patterns', nameRoleLayout],
    ['a negative rank and a zero slice segment', { groups: [{ name: 'a', rank: -1, slice: { segment: 0 } }], defaultRank: -2 }],
    ['every naming strategy', { groups: [{ name: 'a', naming: 'drop-group' }, { name: 'b', naming: 'keep-group' }, { name: 'c', naming: 'basename' }] }],
  ])('accepts %s', async (_name, layout) => {
    expect(await validate(layout)).toEqual({ valid: true, problems: [] });
  });

  it('returns a valid layout as it is, applying no defaults', async () => {
    const result = await layoutSchema['~standard'].validate(groupRankLayout);

    expect(result).toEqual({ value: groupRankLayout });
    expect(result).toHaveProperty('value', groupRankLayout);
  });

  it.each([[null], [[]], ['layout'], [undefined]])('rejects %j as not an object', async (value) => {
    expect(await problemsOf(value)).toEqual([{ path: [], message: 'expected an object' }]);
  });

  it('requires groups', async () => {
    expect(await problemsOf({})).toEqual([{ path: ['groups'], message: 'required' }]);
  });

  it('rejects an unknown key at every level, naming where it is', async () => {
    const layout = {
      groups: [{ name: 'a', extra: 1, slice: { segment: 0, namePrefix: true } }],
      rankskip: { maxDistance: 1, exemptRanks: [] },
      nameRanks: [{ pattern: 'x', rank: 1, extra: 1 }],
      rankSkip: { maxDistance: 1, exemptRanks: [], extra: 1 },
      naming: { extra: 1 },
    };

    expect(await problemsOf(layout)).toEqual([
      { path: ['rankskip'], message: 'unknown key' },
      { path: ['groups', 0, 'extra'], message: 'unknown key' },
      { path: ['groups', 0, 'slice', 'namePrefix'], message: 'unknown key' },
      { path: ['nameRanks', 0, 'extra'], message: 'unknown key' },
      { path: ['rankSkip', 'extra'], message: 'unknown key' },
      { path: ['naming', 'extra'], message: 'unknown key' },
    ]);
  });

  it('rejects a field of the wrong type, at its path', async () => {
    expect(
      await problemsOf({
        root: 1,
        packages: 'core/*',
        dependencyFields: ['dependencies', 2],
        groups: [{ name: 1, path: 2, rank: 1.5, naming: 'flat' }],
        nameRanks: [{ pattern: 1, rank: 'x' }],
        defaultRank: '1',
        rankSkip: { maxDistance: -1, exemptRanks: ['0'] },
        naming: { scope: 1, separator: 2 },
      }),
    ).toEqual([
      { path: ['root'], message: 'expected a string' },
      { path: ['packages'], message: 'expected an array' },
      { path: ['dependencyFields', 1], message: 'expected a string' },
      { path: ['groups', 0, 'name'], message: 'expected a string' },
      { path: ['groups', 0, 'path'], message: 'expected a string' },
      { path: ['groups', 0, 'rank'], message: 'expected an integer' },
      { path: ['groups', 0, 'naming'], message: 'expected "drop-group" or "keep-group" or "basename"' },
      { path: ['nameRanks', 0, 'pattern'], message: 'expected a string' },
      { path: ['nameRanks', 0, 'rank'], message: 'expected an integer' },
      { path: ['defaultRank'], message: 'expected an integer' },
      { path: ['rankSkip', 'maxDistance'], message: 'expected an integer of at least 0' },
      { path: ['rankSkip', 'exemptRanks', 0], message: 'expected an integer' },
      { path: ['naming', 'scope'], message: 'expected a string' },
      { path: ['naming', 'separator'], message: 'expected a string' },
    ]);
  });

  it('requires the members of rankSkip and of a group and rank rule', async () => {
    expect(await problemsOf({ groups: [{}], nameRanks: [{}], rankSkip: {} })).toEqual([
      { path: ['groups', 0, 'name'], message: 'required' },
      { path: ['nameRanks', 0, 'pattern'], message: 'required' },
      { path: ['nameRanks', 0, 'rank'], message: 'required' },
      { path: ['rankSkip', 'maxDistance'], message: 'required' },
      { path: ['rankSkip', 'exemptRanks'], message: 'required' },
    ]);
  });

  describe('slice', () => {
    it.each([[{ segment: -1 }], [{ segment: 1.5 }], [{ segment: '0' }]])('rejects the segment %j', async (slice) => {
      expect((await problemsOf({ groups: [{ name: 'a', slice }] })).map((problem) => problem.path)).toEqual([['groups', 0, 'slice', 'segment']]);
    });

    it.each([[{ namePrefix: false }], [{ namePrefix: 'true' }]])('rejects %j, since namePrefix can only be true', async (slice) => {
      expect(await problemsOf({ groups: [{ name: 'a', slice }] })).toEqual([{ path: ['groups', 0, 'slice', 'namePrefix'], message: 'expected true' }]);
    });

    it.each([[{}], [{ other: 1 }], [null], [[]], ['segment'], [1]])('rejects %j, which is neither variant', async (slice) => {
      expect(await problemsOf({ groups: [{ name: 'a', slice }] })).toEqual([
        { path: ['groups', 0, 'slice'], message: 'expected { segment: <index> } or { namePrefix: true }' },
      ]);
    });
  });

  describe('isolatedGroups', () => {
    const groups = [{ name: 'a' }, { name: 'b' }];

    it('accepts a pair of two different declared groups', async () => {
      expect((await validate({ groups, isolatedGroups: [['a', 'b']] })).valid).toBe(true);
    });

    it('rejects a pair with the wrong number of members', async () => {
      expect(await problemsOf({ groups, isolatedGroups: [['a'], ['a', 'b', 'a']] })).toEqual([
        { path: ['isolatedGroups', 0], message: 'expected an array of exactly two items' },
        { path: ['isolatedGroups', 1], message: 'expected an array of exactly two items' },
      ]);
    });

    it('rejects a member that is not a declared group, at its position', async () => {
      expect(await problemsOf({ groups, isolatedGroups: [['a', 'missing'], ['other', 'b']] })).toEqual([
        { path: ['isolatedGroups', 0, 1], message: "'missing' is not a declared group" },
        { path: ['isolatedGroups', 1, 0], message: "'other' is not a declared group" },
      ]);
    });

    it('rejects a group isolated from itself', async () => {
      expect(await problemsOf({ groups, isolatedGroups: [['a', 'a']] })).toEqual([
        { path: ['isolatedGroups', 0], message: "a group cannot be isolated from itself ('a')" },
      ]);
    });

    it('reports an undeclared group isolated from itself as both problems', async () => {
      expect((await problemsOf({ groups, isolatedGroups: [['z', 'z']] })).map((problem) => problem.path)).toEqual([
        ['isolatedGroups', 0, 0],
        ['isolatedGroups', 0, 1],
        ['isolatedGroups', 0],
      ]);
    });
  });

  it('rejects a group name declared more than once, at every declaration after the first', async () => {
    expect(await problemsOf({ groups: [{ name: 'a' }, { name: 'a' }, { name: 'a' }] })).toEqual([
      { path: ['groups', 1, 'name'], message: "group 'a' is declared more than once" },
      { path: ['groups', 2, 'name'], message: "group 'a' is declared more than once" },
    ]);
  });

  it('rejects a rank pattern that is not a regular expression under the u flag', async () => {
    expect(await problemsOf({ groups: [], nameRanks: [{ pattern: '^ok$', rank: 1 }, { pattern: '(', rank: 1 }, { pattern: '\\-', rank: 1 }] })).toEqual([
      { path: ['nameRanks', 1, 'pattern'], message: "'(' is not a valid regular expression" },
      { path: ['nameRanks', 2, 'pattern'], message: "'\\-' is not a valid regular expression" },
    ]);
  });

  it('does not run the relational rules on a layout whose shape is wrong', async () => {
    expect(await problemsOf({ groups: [{ name: 'a' }, { name: 'a', rank: 'x' }] })).toEqual([{ path: ['groups', 1, 'rank'], message: 'expected an integer' }]);
  });
});
