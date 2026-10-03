import type { StandardSchemaV1 } from '@standard-schema/spec';
import { validateStandard } from 'cosmiconfig-extends';

import {
  assertDirectory,
  type ConfigFileOptions,
  type ConfigFileShape,
  findConfigFile,
  type LayerOptions,
  readConfigFile,
  readUnifiedFile,
  standaloneBase,
  UNIFIED_BASE,
} from './config-file';
import type { Section } from './section';

/**
 * Options for {@link loadSection}.
 */
export interface LoadSectionOptions extends ConfigFileOptions {
  /**
   * The directory that holds the config files.
   */
  readonly cwd: string;
  /**
   * How the layers of the unified file are checked and combined. Each layer is a whole config file, so `merge` folds whole files and `presetSchema` describes a whole preset file.
   */
  readonly unified?: LayerOptions;
  /**
   * How the layers of the standalone file are checked and combined. Each layer is a value of the section, so `merge` folds section values and `presetSchema` describes a section value with the preset's `extends` key beside its fields.
   */
  readonly standalone?: LayerOptions;
}

/**
 * A section that {@link loadSection} found: its validated value, and the file it was read from.
 */
export interface LoadedSection<Value> {
  /**
   * The section schema's output, defaults included.
   */
  readonly value: Value;
  /**
   * The shape of the file the section was read from.
   */
  readonly shape: ConfigFileShape;
  /**
   * The absolute path of the file the section was read from, with whichever of the accepted extensions it has. For a section that a preset of the unified file supplies, it is the unified file, not the preset.
   */
  readonly file: string;
}

/**
 * Where a section's raw value was found.
 */
interface Found {
  readonly shape: ConfigFileShape;
  readonly file: string;
  readonly value: unknown;
}

async function fromUnified(name: string, options: LoadSectionOptions): Promise<Found | undefined> {
  const file = findConfigFile(options.cwd, UNIFIED_BASE);
  const config = file === undefined ? undefined : await readUnifiedFile(file, options, options.unified);
  if (file === undefined || config === undefined || !Object.hasOwn(config, name) || config[name] === undefined) {
    return undefined;
  }

  return { shape: 'unified', file, value: config[name] };
}

async function fromStandalone(name: string, options: LoadSectionOptions): Promise<Found | undefined> {
  const file = findConfigFile(options.cwd, standaloneBase(name));
  const value = file === undefined ? undefined : await readConfigFile(file, options, options.standalone);

  return file === undefined || value === undefined ? undefined : { shape: 'standalone', file, value };
}

/**
 * Load one tool's section, validated by the descriptor's schema, with the file it was read from.
 *
 * The section comes from `exadev.config.ts` (its key `section.name`) or from `exadev.<section.name>.config.ts`, both in `cwd`; either may instead use the extension `.mts` or `.cts`, and a file that exists under more than one extension throws. Neither file is searched for in a parent directory. Both are evaluated with `extends` applied, each with the {@link LayerOptions} of its own shape (`options.unified` or `options.standalone`), so a section that reaches the unified file through a preset counts as defined there. A section defined in both files throws an error naming both, since choosing one silently would hide a configuration that never takes effect. The result's `value` is the schema's output, and the result is `undefined` when neither file defines the section.
 *
 * Throws `ConfigValidationError` (re-exported by this package, so a caller can test for it with `instanceof`) when the section fails the schema or a preset fails the `presetSchema` of its file's shape (the message then names the preset by its `extends` reference), a `TypeError` when the unified file exports something other than an object, and an `Error` when `cwd` is not an existing directory.
 */
export async function loadSection<Name extends string, Schema extends StandardSchemaV1>(
  section: Section<Name, Schema>,
  options: LoadSectionOptions,
): Promise<LoadedSection<StandardSchemaV1.InferOutput<Schema>> | undefined> {
  assertDirectory(options.cwd);
  const unified = await fromUnified(section.name, options);
  const standalone = await fromStandalone(section.name, options);

  if (unified !== undefined && standalone !== undefined) {
    throw new Error(`section '${section.name}' is defined in both ${unified.file} (directly or through extends) and ${standalone.file}; keep exactly one`);
  }
  const found = unified ?? standalone;
  if (found === undefined) {
    return undefined;
  }
  const value = await validateStandard(section.schema, found.value, `'${section.name}' section in ${found.file}`);

  return { value, shape: found.shape, file: found.file };
}
