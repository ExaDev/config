import { join } from 'node:path';

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { validateStandard } from 'cosmiconfig-extends';

import { assertDirectory, type ConfigFileOptions, readConfigFile, readUnifiedFile, standaloneFile, UNIFIED_FILE } from './config-file';
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
 * Load one tool's section, validated by the descriptor's schema.
 *
 * The section comes from `exadev.config.ts` (its key `section.name`) or from `<section.name>.config.ts`, both in `cwd`; neither is searched for in a parent directory. Both files are evaluated with `extends` applied. A section defined in both files throws an error naming both, since choosing one silently would hide a configuration that never takes effect. The result is the schema's output, and is `undefined` when neither file defines the section.
 *
 * Throws `ConfigValidationError` when the section fails the schema, a `TypeError` when the unified file exports something other than an object, and an `Error` when `cwd` is not an existing directory.
 */
export async function loadSection<Name extends string, Schema extends StandardSchemaV1>(
  section: Section<Name, Schema>,
  options: LoadSectionOptions,
): Promise<StandardSchemaV1.InferOutput<Schema> | undefined> {
  assertDirectory(options.cwd);
  const unifiedFile = join(options.cwd, UNIFIED_FILE);
  const standalone = standaloneFile(options.cwd, section.name);
  const unified = await readUnifiedFile(unifiedFile, options);
  const fromUnified: unknown = unified !== undefined && Object.hasOwn(unified, section.name) ? unified[section.name] : undefined;
  const fromStandalone = await readConfigFile(standalone, options);

  if (fromUnified !== undefined && fromStandalone !== undefined) {
    throw new Error(`section '${section.name}' is defined in both ${unifiedFile} and ${standalone}; keep exactly one`);
  }
  if (fromUnified !== undefined) {
    return validateStandard(section.schema, fromUnified, `'${section.name}' section in ${unifiedFile}`);
  }
  if (fromStandalone !== undefined) {
    return validateStandard(section.schema, fromStandalone, `'${section.name}' section in ${standalone}`);
  }

  return undefined;
}
