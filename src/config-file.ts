import { statSync } from 'node:fs';
import { join } from 'node:path';

import { createExplorer, type ExplorerOptions } from 'cosmiconfig-extends';

import { isRecord } from './validation';

/**
 * The name of the unified config file, looked for in the directory a tool is asked about.
 */
export const UNIFIED_FILE = 'exadev.config.ts';

/**
 * How config files are loaded, passed to `cosmiconfig-extends`: the authoring-import `alias`, jiti's `fsCache`, the `trust` policy for `extends` references (local paths only by default), and the `merge` that combines a file with the presets it extends (arrays replace by default).
 */
export type ConfigFileOptions = Pick<ExplorerOptions, 'alias' | 'fsCache' | 'merge' | 'trust'>;

/**
 * The path of the standalone config file for the tool that owns section `name`.
 */
export function standaloneFile(cwd: string, name: string): string {
  return join(cwd, `${name}.config.ts`);
}

/**
 * The evaluated content of the config file at `file` after `extends` is applied, or `undefined` when the file does not exist or is empty. Every call reads the file afresh.
 */
export async function readConfigFile(file: string, options: ConfigFileOptions): Promise<unknown> {
  if (statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
    return undefined;
  }
  const explorer = createExplorer('exadev', { ...options, cosmiconfig: { cache: false } });
  const result = await explorer.load(file);

  return result?.config;
}

/**
 * The evaluated unified config at `file`: a record, or `undefined` when the file is absent or empty. Throws when the file exports something other than an object.
 */
export async function readUnifiedFile(file: string, options: ConfigFileOptions): Promise<Readonly<Record<string, unknown>> | undefined> {
  const config = await readConfigFile(file, options);
  if (config === undefined) {
    return undefined;
  }
  if (!isRecord(config)) {
    throw new TypeError(`${file}: the default export must be an object`);
  }

  return config;
}
