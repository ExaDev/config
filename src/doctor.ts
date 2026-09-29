import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { assertDirectory, type ConfigFileOptions, findConfigFile, readUnifiedFile, UNIFIED_BASE } from './config-file';
import { layoutSection } from './layout';
import { array, type Check, isObject, isString, looseObject, optional, required, validated } from './validation';

/**
 * The `package.json` field through which a tool package declares the section names it owns: `"exadevConfig": { "sections": ["eslint"] }`. It is how `doctor` learns which sections an installed tool reads, without importing the tool.
 */
export const MANIFEST_FIELD = 'exadevConfig';

interface Manifest {
  readonly sections: readonly string[];
}

// Loose, not strict: a future version of this package may add a key that an older doctor must not reject in every consumer that installs the tool.
const isManifest: Check<Manifest> = looseObject<Manifest>({ sections: required(array(isString)) });

type Dependencies = Readonly<Record<string, unknown>>;

/**
 * The part of a `package.json` that the tool packages installed for a project are read for.
 */
interface ManifestHolder {
  readonly [MANIFEST_FIELD]?: Manifest;
}

/**
 * The part of the project's own `package.json` that is read: the manifest field, and the dependency fields that name the installed tools.
 */
interface ProjectPackage extends ManifestHolder {
  readonly dependencies?: Dependencies;
  readonly devDependencies?: Dependencies;
  readonly peerDependencies?: Dependencies;
  readonly optionalDependencies?: Dependencies;
}

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const satisfies readonly (keyof ProjectPackage)[];

const holdsManifest: Check<ManifestHolder> = looseObject<ManifestHolder>({ [MANIFEST_FIELD]: optional(isManifest) });

const isProjectPackage: Check<ProjectPackage> = looseObject<ProjectPackage>({
  [MANIFEST_FIELD]: optional(isManifest),
  dependencies: optional(isObject),
  devDependencies: optional(isObject),
  peerDependencies: optional(isObject),
  optionalDependencies: optional(isObject),
});

/**
 * Options for {@link doctor}.
 */
export interface DoctorOptions extends ConfigFileOptions {
  /**
   * The directory that holds `exadev.config.ts` and the `package.json` whose dependencies are the installed tools.
   */
  readonly cwd: string;
  /**
   * Section names to treat as owned in addition to the built-in `layout` and those declared by installed packages, for a tool that cannot declare them itself.
   */
  readonly listed?: readonly string[];
}

/**
 * The fields of a {@link DoctorReport} that do not depend on whether a config was checked.
 */
interface DoctorReportFields {
  /**
   * The top-level keys the file defines after `extends` is applied, in merge order: the keys of a preset come before the keys only the file itself defines. Empty when nothing was checked.
   */
  readonly defined: readonly string[];
  /**
   * The keys in {@link DoctorReportFields.defined} that no installed or listed tool owns. Every tool ignores such a key, so it is a misspelt name or a tool that is not installed. Empty when nothing was checked, which is not the same as every section being owned: test {@link DoctorReport.outcome} first.
   */
  readonly unowned: readonly string[];
  /**
   * Every section name that is owned, sorted.
   */
  readonly known: readonly string[];
}

/**
 * The report for a unified config file that was read and defines its keys.
 */
export interface CheckedDoctorReport extends DoctorReportFields {
  readonly outcome: 'checked';
  /**
   * The unified config file that was read: `exadev.config.ts`, or the same with the extension `.mts` or `.cts`.
   */
  readonly file: string;
}

/**
 * The report when nothing was checked: `'no-config-file'` when the directory has no unified config file, `'empty'` when the file exists but its default export is `undefined`.
 */
export interface UncheckedDoctorReport extends DoctorReportFields {
  readonly outcome: 'no-config-file' | 'empty';
  readonly file: undefined;
}

/**
 * What {@link doctor} found. Discriminated by `outcome`: a checked config carries its `file`, and a directory with no config file, or with an empty one, is reported as such instead of as a config in which every section is owned.
 */
export type DoctorReport = CheckedDoctorReport | UncheckedDoctorReport;

function readJson(file: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));

  return parsed;
}

/**
 * The `package.json` of dependency `name`, found by walking up from `cwd` through `node_modules` directories, or `undefined` when it is not installed. The file is read directly, because a package's `exports` map may hide `package.json` from a resolver.
 */
function findInstalledManifest(cwd: string, name: string): unknown {
  for (let directory = cwd; ; directory = dirname(directory)) {
    const file = join(directory, 'node_modules', name, 'package.json');
    if (statSync(file, { throwIfNoEntry: false })?.isFile() === true) {
      return readJson(file);
    }
    if (dirname(directory) === directory) {
      return undefined;
    }
  }
}

/**
 * The names of the dependencies of `project` in every dependency field, which may repeat.
 */
function dependencyNames(project: ProjectPackage): readonly string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.keys({ ...project[field] }));
}

/**
 * The section names that the project in `cwd` and the packages installed for it declare through {@link MANIFEST_FIELD}; the project's own declaration is how a tool repository owns the section it dogfoods. A dependency that is not installed, or declares none, contributes nothing. Throws when a `package.json` it reads is not an object, or when a manifest or the project's dependency fields are malformed.
 */
function installedSections(cwd: string): readonly string[] {
  const projectFile = join(cwd, 'package.json');
  if (statSync(projectFile, { throwIfNoEntry: false })?.isFile() !== true) {
    return [];
  }
  const project = validated(isProjectPackage, readJson(projectFile), "the project's package.json");
  const installed = dependencyNames(project).flatMap((name) => {
    const manifest = findInstalledManifest(cwd, name);

    return manifest === undefined ? [] : (validated(holdsManifest, manifest, `the package.json of '${name}'`)[MANIFEST_FIELD]?.sections ?? []);
  });

  return [...(project[MANIFEST_FIELD]?.sections ?? []), ...installed];
}

/**
 * Report the sections in the unified config file of `cwd` that no installed or listed tool owns. A directory with no such file is not an error and is not searched upward: the report's {@link DoctorReport.outcome} is `'no-config-file'`, so a caller can tell that from a checked config with nothing unowned.
 *
 * Typing cannot catch these: a section for a tool that is not installed, or under a misspelt name, is simply ignored by every tool. A section is owned when it is `layout`, when a dependency of the project in `cwd` declares it through {@link MANIFEST_FIELD}, or when it is in `options.listed`.
 *
 * Throws when `cwd` is not an existing directory, when the config file cannot be loaded, when it does not export an object, or when a `package.json` it reads is not an object or has a malformed {@link MANIFEST_FIELD} or dependency field.
 */
export async function doctor(options: DoctorOptions): Promise<DoctorReport> {
  assertDirectory(options.cwd);
  const known = [...new Set([layoutSection.name, ...installedSections(options.cwd), ...(options.listed ?? [])])].sort();
  const file = findConfigFile(options.cwd, UNIFIED_BASE);
  if (file === undefined) {
    return { outcome: 'no-config-file', file: undefined, defined: [], unowned: [], known };
  }
  const config = await readUnifiedFile(file, options);
  if (config === undefined) {
    return { outcome: 'empty', file: undefined, defined: [], unowned: [], known };
  }
  const defined = Object.keys(config);

  return { outcome: 'checked', file, defined, unowned: defined.filter((name) => !known.includes(name)), known };
}
