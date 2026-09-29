import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { makeProject } from '../test/support/project';

import { EXIT_CODES, runCommand } from './doctor-command';

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function run(...args: readonly string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCommand(args, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });

  return { code, stdout, stderr };
}

describe('runCommand', () => {
  it.each([[['--help']], [['doctor', '--help']]])('prints the usage and succeeds for %j', async (args) => {
    const { code, stdout, stderr } = await run(...args);

    expect(code).toBe(EXIT_CODES.clean);
    expect(stdout).toContain('Usage: exadev-config doctor [--cwd <directory>] [--section <name>]... [--require-config]');
    expect(stdout).toContain('--require-config');
    expect(stderr).toBe('');
  });

  it('fails on a missing command, printing the usage with the error', async () => {
    const { code, stdout, stderr } = await run();

    expect(code).toBe(EXIT_CODES.failed);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/^missing command\n\nUsage: exadev-config doctor/);
  });

  it('fails on an unknown command, printing the usage with the error', async () => {
    const { code, stdout, stderr } = await run('frobnicate');

    expect(code).toBe(EXIT_CODES.failed);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/^unknown command 'frobnicate'\n\nUsage: exadev-config doctor/);
  });

  describe('doctor', () => {
    it('succeeds silently when every section is owned', async () => {
      const cwd = makeProject({ 'exadev.config.ts': 'export default { layout: {} };\n' });

      expect(await run('doctor', '--cwd', cwd)).toEqual({ code: EXIT_CODES.clean, stdout: '', stderr: '' });
    });

    it('says no exadev config file was found and nothing was checked, and still succeeds, when the directory has none', async () => {
      const cwd = makeProject({});

      expect(await run('doctor', '--cwd', cwd)).toEqual({
        code: EXIT_CODES.clean,
        stdout: `${cwd}: no exadev config file was found in this directory, so nothing was checked. The command does not search parent directories.\n`,
        stderr: '',
      });
    });

    it('says the config file is empty and nothing was checked, and succeeds, even with --require-config', async () => {
      const cwd = makeProject({ 'exadev.config.ts': 'export default undefined;\n' });
      const stdout = `${cwd}: the exadev config file in this directory is empty, so nothing was checked.\n`;

      expect(await run('doctor', '--cwd', cwd)).toEqual({ code: EXIT_CODES.clean, stdout, stderr: '' });
      expect(await run('doctor', '--cwd', cwd, '--require-config')).toEqual({ code: EXIT_CODES.clean, stdout, stderr: '' });
    });

    it('exits with the failure code and writes the same message to stderr under --require-config when the directory has no config file', async () => {
      const cwd = makeProject({});

      expect(await run('doctor', '--cwd', cwd, '--require-config')).toEqual({
        code: EXIT_CODES.failed,
        stdout: '',
        stderr: `${cwd}: no exadev config file was found in this directory, so nothing was checked. The command does not search parent directories.\n`,
      });
    });

    it('does not fail under --require-config when a config file exists', async () => {
      const cwd = makeProject({ 'exadev.config.ts': 'export default { layout: {} };\n' });

      expect(await run('doctor', '--cwd', cwd, '--require-config')).toEqual({ code: EXIT_CODES.clean, stdout: '', stderr: '' });
    });

    it('reports each unowned section on stderr with the known ones, and exits 1', async () => {
      const cwd = makeProject({ 'exadev.config.ts': 'export default { elint: {}, layout: {}, tsc: {} };\n' });
      const file = join(cwd, 'exadev.config.ts');

      expect(await run('doctor', '--cwd', cwd)).toEqual({
        code: EXIT_CODES.unowned,
        stdout: '',
        stderr: [
          `${file}: section 'elint' is not owned by any installed or listed tool. Known sections: layout.`,
          `${file}: section 'tsc' is not owned by any installed or listed tool. Known sections: layout.`,
          '',
        ].join('\n'),
      });
    });

    it('treats sections named by repeated --section as owned', async () => {
      const cwd = makeProject({ 'exadev.config.ts': 'export default { elint: {}, tsc: {} };\n' });

      expect(await run('doctor', '--cwd', cwd, '--section', 'elint', '--section', 'tsc')).toEqual({ code: EXIT_CODES.clean, stdout: '', stderr: '' });
    });

    it('lists a section that was named to it among the known ones', async () => {
      const cwd = makeProject({ 'exadev.config.ts': 'export default { elint: {}, tsc: {} };\n' });

      expect((await run('doctor', '--cwd', cwd, '--section', 'tsc')).stderr).toContain('Known sections: layout, tsc.');
    });

    it('resolves the current directory when --cwd is omitted', async () => {
      const cwd = makeProject({ 'exadev.config.ts': 'export default { elint: {} };\n' });
      const spy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);

      try {
        expect((await run('doctor')).code).toBe(EXIT_CODES.unowned);
      } finally {
        spy.mockRestore();
      }
    });

    it('resolves a relative --cwd against the current directory', async () => {
      const parent = makeProject({ 'child/exadev.config.ts': 'export default { elint: {} };\n' });
      const spy = vi.spyOn(process, 'cwd').mockReturnValue(parent);

      try {
        expect((await run('doctor', '--cwd', 'child')).stderr).toContain(join(parent, 'child', 'exadev.config.ts'));
      } finally {
        spy.mockRestore();
      }
    });

    it.each([[['--nope']], [['stray']], [['--cwd']]])('fails on the invalid arguments %j, reporting why', async (args) => {
      const { code, stdout, stderr } = await run('doctor', ...args);

      expect(code).toBe(EXIT_CODES.failed);
      expect(stdout).toBe('');
      expect(stderr).not.toBe('');
    });

    it('fails, naming the directory, when --cwd is not an existing directory', async () => {
      const missing = join(makeProject(), 'nope-typo');

      expect(await run('doctor', '--cwd', missing)).toEqual({ code: EXIT_CODES.failed, stdout: '', stderr: `${missing} is not an existing directory\n` });
    });

    it('fails, reporting the message, when the config cannot be loaded', async () => {
      const cwd = makeProject({ 'exadev.config.ts': "throw new Error('broken config');\n" });
      const { code, stderr } = await run('doctor', '--cwd', cwd);

      expect(code).toBe(EXIT_CODES.failed);
      expect(stderr).toBe('broken config\n');
    });
  });
});
