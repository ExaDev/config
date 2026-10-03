import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigValidationError, deepMerge, type Merge } from 'cosmiconfig-extends';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { makeProject, writeProjectFile } from '../test/support/project';

import { layoutSection } from './layout';
import { loadSection } from './load-section';
import { defineSection } from './section';
import { isRecord } from './validation';

const toolA = defineSection('toolA', z.strictObject({ include: z.array(z.string()), level: z.enum(['low', 'high']).default('low') }));

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * A layer of `toolA` as a preset may supply it: every field optional and no default, since a default would turn "no opinion" into an override.
 */
const toolALayer = z.strictObject({ include: z.array(z.string()).optional(), level: z.enum(['low', 'high']).optional() });

/**
 * A preset of the unified file: a whole config file, which must keep its `extends` key for the chain to continue.
 */
const unifiedPreset = z.looseObject({ extends: z.unknown().optional(), toolA: toolALayer.optional() });

/**
 * A preset of the standalone `toolA` file: a section value, which carries the `extends` key itself.
 */
const standalonePreset = toolALayer.extend({ extends: z.unknown().optional() });

function includeOf(layer: Readonly<Record<string, unknown>>): readonly unknown[] {
  const include = layer['include'];

  return isArray(include) ? include : [];
}

/**
 * The merge rule of `toolA`'s own layers: `include` lists form a union, and a later layer replaces every other field. It is written for a section value, so it is the merge of the standalone file, whose layers are section values.
 */
const unionSection: Merge = (base, override) => {
  if (!isRecord(base) || !isRecord(override)) {
    return override;
  }
  const include = [...new Set([...includeOf(base), ...includeOf(override)])];

  return { ...base, ...override, ...(include.length === 0 ? {} : { include }) };
};

/**
 * {@link unionSection} lifted to the layers of the unified file, which are whole config files holding `toolA` under its name.
 */
const unionUnified: Merge = (base, override) => {
  if (!isRecord(base) || !isRecord(override)) {
    return override;
  }
  const [earlier, later] = [base['toolA'], override['toolA']];
  const section = earlier === undefined || later === undefined ? (later ?? earlier) : unionSection(earlier, later);

  return { ...base, ...override, ...(section === undefined ? {} : { toolA: section }) };
};

