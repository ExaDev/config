import type { StandardSchemaV1 } from '@standard-schema/spec';

import { defineSection, type Section } from './section';
import {
  array,
  type Check,
  integer,
  isRecord,
  isString,
  literal,
  optional,
  pair,
  type Path,
  type Report,
  required,
  standardSchema,
  strictObject,
} from './validation';

/**
 * A group whose packages take their slice from the Nth path segment after the group's own root.
 */
export interface SliceBySegment {
  readonly segment: number;
}

/**
 * A group with no path structure of its own (a flat directory) whose packages take their slice from whichever other group's already-observed slice value prefixes their declared name.
 */
export interface SliceByNamePrefix {
  readonly namePrefix: true;
}

/**
 * A group's own sub-partition: packages in different slices are isolated from each other even when their groups' ranks would allow the dependency.
 */
export type SliceSpec = SliceBySegment | SliceByNamePrefix;

/**
 * How a group derives a package's expected name from its path: `drop-group` omits the group's own segment, `keep-group` keeps it, and `basename` uses only the last path segment.
 */
export type NamingStrategy = 'drop-group' | 'keep-group' | 'basename';

/**
 * One top-level directory of the workspace that groups packages.
 */
export interface GroupSpec {
  readonly name: string;
  /**
   * The group's root relative to the workspace root; the group name when omitted.
   */
  readonly path?: string;
  /**
   * The group's rank in a group-rank model. Omit it in a name-role model, where {@link LayoutConfig.nameRanks} and {@link LayoutConfig.defaultRank} decide.
   */
  readonly rank?: number;
  readonly slice?: SliceSpec;
  /**
   * How the group's packages are expected to be named from their paths; `drop-group` when omitted.
   */
  readonly naming?: NamingStrategy;
}

/**
 * Assigns a rank to every package whose declared name matches `pattern`.
 */
export interface RankRule {
  /**
   * The source text of a regular expression, compiled with the `u` flag and tested against the package's declared name. Rules are checked in array order and the first match wins.
   */
  readonly pattern: string;
  readonly rank: number;
}

/**
 * Limits how far below itself a package may depend.
 */
export interface RankSkipOptions {
  /**
   * A dependency may sit at most this many ranks below its dependant: 1 allows only the next rank down, 0 only the same rank.
   */
  readonly maxDistance: number;
  /**
   * Ranks that may be depended on from any distance, typically a dependency-light contract layer.
   */
  readonly exemptRanks: readonly number[];
}

/**
 * The scoped name convention packages are expected to follow.
 */
export interface NamingOptions {
  /**
   * The package name prefix, such as `@acme`, joined to the derived path segments with `/`. Names are unscoped when omitted.
   */
  readonly scope?: string;
  /**
   * Joins a package's derived path segments; `-` when omitted.
   */
  readonly separator?: string;
}

/**
 * The shape of a workspace: which directories group its packages, how those groups rank, and which dependencies between them are allowed. It describes structure only. What a tool does about a violation (allow lists, required files or scripts) is that tool's own section.
 */
export interface LayoutConfig {
  /**
   * The workspace root directory. When omitted a tool finds the nearest ancestor of the file it is looking at that owns a `pnpm-workspace.yaml`.
   */
  readonly root?: string;
  /**
   * Workspace package globs in the `pnpm-workspace.yaml` dialect (`*`, `**`, `!`-prefixed excludes). When omitted a tool reads the workspace file's own `packages` list.
   */
  readonly packages?: readonly string[];
  /**
   * The `package.json` fields read as a package's declared dependencies; `dependencies` alone when omitted.
   */
  readonly dependencyFields?: readonly string[];
  /**
   * The workspace's groups. Names are unique.
   */
  readonly groups: readonly GroupSpec[];
  /**
   * The name-role model: patterns assigning a rank by declared package name, consulted before a package's group rank.
   */
  readonly nameRanks?: readonly RankRule[];
  /**
   * The rank of a package that neither `nameRanks` nor its group ranks.
   */
  readonly defaultRank?: number;
  readonly rankSkip?: RankSkipOptions;
  /**
   * Pairs of group names that may not depend on each other in either direction, on top of the rank and slice checks. Each name is a declared group, and a pair names two different groups.
   */
  readonly isolatedGroups?: readonly (readonly [string, string])[];
  readonly naming?: NamingOptions;
}

