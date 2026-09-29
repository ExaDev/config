import type { StandardSchemaV1 } from '@standard-schema/spec';
import { validateStandard } from 'cosmiconfig-extends';

import {
  assertDirectory,
  type ConfigFileOptions,
  findConfigFile,
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
}

/**
 * Where a section's value was found.
 */
interface Found {
  readonly file: string;
  readonly value: unknown;
}

async function fromUnified(name: string, cwd: string, options: ConfigFileOptions): Promise<Found | undefined> {
  const file = findConfigFile(cwd, UNIFIED_BASE);
  const config = file === undefined ? undefined : await readUnifiedFile(file, options);
  if (file === undefined || config === undefined || !Object.hasOwn(config, name) || config[name] === undefined) {
    return undefined;
  }

  return { file, value: config[name] };
}

async function fromStandalone(name: string, cwd: string, options: ConfigFileOptions): Promise<Found | undefined> {
  const file = findConfigFile(cwd, standaloneBase(name));
  const value = file === undefined ? undefined : await readConfigFile(file, options);

  return file === undefined || value === undefined ? undefined : { file, value };
}

/**
 * Load one tool's section, validated by the descriptor's schema.
 *
 * The section comes from `exadev.config.ts` (its key `section.name`) or from `exadev.<section.name>.config.ts`, both in `cwd`; either may instead use the extension `.mts` or `.cts`, and a file that exists under more than one extension throws. Neither file is searched for in a parent directory. Both are evaluated with `extends` applied, so a section that reaches the unified file through a preset counts as defined there. A section defined in both files throws an error naming both, since choosing one silently would hide a configuration that never takes effect. The result is the schema's output, and is `undefined` when neither file defines the section.
 *
 * Throws `ConfigValidationError` (re-exported by this package, so a caller can test for it with `instanceof`) when the section fails the schema, a `TypeError` when the unified file exports something other than an object, and an `Error` when `cwd` is not an existing directory.
 */
export async function loadSection<Name extends string, Schema extends StandardSchemaV1>(
  section: Section<Name, Schema>,
  options: LoadSectionOptions,
): Promise<StandardSchemaV1.InferOutput<Schema> | undefined> {
  assertDirectory(options.cwd);
  const unified = await fromUnified(section.name, options.cwd, options);
  const standalone = await fromStandalone(section.name, options.cwd, options);

  if (unified !== undefined && standalone !== undefined) {
    throw new Error(`section '${section.name}' is defined in both ${unified.file} (directly or through extends) and ${standalone.file}; keep exactly one`);
  }
  const found = unified ?? standalone;
  if (found === undefined) {
    return undefined;
  }

  return validateStandard(section.schema, found.value, `'${section.name}' section in ${found.file}`);
}
