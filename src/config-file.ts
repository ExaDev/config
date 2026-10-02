import { statSync } from 'node:fs';
import { join } from 'node:path';

import type { Loader } from 'cosmiconfig';
import { createExplorer, createJitiLoader, type ExplorerOptions } from 'cosmiconfig-extends';

import { isRecord } from './validation';

/**
 * The base name of the unified config file, `exadev.config.<extension>`, looked for in the directory a tool is asked about.
 */
export const UNIFIED_BASE = 'exadev';

/**
 * The extensions a config file may have: the ones cosmiconfig-extends registers its TypeScript loader for.
 */
export const CONFIG_EXTENSIONS = ['.ts', '.mts', '.cts'] as const;

/**
 * How config files are loaded, passed to `cosmiconfig-extends`: the authoring-import `alias`, jiti's `fsCache`, the `trust` policy for `extends` references (local paths only by default), the `merge` that combines a file with the presets it extends (arrays replace by default), and the `presetSchema` that validates each preset before it is merged, so a failure names the preset as `preset '<ref>'` (none by default).
 *
 * `merge` and `presetSchema` see the layers of whichever file is read: for the unified file each preset is a whole config file, and for a standalone file it is a value of that file's section. `presetSchema`'s output replaces the preset, so it must keep the `extends` key and apply no defaults. The config file itself is not a preset; its section is checked by the section's own schema.
 */
export type ConfigFileOptions = Pick<ExplorerOptions, 'alias' | 'fsCache' | 'merge' | 'presetSchema' | 'trust'>;

/**
 * Throw unless `directory` is an existing directory, so a mistyped directory is an error rather than a directory with no config.
 */
export function assertDirectory(directory: string): void {
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
    throw new Error(`${directory} is not an existing directory`);
  }
}

/**
 * The base name of the standalone config file for the tool that owns section `name`: `exadev.<name>.config.<extension>`. It is namespaced because the plain `<name>.config.<extension>` is the native config file of many tools (`eslint.config.ts`, `vitest.config.ts`), which a section of the same name would otherwise read as its own.
 */
export function standaloneBase(name: string): string {
  return `${UNIFIED_BASE}.${name}`;
}

/**
 * The config file `<base>.config.<extension>` in `directory`, or `undefined` when there is none. Throws when the file exists under more than one extension, since choosing one silently would hide a configuration that never takes effect.
 */
export function findConfigFile(directory: string, base: string): string | undefined {
  const found = CONFIG_EXTENSIONS.map((extension) => join(directory, `${base}.config${extension}`)).filter(
    (file) => statSync(file, { throwIfNoEntry: false })?.isFile() === true,
  );
  if (found.length > 1) {
    throw new Error(`${base}.config exists under more than one extension (${found.join(', ')}); keep exactly one`);
  }

  return found[0];
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
 * Exactly the {@link ConfigFileOptions} of `options`. A caller's options object is usually wider (it carries `cwd` at least), and spreading it whole into the explorer would let any other key cosmiconfig-extends reads, such as `extendsKey` or `schema`, change how files load without the type admitting it.
 */
function configFileOptions(options: ConfigFileOptions): ConfigFileOptions {
  const { alias, fsCache, merge, presetSchema, trust } = options;

  return {
    ...(alias === undefined ? {} : { alias }),
    ...(fsCache === undefined ? {} : { fsCache }),
    ...(merge === undefined ? {} : { merge }),
    ...(presetSchema === undefined ? {} : { presetSchema }),
    ...(trust === undefined ? {} : { trust }),
  };
}

/**
 * The evaluated content of the config file at `file` after `extends` is applied, or `undefined` when the file is empty or has `undefined` as its default export. Throws when the file does not export a default value. Every call reads the file afresh, because it builds an explorer of its own and so shares no cache.
 */
export async function readConfigFile(file: string, options: ConfigFileOptions): Promise<unknown> {
  const declared = configFileOptions(options);
  const checked = requireDefaultExport(createJitiLoader(declared).loader);
  const explorer = createExplorer(UNIFIED_BASE, {
    ...declared,
    cosmiconfig: { loaders: { '.ts': checked, '.mts': checked, '.cts': checked } },
  });
  const result = await explorer.load(file);

  return result?.config;
}

/**
 * The evaluated unified config at `file`: a record, or `undefined` when the file is empty. Throws when the file exports something other than an object.
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
