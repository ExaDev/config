import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { makeProject } from '../test/support/project';

import { type ConfigFileShape, configFileNames, findConfigFiles, loadSection } from './index';
import { defineSection } from './section';

const toolA = defineSection('toolA', z.strictObject({ include: z.array(z.string()) }));

const SECTION = "{ include: ['src'] }";

/**
 * The content of a file of `shape` that defines `toolA`.
 */
function contentOf(shape: ConfigFileShape): string {
  return shape === 'unified' ? `export default { toolA: ${SECTION} };\n` : `export default ${SECTION};\n`;
}

const SHAPES: readonly ConfigFileShape[] = ['unified', 'standalone'];

describe('findConfigFiles', () => {
  it('finds neither file in a directory that has none', () => {
    expect(findConfigFiles(toolA, { cwd: makeProject() })).toEqual({ unified: undefined, standalone: undefined });
  });

  it('finds each shape under each extension, without evaluating it', () => {
    for (const shape of SHAPES) {
      for (const name of configFileNames(toolA)[shape]) {
        // Content that would throw if it were evaluated, so a found file proves the lookup reads no file.
        const cwd = makeProject({ [name]: "throw new Error('evaluated');\n" });

        expect(findConfigFiles(toolA, { cwd })).toEqual({ unified: undefined, standalone: undefined, [shape]: join(cwd, name) });
      }
    }
  });

  it('finds both shapes when both exist, each with its own extension', () => {
    const cwd = makeProject({ 'exadev.config.mts': contentOf('unified'), 'exadev.toolA.config.cts': contentOf('standalone') });

    expect(findConfigFiles(toolA, { cwd })).toEqual({ unified: join(cwd, 'exadev.config.mts'), standalone: join(cwd, 'exadev.toolA.config.cts') });
  });

  it('finds a file with no section in it, which loadSection reads as no section', async () => {
    const cwd = makeProject({ 'exadev.config.ts': 'export default { other: {} };\n' });

    expect(findConfigFiles(toolA, { cwd }).unified).toBe(join(cwd, 'exadev.config.ts'));
    await expect(loadSection(toolA, { cwd })).resolves.toBeUndefined();
  });

  it('ignores a directory, and a file of another extension or name, with a config file name', () => {
    const cwd = makeProject({ 'exadev.config.ts/placeholder': '', 'exadev.toolA.config.js': '', 'toolA.config.ts': '', 'exadev.toolB.config.ts': '' });

    expect(findConfigFiles(toolA, { cwd })).toEqual({ unified: undefined, standalone: undefined });
  });

  it('fails when the unified file exists under more than one extension, naming both', () => {
    const cwd = makeProject({ 'exadev.config.ts': contentOf('unified'), 'exadev.config.cts': contentOf('unified') });

    expect(() => findConfigFiles(toolA, { cwd })).toThrow(
      new Error(`exadev.config exists under more than one extension (${join(cwd, 'exadev.config.ts')}, ${join(cwd, 'exadev.config.cts')}); keep exactly one`),
    );
  });

  it('fails when the standalone file exists under more than one extension, naming both', () => {
    const cwd = makeProject({ 'exadev.toolA.config.mts': contentOf('standalone'), 'exadev.toolA.config.cts': contentOf('standalone') });

    expect(() => findConfigFiles(toolA, { cwd })).toThrow(
      new Error(`exadev.toolA.config exists under more than one extension (${join(cwd, 'exadev.toolA.config.mts')}, ${join(cwd, 'exadev.toolA.config.cts')}); keep exactly one`),
    );
  });

  it('fails when cwd is not an existing directory', () => {
    const cwd = join(makeProject(), 'missing');

    expect(() => findConfigFiles(toolA, { cwd })).toThrow(new Error(`${cwd} is not an existing directory`));
  });
});

describe('the candidate names', () => {
  it('are exactly the files loadSection reads a section from, for each shape', async () => {
    for (const shape of SHAPES) {
      for (const name of configFileNames(toolA)[shape]) {
        const cwd = makeProject({ [name]: contentOf(shape) });

        await expect(loadSection(toolA, { cwd })).resolves.toEqual({ value: { include: ['src'] }, shape, file: join(cwd, name) });
      }
    }
  });

  it('leave out every file loadSection does not read, which findConfigFiles does not find either', async () => {
    const cwd = makeProject({
      'exadev.config.js': contentOf('unified'),
      'exadev.toolA.config.js': contentOf('standalone'),
      'toolA.config.ts': contentOf('standalone'),
    });

    await expect(loadSection(toolA, { cwd })).resolves.toBeUndefined();
    expect(findConfigFiles(toolA, { cwd })).toEqual({ unified: undefined, standalone: undefined });
    expect([...configFileNames(toolA).unified, ...configFileNames(toolA).standalone]).not.toContain('exadev.config.js');
  });
});
