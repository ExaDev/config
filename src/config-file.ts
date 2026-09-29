import { statSync } from 'node:fs';
import { join } from 'node:path';

import type { Loader } from 'cosmiconfig';
import { createExplorer, createJitiLoader, type ExplorerOptions } from 'cosmiconfig-extends';

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
 * Throw unless `directory` is an existing directory, so a mistyped directory is an error rather than a directory with no config.
 */
export function assertDirectory(directory: string): void {
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`${directory} is not an existing directory`);
  }
}

/**
 * The path of the standalone config file for the tool that owns section `name`.
 */
export function standaloneFile(cwd: string, name: string): string {
  return join(cwd, `${name}.config.ts`);
}

/**
 * The own, non-enumerable property jiti defines on the namespace of a module transpiled from ES module syntax. A namespace that has it and no `default` key is a module that exports nothing as its default; a CommonJS `module.exports` object does not have it.
 */
const ES_MODULE_MARKER = '__esModule';

function isNamespaceWithoutDefault(exported: unknown): boolean {
  return isRecord(exported) && Object.getOwnPropertyDescriptor(exported, ES_MODULE_MARKER)?.value === true;
}

/**
 * Wrap a loader so a config file that exports no configuration fails, instead of reading as an absent file. cosmiconfig-extends hands back the whole module namespace when a module has no default export, and `null` when the default export is `null`; either would otherwise reach the caller as a config that defines nothing, so a configuration that never takes effect would go unnoticed. A default export of `undefined` is deliberately an empty config.
 */
function requireDefaultExport(loader: Loader): Loader {
  return async (filepath, content) => {
    const exported: unknown = await loader(filepath, content);
    if (exported === null) {
      throw new TypeError(`${filepath}: the default export is null; export an object, or undefined for an empty config`);
    }
    if (isNamespaceWithoutDefault(exported)) {
      throw new TypeError(`${filepath}: the file has no default export; write the config as \`export default\``);
    }

    return exported;
  };
}

/**
 * The evaluated content of the config file at `file` after `extends` is applied, or `undefined` when the file does not exist, is empty, or has `undefined` as its default export. Throws when the file does not export a default value. Every call reads the file afresh.
 */
export async function readConfigFile(file: string, options: ConfigFileOptions): Promise<unknown> {
  if (statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
    return undefined;
  }
  const checked = requireDefaultExport(createJitiLoader(options).loader);
  const explorer = createExplorer('exadev', {
    ...options,
    cosmiconfig: { cache: false, loaders: { '.ts': checked, '.mts': checked, '.cts': checked } },
  });
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
