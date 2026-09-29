import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { assertDirectory, type ConfigFileOptions, findConfigFile, readUnifiedFile, UNIFIED_BASE } from './config-file';
import { layoutSection } from './layout';
import { array, type Check, isRecord, isString, required, strictObject } from './validation';

/**
 * The `package.json` field through which a tool package declares the section names it owns: `"exadevConfig": { "sections": ["eslint"] }`. It is how `doctor` learns which sections an installed tool reads, without importing the tool.
 */
export const MANIFEST_FIELD = 'exadevConfig';

interface Manifest {
  readonly sections: readonly string[];
}

const isManifest: Check<Manifest> = strictObject<Manifest>({ sections: required(array(isString)) });

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

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
 * What {@link doctor} found.
 */
export interface DoctorReport {
  /**
   * The unified config file that was read (`exadev.config.ts`, or the same with the extension `.mts` or `.cts`), or `undefined` when the directory has none or the file is empty.
   */
  readonly file: string | undefined;
  /**
   * The top-level keys the file defines after `extends` is applied, in merge order: the keys of a preset come before the keys only the file itself defines.
   */
  readonly defined: readonly string[];
  /**
   * The keys in {@link DoctorReport.defined} that no installed or listed tool owns. Every tool ignores such a key, so it is a misspelt name or a tool that is not installed.
   */
  readonly unowned: readonly string[];
  /**
   * Every section name that is owned, sorted.
   */
  readonly known: readonly string[];
}

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

function dependencyNames(packageJson: unknown): readonly string[] {
  if (!isRecord(packageJson)) {
    return [];
  }

  return DEPENDENCY_FIELDS.flatMap((field) => {
    const dependencies = packageJson[field];

    return isRecord(dependencies) ? Object.keys(dependencies) : [];
  });
}

function declaredSections(dependency: string, packageJson: unknown): readonly string[] {
  if (!isRecord(packageJson) || !Object.hasOwn(packageJson, MANIFEST_FIELD)) {
    return [];
  }
  const manifest = packageJson[MANIFEST_FIELD];
  const problems: string[] = [];
  if (!isManifest(manifest, [], (path, message) => {
    problems.push(`${path.join('.') || '(root)'}: ${message}`);
  })) {
    throw new TypeError(`invalid '${MANIFEST_FIELD}' in the package.json of '${dependency}':\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  }

  return manifest.sections;
}

/**
 * The section names the packages installed for the project in `cwd` declare through {@link MANIFEST_FIELD}. A dependency that is not installed, or declares none, contributes nothing.
 */
function installedSections(cwd: string): readonly string[] {
  const projectFile = join(cwd, 'package.json');
  if (statSync(projectFile, { throwIfNoEntry: false })?.isFile() !== true) {
    return [];
  }

  return dependencyNames(readJson(projectFile)).flatMap((name) => declaredSections(name, findInstalledManifest(cwd, name)));
}

/**
 * Report the sections in the unified config file of `cwd` that no installed or listed tool owns.
 *
 * Typing cannot catch these: a section for a tool that is not installed, or under a misspelt name, is simply ignored by every tool. A section is owned when it is `layout`, when a dependency of the project in `cwd` declares it through {@link MANIFEST_FIELD}, or when it is in `options.listed`.
 *
 * Throws when `cwd` is not an existing directory, when the config file cannot be loaded, when it does not export an object, or when an installed dependency's {@link MANIFEST_FIELD} is malformed.
 */
export async function doctor(options: DoctorOptions): Promise<DoctorReport> {
  assertDirectory(options.cwd);
  const file = findConfigFile(options.cwd, UNIFIED_BASE);
  const config = file === undefined ? undefined : await readUnifiedFile(file, options);
  const known = [...new Set([layoutSection.name, ...installedSections(options.cwd), ...(options.listed ?? [])])].sort();
  if (file === undefined || config === undefined) {
    return { file: undefined, defined: [], unowned: [], known };
  }
  const defined = Object.keys(config);

  return { file, defined, unowned: defined.filter((name) => !known.includes(name)), known };
}
