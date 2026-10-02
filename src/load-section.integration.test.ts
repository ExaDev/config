import { join } from 'node:path';

import { ConfigValidationError, type Merge } from 'cosmiconfig-extends';
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

const SECTION = "{ include: ['src'] }";

function unified(section: string = SECTION): string {
  return `export default { toolA: ${section}, other: { anything: true } };\n`;
}

describe('loadSection', () => {
  it('reads a section from the unified file', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified() });

    expect(await loadSection(toolA, { cwd })).toEqual({ include: ['src'], level: 'low' });
  });

  it('reads a section from its standalone file', async () => {
    const cwd = makeProject({ 'exadev.toolA.config.ts': `export default ${SECTION};\n` });

    expect(await loadSection(toolA, { cwd })).toEqual({ include: ['src'], level: 'low' });
  });

  it('produces the same section from the unified file and from the standalone file', async () => {
    const fromUnified = await loadSection(toolA, { cwd: makeProject({ 'exadev.config.ts': unified("{ include: ['a', 'b'], level: 'high' }") }) });
    const fromStandalone = await loadSection(toolA, { cwd: makeProject({ 'exadev.toolA.config.ts': "export default { include: ['a', 'b'], level: 'high' };\n" }) });

    expect(fromUnified).toEqual({ include: ['a', 'b'], level: 'high' });
    expect(fromStandalone).toEqual(fromUnified);
  });

  it('ignores the sections of other tools in the unified file, and their standalone files', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified(), 'exadev.other.config.ts': 'export default 1;\n' });

    expect(await loadSection(toolA, { cwd })).toEqual({ include: ['src'], level: 'low' });
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

    expect(await loadSection(toolA, { cwd })).toEqual({ include: ['src'], level: 'low' });
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

    expect(await loadSection(toolA, { cwd })).toHaveProperty('level', 'low');
  });

  describe('file names', () => {
    const eslintSection = defineSection('eslint', z.strictObject({ strict: z.boolean() }));

    it('does not read the native config file of a tool that shares the section name', async () => {
      const native = makeProject({ 'eslint.config.ts': 'export default [{ rules: {} }];\n', 'vitest.config.ts': 'export default {};\n' });

      expect(await loadSection(eslintSection, { cwd: native })).toBeUndefined();

      const both = makeProject({ 'eslint.config.ts': 'export default [{ rules: {} }];\n', 'exadev.config.ts': 'export default { eslint: { strict: true } };\n' });

      expect(await loadSection(eslintSection, { cwd: both })).toEqual({ strict: true });
    });

    it.each(['.mts', '.cts'])('reads the unified file and a standalone file with the extension %s', async (extension) => {
      const unifiedProject = makeProject({ [`exadev.config${extension}`]: unified() });
      const standaloneProject = makeProject({ [`exadev.toolA.config${extension}`]: `export default ${SECTION};\n` });

      expect(await loadSection(toolA, { cwd: unifiedProject })).toEqual({ include: ['src'], level: 'low' });
      expect(await loadSection(toolA, { cwd: standaloneProject })).toEqual({ include: ['src'], level: 'low' });
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

      expect(await loadSection(layoutSection, { cwd: makeProject({ 'exadev.config.ts': `export default { layout: ${layout} };\n` }) })).toEqual(expected);
      expect(await loadSection(layoutSection, { cwd: makeProject({ 'exadev.layout.config.ts': `export default ${layout};\n` }) })).toEqual(expected);
    });
  });

  describe('extends', () => {
    it('merges a preset into the unified file, so a preset can supply a section', async () => {
      const cwd = makeProject({
        'preset.ts': "export default { toolA: { include: ['preset'], level: 'high' } };\n",
        'exadev.config.ts': "export default { extends: './preset.ts', toolA: { include: ['local'] } };\n",
      });

      expect(await loadSection(toolA, { cwd })).toEqual({ include: ['local'], level: 'high' });
    });

    it('applies extends inside a standalone file', async () => {
      const cwd = makeProject({
        'base.ts': "export default { include: ['base'], level: 'high' };\n",
        'exadev.toolA.config.ts': "export default { extends: './base.ts', level: 'low' };\n",
      });

      expect(await loadSection(toolA, { cwd })).toEqual({ include: ['base'], level: 'low' });
    });

    it('refuses a package preset by default and admits it when trust allows it', async () => {
      const files = {
        'node_modules/shared/package.json': JSON.stringify({ name: 'shared', type: 'module', main: 'index.js' }),
        'node_modules/shared/index.js': "export default { toolA: { include: ['shared'] } };\n",
        'exadev.config.ts': "export default { extends: 'shared' };\n",
      };

      await expect(loadSection(toolA, { cwd: makeProject(files) })).rejects.toThrow(/refusing to load untrusted preset 'shared'/);
      expect(await loadSection(toolA, { cwd: makeProject(files), trust: ({ ref }) => ref === 'shared' })).toEqual({ include: ['shared'], level: 'low' });
    });

    it('combines layers with the merge it is given', async () => {
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

      expect(await loadSection(toolA, { cwd, merge })).toEqual({ include: ['preset', 'local'], level: 'low' });
    });

    it('passes cosmiconfig-extends only the options it declares, so an undeclared one changes nothing', async () => {
      const cwd = makeProject({
        'preset.ts': "export default { toolA: { include: ['preset'], level: 'high' } };\n",
        'exadev.config.ts': "export default { inherits: './preset.ts', toolA: { include: ['local'] } };\n",
      });
      // Not an object literal, so the excess property is not a compile error: the shape a caller reaches with a wider options object.
      const options = { cwd, extendsKey: 'inherits' };

      expect(await loadSection(toolA, options)).toEqual({ include: ['local'], level: 'low' });
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

      expect(await loadSection(toolA, options)).toEqual({ include: ['src'], level: 'low' });
      expect(await loadSection(layoutSection, options)).toEqual({ groups: [{ name: 'core' }] });
    });
  });

  it('reads the files afresh on every call', async () => {
    const cwd = makeProject({ 'exadev.config.ts': unified("{ include: ['one'] }") });

    expect(await loadSection(toolA, { cwd })).toHaveProperty('include', ['one']);

    writeProjectFile(cwd, 'exadev.config.ts', unified("{ include: ['two'] }"));

    expect(await loadSection(toolA, { cwd })).toHaveProperty('include', ['two']);
  });
});