function escapeRegExp(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

const SECTION = "{ include: ['src'] }";

function unified(section: string = SECTION): string {
  return `export default { toolA: ${section}, other: { anything: true } };\n`;
}

describe('loadSection', () => {
  it('reads a section from the unified file, and says it was read from there', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified() });

    expect(await loadSection(toolA, { cwd })).toEqual({ value: { include: ['src'], level: 'low' }, shape: 'unified', file: join(cwd, 'exadev.config.ts') });
  });

  it('reads a section from its standalone file, and says it was read from there', async () => {
    const cwd = makeProject({ 'exadev.toolA.config.ts': `export default ${SECTION};\n` });

    expect(await loadSection(toolA, { cwd })).toEqual({ value: { include: ['src'], level: 'low' }, shape: 'standalone', file: join(cwd, 'exadev.toolA.config.ts') });
  });

  it('produces the same section from the unified file and from the standalone file', async () => {
    const fromUnified = await loadSection(toolA, { cwd: makeProject({ 'exadev.config.ts': unified("{ include: ['a', 'b'], level: 'high' }") }) });
    const fromStandalone = await loadSection(toolA, { cwd: makeProject({ 'exadev.toolA.config.ts': "export default { include: ['a', 'b'], level: 'high' };\n" }) });

    expect(fromUnified?.value).toEqual({ include: ['a', 'b'], level: 'high' });
    expect(fromStandalone?.value).toEqual(fromUnified?.value);
  });

  it('ignores the sections of other tools in the unified file, and their standalone files', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified(), 'exadev.other.config.ts': 'export default 1;\n' });

    expect((await loadSection(toolA, { cwd }))?.value).toEqual({ include: ['src'], level: 'low' });
  });

  it('fails when the section is defined in both files, naming both', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified(), 'exadev.toolA.config.ts': `export default ${SECTION};\n` });

    await expect(loadSection(toolA, { cwd })).rejects.toThrow(
      new Error(`section 'toolA' is defined in both ${join(cwd, 'exadev.config.ts')} (directly or through extends) and ${join(cwd, 'exadev.toolA.config.ts')}; keep exactly one`),
    );
  });

  it('fails when a preset of the unified file supplies a section the standalone file also defines', async () => {
    const cwd = makeProject({
      'preset.ts': `export default { toolA: ${SECTION} };\n`,
      'exadev.config.ts': "export default { extends: './preset.ts' };\n",
      'exadev.toolA.config.ts': `export default ${SECTION};\n`,
    });

    await expect(loadSection(toolA, { cwd })).rejects.toThrow(/defined in both .*exadev\.config\.ts \(directly or through extends\) and .*exadev\.toolA\.config\.ts/);
  });

  it('is not a conflict when the unified file defines only other sections', async () => {
    const cwd = makeProject({ 'exadev.config.ts': "export default { other: {} };\n", 'exadev.toolA.config.ts': `export default ${SECTION};\n` });

    expect((await loadSection(toolA, { cwd }))?.value).toEqual({ include: ['src'], level: 'low' });
  });

  it('returns undefined when no file defines the section', async () => {
    expect(await loadSection(toolA, { cwd: makeProject() })).toBeUndefined();
    expect(await loadSection(toolA, { cwd: makeProject({ 'exadev.config.ts': 'export default { other: {} };\n' }) })).toBeUndefined();
  });

  it('returns undefined for an empty unified file and for a section exported as undefined', async () => {
    expect(await loadSection(toolA, { cwd: makeProject({ 'exadev.config.ts': 'export default undefined;\n' }) })).toBeUndefined();
    expect(await loadSection(toolA, { cwd: makeProject({ 'exadev.config.ts': 'export default { toolA: undefined };\n' }) })).toBeUndefined();
    expect(await loadSection(toolA, { cwd: makeProject({ 'exadev.toolA.config.ts': 'export default undefined;\n' }) })).toBeUndefined();
  });

  it('returns undefined for a file with no content', async () => {
    expect(await loadSection(toolA, { cwd: makeProject({ 'exadev.config.ts': '' }) })).toBeUndefined();
    expect(await loadSection(toolA, { cwd: makeProject({ 'exadev.toolA.config.ts': '' }) })).toBeUndefined();
  });

  const NULL_EXPORT = 'the default export is null; export an object, or undefined for an empty config';
  const NO_DEFAULT = 'the file has no default export; write the config as `export default`';

  it.each([
    ['exadev.config.ts', 'export default null;\n', NULL_EXPORT],
    ['exadev.config.ts', 'export const config = { toolA: { include: [] } };\n', NO_DEFAULT],
    ['exadev.config.ts', 'export {};\n', NO_DEFAULT],
    ['exadev.toolA.config.ts', 'export default null;\n', NULL_EXPORT],
    ['exadev.toolA.config.ts', 'export const config = { include: [] };\n', NO_DEFAULT],
  ])('fails on %s that exports no configuration: %j', async (file, content, message) => {
    const cwd = makeProject({ [file]: content });

    await expect(loadSection(toolA, { cwd })).rejects.toMatchObject({ name: 'TypeError', message: `${join(cwd, file)}: ${message}` });
  });

  it('does not take a section from the prototype of the unified config', async () => {
    const constructorSection = defineSection('constructor', z.unknown());
    const cwd = makeProject({ 'exadev.config.ts': 'export default {};\n' });

    expect(await loadSection(constructorSection, { cwd })).toBeUndefined();
  });

  it('fails when cwd is not an existing directory, instead of reporting an absent section', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified() });
    const missing = join(cwd, 'does-not-exist');

    await expect(loadSection(toolA, { cwd: missing })).rejects.toThrow(new Error(`${missing} is not an existing directory`));
    await expect(loadSection(toolA, { cwd: join(cwd, 'exadev.config.ts') })).rejects.toThrow('is not an existing directory');
  });

  it('does not search parent directories', async () => {
    const parent = makeProject({ 'exadev.config.ts': unified() });
    writeProjectFile(parent, 'child/package.json', '{}');

    expect(await loadSection(toolA, { cwd: join(parent, 'child') })).toBeUndefined();
  });

  it('applies the schema and returns its output, defaults included', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified() });

    expect((await loadSection(toolA, { cwd }))?.value).toHaveProperty('level', 'low');
  });

  describe('file names', () => {
    const eslintSection = defineSection('eslint', z.strictObject({ strict: z.boolean() }));

    it('does not read the native config file of a tool that shares the section name', async () => {
      const native = makeProject({ 'eslint.config.ts': 'export default [{ rules: {} }];\n', 'vitest.config.ts': 'export default {};\n' });

      expect(await loadSection(eslintSection, { cwd: native })).toBeUndefined();

      const both = makeProject({ 'eslint.config.ts': 'export default [{ rules: {} }];\n', 'exadev.config.ts': 'export default { eslint: { strict: true } };\n' });

      expect((await loadSection(eslintSection, { cwd: both }))?.value).toEqual({ strict: true });
    });

    it.each(['.mts', '.cts'])('reads the unified file and a standalone file with the extension %s', async (extension) => {
      const unifiedProject = makeProject({ [`exadev.config${extension}`]: unified() });
      const standaloneProject = makeProject({ [`exadev.toolA.config${extension}`]: `export default ${SECTION};\n` });

      expect(await loadSection(toolA, { cwd: unifiedProject })).toEqual({ value: { include: ['src'], level: 'low' }, shape: 'unified', file: join(unifiedProject, `exadev.config${extension}`) });
      expect(await loadSection(toolA, { cwd: standaloneProject })).toEqual({
        value: { include: ['src'], level: 'low' },
        shape: 'standalone',
        file: join(standaloneProject, `exadev.toolA.config${extension}`),
      });
    });

    it('fails when the unified file exists under two extensions, naming both', async () => {
      const cwd = makeProject({ 'exadev.config.ts': unified(), 'exadev.config.mts': unified() });

      await expect(loadSection(toolA, { cwd })).rejects.toThrow(
        new Error(`exadev.config exists under more than one extension (${join(cwd, 'exadev.config.ts')}, ${join(cwd, 'exadev.config.mts')}); keep exactly one`),
      );
    });

    it('fails when a standalone file exists under two extensions, naming both', async () => {
      const cwd = makeProject({ 'exadev.toolA.config.ts': `export default ${SECTION};\n`, 'exadev.toolA.config.cts': `export default ${SECTION};\n` });

      await expect(loadSection(toolA, { cwd })).rejects.toThrow(
        new Error(`exadev.toolA.config exists under more than one extension (${join(cwd, 'exadev.toolA.config.ts')}, ${join(cwd, 'exadev.toolA.config.cts')}); keep exactly one`),
      );
    });

    it('fails when the section is defined in files of different extensions', async () => {
      const cwd = makeProject({ 'exadev.config.mts': unified(), 'exadev.toolA.config.cts': `export default ${SECTION};\n` });

      await expect(loadSection(toolA, { cwd })).rejects.toThrow(new Error(`section 'toolA' is defined in both ${join(cwd, 'exadev.config.mts')} (directly or through extends) and ${join(cwd, 'exadev.toolA.config.cts')}; keep exactly one`));
    });
  });

  describe('validation', () => {
    it('rejects an invalid section in the unified file with the file and the path of every problem', async () => {
      const cwd = makeProject({ 'exadev.config.ts': unified("{ include: 'src', bogus: 1 }") });
      const failure: unknown = await loadSection(toolA, { cwd }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConfigValidationError);
      expect(failure).toHaveProperty('message', expect.stringContaining(`invalid 'toolA' section in ${join(cwd, 'exadev.config.ts')}:`));
      expect(failure).toHaveProperty('issues', expect.arrayContaining([expect.objectContaining({ path: ['include'] }), expect.objectContaining({ path: [] })]));
    });

    it('rejects an invalid standalone section with the standalone file', async () => {
      const cwd = makeProject({ 'exadev.toolA.config.ts': "export default { include: 1 };\n" });

      await expect(loadSection(toolA, { cwd })).rejects.toThrow(`invalid 'toolA' section in ${join(cwd, 'exadev.toolA.config.ts')}:`);
    });

    it('rejects a unified file that does not export an object', async () => {
      for (const value of ['5', "'text'", '[]']) {
        const cwd = makeProject({ 'exadev.config.ts': `export default ${value};\n` });

        await expect(loadSection(toolA, { cwd })).rejects.toThrow(new TypeError(`${join(cwd, 'exadev.config.ts')}: the default export must be an object`));
      }
    });

    it('validates through a Standard Schema that is not zod', async () => {
      const cwd = makeProject({ 'exadev.config.ts': "export default { layout: { groups: [{ name: 'core' }, { name: 'core' }] } };\n" });

      await expect(loadSection(layoutSection, { cwd })).rejects.toThrow("groups.1.name: the group name is declared more than once");
    });
  });

  describe('layout', () => {
    it('loads the shared layout section from either file', async () => {
      const layout = "{ groups: [{ name: 'core', rank: 0 }], naming: { scope: '@acme' } }";
      const expected = { groups: [{ name: 'core', rank: 0 }], naming: { scope: '@acme' } };

      expect((await loadSection(layoutSection, { cwd: makeProject({ 'exadev.config.ts': `export default { layout: ${layout} };\n` }) }))?.value).toEqual(expected);
      expect((await loadSection(layoutSection, { cwd: makeProject({ 'exadev.layout.config.ts': `export default ${layout};\n` }) }))?.value).toEqual(expected);
    });
  });

  describe('extends', () => {
    it('merges a preset into the unified file, so a preset can supply a section', async () => {
      const cwd = makeProject({
        'preset.ts': "export default { toolA: { include: ['preset'], level: 'high' } };\n",
        'exadev.config.ts': "export default { extends: './preset.ts', toolA: { include: ['local'] } };\n",
      });

      expect((await loadSection(toolA, { cwd }))?.value).toEqual({ include: ['local'], level: 'high' });
    });

    it('says a section a preset supplies was read from the unified file that extends it', async () => {
      const cwd = makeProject({
        'presets/team.ts': `export default { toolA: ${SECTION} };\n`,
        'exadev.config.ts': "export default { extends: './presets/team.ts' };\n",
      });

      expect(await loadSection(toolA, { cwd })).toMatchObject({ shape: 'unified', file: join(cwd, 'exadev.config.ts') });
    });

    it('applies extends inside a standalone file', async () => {
      const cwd = makeProject({
        'base.ts': "export default { include: ['base'], level: 'high' };\n",
        'exadev.toolA.config.ts': "export default { extends: './base.ts', level: 'low' };\n",
      });

      expect((await loadSection(toolA, { cwd }))?.value).toEqual({ include: ['base'], level: 'low' });
    });

    it('refuses a package preset by default and admits it when trust allows it', async () => {
      const files = {
        'node_modules/shared/package.json': JSON.stringify({ name: 'shared', type: 'module', main: 'index.js' }),
        'node_modules/shared/index.js': "export default { toolA: { include: ['shared'] } };\n",
        'exadev.config.ts': "export default { extends: 'shared' };\n",
      };

      await expect(loadSection(toolA, { cwd: makeProject(files) })).rejects.toThrow(/refusing to load untrusted preset 'shared'/);
      expect((await loadSection(toolA, { cwd: makeProject(files), trust: ({ ref }) => ref === 'shared' }))?.value).toEqual({ include: ['shared'], level: 'low' });
    });

    describe('merge per file shape', () => {
      const unifiedChain = {
        'presets/team.ts': "export default { toolA: { include: ['preset'], level: 'high' } };\n",
        'exadev.config.ts': "export default { extends: './presets/team.ts', toolA: { include: ['local'] } };\n",
      };
      const standaloneChain = {
        'presets/team.ts': "export default { include: ['preset'], level: 'high' };\n",
        'exadev.toolA.config.ts': "export default { extends: './presets/team.ts', include: ['local'] };\n",
      };
      const expected = { include: ['preset', 'local'], level: 'high' };

      it('applies the unified merge to the unified file and the standalone merge to a standalone file', async () => {
        const options = { unified: { merge: unionUnified }, standalone: { merge: unionSection } };

        expect(await loadSection(toolA, { cwd: makeProject(unifiedChain), ...options })).toMatchObject({ value: expected, shape: 'unified' });
        expect(await loadSection(toolA, { cwd: makeProject(standaloneChain), ...options })).toMatchObject({ value: expected, shape: 'standalone' });
      });

      it('leaves the other file shape on the default merge, where a later list replaces an earlier one', async () => {
        expect((await loadSection(toolA, { cwd: makeProject(standaloneChain), unified: { merge: unionUnified } }))?.value).toEqual({ include: ['local'], level: 'high' });
        expect((await loadSection(toolA, { cwd: makeProject(unifiedChain), standalone: { merge: unionSection } }))?.value).toEqual({ include: ['local'], level: 'high' });
      });
    });

    it('combines the layers of the unified file with the merge it is given', async () => {
      const cwd = makeProject({
        'preset.ts': "export default { toolA: { include: ['preset'] } };\n",
        'exadev.config.ts': "export default { extends: './preset.ts', toolA: { include: ['local'] } };\n",
      });
      const merge: Merge = (base, override) => {
        if (isArray(base) && isArray(override)) {
          return [...new Set([...base, ...override])];
        }
        if (isRecord(base) && isRecord(override)) {
          const keys = new Set([...Object.keys(base), ...Object.keys(override)]);

          return Object.fromEntries([...keys].map((key) => [key, key in override ? merge(base[key], override[key]) : base[key]]));
        }

        return override ?? base;
      };

      expect((await loadSection(toolA, { cwd, unified: { merge } }))?.value).toEqual({ include: ['preset', 'local'], level: 'low' });
    });

    it('passes cosmiconfig-extends only the options it declares, so an undeclared one changes nothing', async () => {
      const cwd = makeProject({
        'preset.ts': "export default { toolA: { include: ['preset'], level: 'high' } };\n",
        'exadev.config.ts': "export default { inherits: './preset.ts', toolA: { include: ['local'] } };\n",
      });
      // Not an object literal, so the excess property is not a compile error: the shape a caller reaches with a wider options object.
      const options = { cwd, extendsKey: 'inherits', unified: { merge: deepMerge, extendsKey: 'inherits' } };

      expect((await loadSection(toolA, options))?.value).toEqual({ include: ['local'], level: 'low' });
    });

    it('passes the fsCache it is given to jiti, which writes its transpile cache there', async () => {
      const cwd = makeProject({ 'exadev.config.ts': unified() });
      const fsCache = join(cwd, 'transpile-cache');

      expect((await loadSection(toolA, { cwd, fsCache }))?.value).toEqual({ include: ['src'], level: 'low' });
      expect(readdirSync(fsCache)).not.toHaveLength(0);
    });

    describe('presetSchema per file shape', () => {
      const perShape = { unified: { presetSchema: unifiedPreset }, standalone: { presetSchema: standalonePreset } };
      const invalidPreset = {
        'preset.ts': "export default { toolA: { include: ['preset'], bogus: true } };\n",
        'exadev.config.ts': "export default { extends: './preset.ts', toolA: { level: 'high' } };\n",
      };
      const invalidStandalonePreset = {
        'base.ts': "export default { include: ['base'], bogus: true };\n",
        'exadev.toolA.config.ts': "export default { extends: './base.ts' };\n",
      };

      it('rejects a preset of the unified file that fails the unified schema, naming the preset file as the extends value spells it', async () => {
        const cwd = makeProject(invalidPreset);
        const failure: unknown = await loadSection(toolA, { cwd, ...perShape }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ConfigValidationError);
        expect(failure).toHaveProperty('message', expect.stringMatching(/^invalid preset '\.\/preset\.ts':\n/));
        expect(failure).toHaveProperty('issues', [{ path: ['toolA'], message: 'Unrecognized key: "bogus"' }]);
      });

      it('names the preset that fails it at any depth, by the reference the file extending it wrote', async () => {
        const cwd = makeProject({
          'presets/base.ts': "export default { toolA: { bogus: true } };\n",
          'presets/team.ts': "export default { extends: './base.ts', toolA: { include: ['team'] } };\n",
          'exadev.config.ts': "export default { extends: './presets/team.ts' };\n",
        });

        await expect(loadSection(toolA, { cwd, ...perShape })).rejects.toThrow(/^invalid preset '\.\/base\.ts':\n/);
      });

      it('rejects a preset of a standalone file that fails the standalone schema, naming the preset', async () => {
        const cwd = makeProject(invalidStandalonePreset);

        const failure: unknown = await loadSection(toolA, { cwd, ...perShape }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ConfigValidationError);
        expect(failure).toHaveProperty('message', expect.stringMatching(/^invalid preset '\.\/base\.ts':\n/));
        expect(failure).toHaveProperty('issues', [{ path: [], message: 'Unrecognized key: "bogus"' }]);
      });

      it('loads valid preset chains of both shapes, each checked only by the schema of its own shape', async () => {
        const unifiedProject = makeProject({
          'preset.ts': "export default { toolA: { include: ['preset'], level: 'high' } };\n",
          'exadev.config.ts': "export default { extends: './preset.ts', toolA: { include: ['local'] } };\n",
        });
        const standaloneProject = makeProject({
          'base.ts': "export default { include: ['base'], level: 'high' };\n",
          'exadev.toolA.config.ts': "export default { extends: './base.ts', include: ['local'] };\n",
        });

        expect((await loadSection(toolA, { cwd: unifiedProject, ...perShape }))?.value).toEqual({ include: ['local'], level: 'high' });
        expect((await loadSection(toolA, { cwd: standaloneProject, ...perShape }))?.value).toEqual({ include: ['local'], level: 'high' });
      });

      it('leaves the presets of the other file shape unvalidated', async () => {
        const standaloneProject = makeProject(invalidStandalonePreset);
        const unifiedProject = makeProject(invalidPreset);

        await expect(loadSection(toolA, { cwd: standaloneProject, unified: { presetSchema: standalonePreset } })).rejects.toThrow(
          new RegExp(`^invalid 'toolA' section in ${escapeRegExp(join(standaloneProject, 'exadev.toolA.config.ts'))}:\\n`),
        );
        await expect(loadSection(toolA, { cwd: unifiedProject, standalone: { presetSchema: unifiedPreset } })).rejects.toThrow(
          new RegExp(`^invalid 'toolA' section in ${escapeRegExp(join(unifiedProject, 'exadev.config.ts'))}:\\n`),
        );
      });

      it('merges the output of a preset that passes it in place of the preset', async () => {
        const cwd = makeProject({
          'preset.ts': "export default { toolA: { include: ['preset'], level: 'high' } };\n",
          'exadev.config.ts': "export default { extends: './preset.ts', toolA: { include: ['local'] } };\n",
        });
        const lowered = z.looseObject({ extends: z.unknown().optional(), toolA: toolALayer.transform((layer) => ({ ...layer, level: 'low' })).optional() });

        expect((await loadSection(toolA, { cwd, unified: { presetSchema: lowered } }))?.value).toEqual({ include: ['local'], level: 'low' });
      });

      it('does not validate the config file itself, whose section the section schema checks', async () => {
        const cwd = makeProject({ 'exadev.config.ts': unified("{ include: ['src'], bogus: true }") });

        await expect(loadSection(toolA, { cwd, ...perShape })).rejects.toThrow(`invalid 'toolA' section in ${join(cwd, 'exadev.config.ts')}:`);
      });

      it('leaves presets unvalidated when absent, so a bad preset is reported as the section of the file that extends it', async () => {
        const cwd = makeProject(invalidPreset);

        const failure: unknown = await loadSection(toolA, { cwd }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ConfigValidationError);
        expect(failure).toHaveProperty('message', expect.stringMatching(new RegExp(`^invalid 'toolA' section in ${escapeRegExp(join(cwd, 'exadev.config.ts'))}:\\n`)));
        expect(failure).toHaveProperty('issues', [{ path: [], message: 'Unrecognized key: "bogus"' }]);
      });
    });
  });

  describe('authoring files', () => {
    it('loads a file that imports @exadev/config through the alias, as an authoring file does', async () => {
      const cwd = makeProject({
        // A stand-in that does not evaluate this package's source a second time: coverage would attribute that copy to the same files and hide the lines the tests do cover. The test is about where the import resolves to.
        'shim/index.ts': ['export const layoutSection = { name: \'layout\', schema: {} };', 'export const withSections = () => (config: unknown) => config;', ''].join('\n'),
        'node_modules/@acme/tool-a/index.js': "export const toolA = { name: 'toolA', schema: {} };\n",
        'node_modules/@acme/tool-a/package.json': JSON.stringify({ name: '@acme/tool-a', type: 'module', main: 'index.js' }),
        'exadev.config.ts': [
          "import { toolA } from '@acme/tool-a';",
          "import { layoutSection, withSections } from '@exadev/config';",
          '',
          'export default withSections(toolA, layoutSection)({',
          "  toolA: { include: ['src'] },",
          "  layout: { groups: [{ name: 'core' }] },",
          '});',
          '',
        ].join('\n'),
      });
      const options = { cwd, alias: { '@exadev/config': join(cwd, 'shim') } };

      expect((await loadSection(toolA, options))?.value).toEqual({ include: ['src'], level: 'low' });
      expect((await loadSection(layoutSection, options))?.value).toEqual({ groups: [{ name: 'core' }] });
    });
  });

  it('reads the files afresh on every call', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified("{ include: ['one'] }") });

    expect((await loadSection(toolA, { cwd }))?.value).toHaveProperty('include', ['one']);

    writeProjectFile(cwd, 'exadev.config.ts', unified("{ include: ['two'] }"));

    expect((await loadSection(toolA, { cwd }))?.value).toHaveProperty('include', ['two']);
  });
});
