// Runs in a scratch project that has the packed tarball, cosmiconfig and zod installed. It loads sections through the installed package as an ES module.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CONFIG_EXTENSIONS, ConfigValidationError, configFileNames, defineSection, doctor, findConfigFiles, layoutSection, loadSection } from '@exadev/config';
import { z } from 'zod';

const toolA = defineSection('toolA', z.strictObject({ include: z.array(z.string()) }));
const cwd = process.cwd();

assert.deepEqual(await loadSection(layoutSection, { cwd }), { value: { groups: [{ name: 'core', rank: 0 }] }, shape: 'unified', file: join(cwd, 'exadev.config.ts') });
assert.deepEqual((await loadSection(toolA, { cwd }))?.value, { include: ['src'] });
assert.deepEqual(CONFIG_EXTENSIONS, ['.ts', '.mts', '.cts']);
assert.deepEqual(configFileNames(toolA).standalone, ['exadev.toolA.config.ts', 'exadev.toolA.config.mts', 'exadev.toolA.config.cts']);
assert.deepEqual(findConfigFiles(toolA, { cwd }), { unified: join(cwd, 'exadev.config.ts'), standalone: undefined });

const report = await doctor({ cwd, listed: ['toolA'] });
assert.deepEqual(report.unowned, ['typo']);

const run = (args) => {
  try {
    execFileSync('node_modules/.bin/exadev-config', args, { stdio: 'pipe' });

    return 0;
  } catch (error) {
    return error.status;
  }
};
assert.equal(run(['doctor', '--section', 'toolA', '--section', 'typo']), 0);
assert.equal(run(['doctor', '--section', 'toolA']), 1);
assert.equal(run(['unknown']), 2);
assert.equal(run([]), 2);
assert.equal(run(['doctor', '--help']), 0);
assert.equal(typeof ConfigValidationError, 'function');