const isSliceBySegment: Check<SliceBySegment> = strictObject<SliceBySegment>({ segment: required(integer(0)) });
const isSliceByNamePrefix: Check<SliceByNamePrefix> = strictObject<SliceByNamePrefix>({ namePrefix: required(literal(true)) });

const isSliceSpec: Check<SliceSpec> = (value, path, report): value is SliceSpec => {
  if (isRecord(value) && 'segment' in value) {
    return isSliceBySegment(value, path, report);
  }
  if (isRecord(value) && 'namePrefix' in value) {
    return isSliceByNamePrefix(value, path, report);
  }
  report(path, 'expected { segment: <index> } or { namePrefix: true }');

  return false;
};

const isGroupSpec: Check<GroupSpec> = strictObject<GroupSpec>({
  name: required(isString),
  path: optional(isString),
  rank: optional(integer()),
  slice: optional(isSliceSpec),
  naming: optional(literal('drop-group', 'keep-group', 'basename')),
});

const isRankRule: Check<RankRule> = strictObject<RankRule>({ pattern: required(isString), rank: required(integer()) });

const isRankSkipOptions: Check<RankSkipOptions> = strictObject<RankSkipOptions>({
  maxDistance: required(integer(0)),
  exemptRanks: required(array(integer())),
});

const isNamingOptions: Check<NamingOptions> = strictObject<NamingOptions>({
  scope: optional(isString),
  separator: optional(isString),
});

const hasLayoutShape: Check<LayoutConfig> = strictObject<LayoutConfig>({
  root: optional(isString),
  packages: optional(array(isString)),
  dependencyFields: optional(array(isString)),
  groups: required(array(isGroupSpec)),
  nameRanks: optional(array(isRankRule)),
  defaultRank: optional(integer()),
  rankSkip: optional(isRankSkipOptions),
  isolatedGroups: optional(array(pair(isString))),
  naming: optional(isNamingOptions),
});

function isValidRegularExpression(source: string): boolean {
  try {
    new RegExp(source, 'u');

    return true;
  } catch {
    return false;
  }
}

/**
 * The rules that relate one part of a structurally valid layout to another: unique group names, compilable rank patterns, and isolated pairs that name two different declared groups.
 */
function isCoherent(layout: LayoutConfig, path: Path, report: Report): boolean {
  let coherent = true;
  const declared = new Set<string>();
  layout.groups.forEach((group, index) => {
    if (declared.has(group.name)) {
      report([...path, 'groups', index, 'name'], `group '${group.name}' is declared more than once`);
      coherent = false;
    }
    declared.add(group.name);
  });
  layout.nameRanks?.forEach((rule, index) => {
    if (!isValidRegularExpression(rule.pattern)) {
      report([...path, 'nameRanks', index, 'pattern'], `'${rule.pattern}' is not a valid regular expression`);
      coherent = false;
    }
  });
  layout.isolatedGroups?.forEach((groups, index) => {
    groups.forEach((name, position) => {
      if (!declared.has(name)) {
        report([...path, 'isolatedGroups', index, position], `'${name}' is not a declared group`);
        coherent = false;
      }
    });
    if (groups[0] === groups[1]) {
      report([...path, 'isolatedGroups', index], `a group cannot be isolated from itself ('${groups[0]}')`);
      coherent = false;
    }
  });

  return coherent;
}

const isLayoutConfig: Check<LayoutConfig> = (value, path, report): value is LayoutConfig =>
  hasLayoutShape(value, path, report) && isCoherent(value, path, report);

/**
 * The Standard Schema for {@link LayoutConfig}. It rejects unknown keys at every level, and checks the rules that relate one part of the layout to another. It applies no defaults and returns a valid value as it is.
 */
export const layoutSchema: StandardSchemaV1<LayoutConfig, LayoutConfig> = standardSchema('@exadev/config', isLayoutConfig);

/**
 * The shared `layout` section: the workspace's shape, read by every tool that reasons about it, so the ESLint architecture rules and the conformance tool read one description. Its fields match the options of `@exadev/eslint-config`'s workspace architecture rules.
 */
export const layoutSection: Section<'layout', StandardSchemaV1<LayoutConfig, LayoutConfig>> = defineSection('layout', layoutSchema);
