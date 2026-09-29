import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeProject } from '../test/support/project';

import { doctor, MANIFEST_FIELD } from './doctor';

function installed(name: string, manifest: Record<string, unknown> = {}): Record<string, string> {
  return { [`node_modules/${name}/package.json`]: JSON.stringify({ name, version: '1.0.0', ...manifest }) };
}

function project(dependencies: Record<string, unknown>, config = 'export default { layout: {} };\n'): Record<string, string> {
  return { 'package.json': JSON.stringify(dependencies), 'exadev.config.ts': config };
}

// The field name is written out, not taken from MANIFEST_FIELD, so that a change to the constant is a change these tests see.
const declares = (...sections: readonly string[]): Record<string, unknown> => ({ exadevConfig: { sections } });

describe('doctor', () => {
  it('reports no config file, not a clean check, for a directory with no unified config, and still lists the built-in section', async () => {
    expect(await doctor({ cwd: makeProject() })).toEqual({ outcome: 'no-config-file', file: undefined, defined: [], unowned: [], known: ['layout'] });
  });

  it('fails when cwd is not an existing directory, instead of reporting a clean one', async () => {
    const missing = join(makeProject(), 'nope');

    await expect(doctor({ cwd: missing })).rejects.toThrow(new Error(`${missing} is not an existing directory`));
  });

  it('reports an empty config, not a clean check, for an empty unified config', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default undefined;\n' });

    expect(await doctor({ cwd })).toEqual({ outcome: 'empty', file: undefined, defined: [], unowned: [], known: ['layout'] });
  });

  it('owns the layout section without any package', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default { layout: {} };\n' });

    expect(await doctor({ cwd })).toEqual({ outcome: 'checked', file: join(cwd, 'exadev.config.ts'), defined: ['layout'], unowned: [], known: ['layout'] });
  });

  it('reports a section no installed or listed tool owns, keeping file order', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default { zed: 1, layout: {}, elint: {}, alpha: 2 };\n' });

    const report = await doctor({ cwd });

    expect(report.defined).toEqual(['zed', 'layout', 'elint', 'alpha']);
    expect(report.unowned).toEqual(['zed', 'elint', 'alpha']);
  });

  it('owns a section declared by an installed dependency', async () => {
    const cwd = makeProject({
      ...project({ dependencies: { 'tool-a': '1.0.0' } }, 'export default { toolA: {}, elint: {} };\n'),
      ...installed('tool-a', declares('toolA', 'toolAExtra')),
    });

    const report = await doctor({ cwd });

    expect(report.unowned).toEqual(['elint']);
    expect(report.known).toEqual(['layout', 'toolA', 'toolAExtra']);
  });

  it.each(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])('reads the tools listed under %s', async (field) => {
    const cwd = makeProject({ ...project({ [field]: { '@acme/tool': '1.0.0' } }, 'export default { tool: {} };\n'), ...installed('@acme/tool', declares('tool')) });

    expect((await doctor({ cwd })).unowned).toEqual([]);
  });

  it('reads the tools listed under every dependency field together', async () => {
    const cwd = makeProject({
      ...project({ dependencies: { a: '1' }, devDependencies: { b: '1' } }, 'export default { a: {}, b: {} };\n'),
      ...installed('a', declares('a')),
      ...installed('b', declares('b')),
    });

    expect((await doctor({ cwd })).unowned).toEqual([]);
  });

  it('finds a dependency installed in a parent directory', async () => {
    const root = makeProject({ ...installed('tool-a', declares('toolA')), 'inner/package.json': JSON.stringify({ dependencies: { 'tool-a': '1' } }), 'inner/exadev.config.ts': 'export default { toolA: {} };\n' });

    expect((await doctor({ cwd: join(root, 'inner') })).unowned).toEqual([]);
  });

  it('reads a manifest that the package exports map hides from a resolver', async () => {
    const cwd = makeProject({
      ...project({ dependencies: { 'tool-a': '1' } }, 'export default { toolA: {} };\n'),
      ...installed('tool-a', { ...declares('toolA'), exports: { '.': './index.js' } }),
    });

    expect((await doctor({ cwd })).unowned).toEqual([]);
  });

  it('ignores a dependency that is not installed and one that declares nothing', async () => {
    const cwd = makeProject({ ...project({ dependencies: { missing: '1', plain: '1' } }, 'export default { x: {} };\n'), ...installed('plain') });

    expect(await doctor({ cwd })).toMatchObject({ unowned: ['x'], known: ['layout'] });
  });

  it('reads the manifest field under the documented name', () => {
    expect(MANIFEST_FIELD).toBe('exadevConfig');
  });

  it.each([
    ['a dependency field that is not an object', { dependencies: ['a'] }, 'dependencies: expected an object'],
    ['a dependency field that is a string', { devDependencies: 'b' }, 'devDependencies: expected an object'],
  ])('rejects a project package.json with %s', async (_name, packageJson, problem) => {
    const cwd = makeProject(project(packageJson));

    await expect(doctor({ cwd })).rejects.toThrow(new TypeError(`the project's package.json is invalid:\n  ${problem}`));
  });

  it('rejects a project package.json that is not an object, and an installed one', async () => {
    await expect(doctor({ cwd: makeProject({ 'package.json': '[]', 'exadev.config.ts': 'export default {};\n' }) })).rejects.toThrow(
      new TypeError("the project's package.json is invalid:\n  (root): expected an object"),
    );
    await expect(doctor({ cwd: makeProject({ ...project({ dependencies: { a: '1' } }), 'node_modules/a/package.json': '[]' }) })).rejects.toThrow(
      new TypeError("the package.json of 'a' is invalid:\n  (root): expected an object"),
    );
  });

  it('does not read the dependency fields of an installed package', async () => {
    const cwd = makeProject({ ...project({ dependencies: { a: '1' } }, 'export default {};\n'), ...installed('a', { dependencies: 'not an object' }) });

    expect((await doctor({ cwd })).known).toEqual(['layout']);
  });

  it('treats a directory with no package.json as having no installed tools', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default { x: {} };\n', ...installed('tool-a', declares('x')) });

    expect((await doctor({ cwd })).unowned).toEqual(['x']);
  });

  it('owns the sections it is told about', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default { a: {}, b: {}, layout: {} };\n' });

    const report = await doctor({ cwd, listed: ['b', 'a', 'layout'] });

    expect(report.unowned).toEqual([]);
    expect(report.known).toEqual(['a', 'b', 'layout']);
  });

  it('counts a section inherited through extends', async () => {
    const cwd = makeProject({ 'preset.ts': 'export default { inherited: {} };\n', 'exadev.config.ts': "export default { extends: './preset.ts', layout: {} };\n" });

    expect(await doctor({ cwd })).toMatchObject({ defined: ['inherited', 'layout'], unowned: ['inherited'] });
  });

  it.each(['.mts', '.cts'])('reads a unified file with the extension %s', async (extension) => {
    const cwd = makeProject({ [`exadev.config${extension}`]: 'export default { elint: {} };\n' });

    expect(await doctor({ cwd })).toMatchObject({ file: join(cwd, `exadev.config${extension}`), unowned: ['elint'] });
  });

  it('rejects a unified file that exists under two extensions', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default {};\n', 'exadev.config.cts': 'export default {};\n' });

    await expect(doctor({ cwd })).rejects.toThrow('exadev.config exists under more than one extension');
  });

  it('rejects a unified file that does not export an object', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default 5;\n' });

    await expect(doctor({ cwd })).rejects.toThrow(TypeError);
  });

  it.each(['export default null;\n', 'export const config = { layout: {} };\n'])('rejects a unified file that exports no configuration: %j', async (content) => {
    await expect(doctor({ cwd: makeProject({ 'exadev.config.ts': content }) })).rejects.toThrow(TypeError);
  });

  it('applies the trust policy it is given to extends', async () => {
    const cwd = makeProject({
      ...installed('shared'),
      'node_modules/shared/index.js': 'export default { fromShared: {} };\n',
      'node_modules/shared/package.json': JSON.stringify({ name: 'shared', type: 'module', main: 'index.js' }),
      'exadev.config.ts': "export default { extends: 'shared' };\n",
    });

    await expect(doctor({ cwd })).rejects.toThrow(/untrusted/);
    expect((await doctor({ cwd, trust: () => true })).defined).toEqual(['fromShared']);
  });

  it('owns a section the project itself declares, as a tool repository does for the section it dogfoods', async () => {
    const cwd = makeProject(project({ name: 'tool-a', ...declares('toolA') }, 'export default { toolA: {}, elint: {} };\n'));

    const report = await doctor({ cwd });

    expect(report.unowned).toEqual(['elint']);
    expect(report.known).toEqual(['layout', 'toolA']);
  });

  it('names the project when its own manifest is malformed', async () => {
    const cwd = makeProject(project({ exadevConfig: {} }));

    await expect(doctor({ cwd })).rejects.toThrow(new TypeError("the project's package.json is invalid:\n  exadevConfig.sections: required"));
  });

  it('ignores a key of the manifest that it does not know, so a later manifest version does not break an older doctor', async () => {
    const cwd = makeProject({
      ...project({ dependencies: { 'tool-a': '1' } }, 'export default { toolA: {} };\n'),
      ...installed('tool-a', { exadevConfig: { sections: ['toolA'], version: 2 } }),
    });

    expect((await doctor({ cwd })).unowned).toEqual([]);
  });

  describe('a malformed manifest', () => {
    it('lists every problem, one to a line', async () => {
      const cwd = makeProject({ ...project({ dependencies: { 'tool-a': '1' } }), ...installed('tool-a', { exadevConfig: { sections: [1, 2] } }) });

      await expect(doctor({ cwd })).rejects.toThrow(new TypeError("the package.json of 'tool-a' is invalid:\n  exadevConfig.sections.0: expected a string\n  exadevConfig.sections.1: expected a string"));
    });

    it.each([
      ['a string', 'sections', ': expected an object'],
      ['no sections key', {}, '.sections: required'],
      ['a non-string section', { sections: ['a', 2] }, '.sections.1: expected a string'],
    ])('with %s is an error naming the package and the problem', async (_name, manifest, problem) => {
      const cwd = makeProject({ ...project({ dependencies: { 'tool-a': '1' } }), ...installed('tool-a', { exadevConfig: manifest }) });

      await expect(doctor({ cwd })).rejects.toThrow(new TypeError(`the package.json of 'tool-a' is invalid:\n  exadevConfig${problem}`));
    });
  });
});
