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

const declares = (...sections: readonly string[]): Record<string, unknown> => ({ [MANIFEST_FIELD]: { sections } });

describe('doctor', () => {
  it('reports nothing for a directory with no unified config, and still lists the built-in section', async () => {
    expect(await doctor({ cwd: makeProject() })).toEqual({ file: undefined, defined: [], unowned: [], known: ['layout'] });
  });

  it('reports nothing for an empty unified config', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default undefined;\n' });

    expect(await doctor({ cwd })).toEqual({ file: undefined, defined: [], unowned: [], known: ['layout'] });
  });

  it('owns the layout section without any package', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default { layout: {} };\n' });

    expect(await doctor({ cwd })).toEqual({ file: join(cwd, 'exadev.config.ts'), defined: ['layout'], unowned: [], known: ['layout'] });
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

  it('ignores a package.json whose dependency fields are not objects, and one that is not an object', async () => {
    expect((await doctor({ cwd: makeProject(project({ dependencies: ['a'], devDependencies: 'b' })) })).known).toEqual(['layout']);
    expect((await doctor({ cwd: makeProject({ 'package.json': '[]', 'exadev.config.ts': 'export default {};\n' }) })).known).toEqual(['layout']);
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

  describe('a malformed manifest', () => {
    it.each([
      ['a string', 'sections', '(root): expected an object'],
      ['no sections key', {}, 'sections: required'],
      ['an unknown key', { sections: [], other: 1 }, 'other: unknown key'],
      ['a non-string section', { sections: ['a', 2] }, 'sections.1: expected a string'],
    ])('with %s is an error naming the package and the problem', async (_name, manifest, problem) => {
      const cwd = makeProject({ ...project({ dependencies: { 'tool-a': '1' } }), ...installed('tool-a', { [MANIFEST_FIELD]: manifest }) });

      await expect(doctor({ cwd })).rejects.toThrow(new TypeError(`invalid '${MANIFEST_FIELD}' in the package.json of 'tool-a':\n  ${problem}`));
    });
  });
});
