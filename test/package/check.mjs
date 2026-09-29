// Runs in a scratch project that has the packed tarball, cosmiconfig and zod installed. It loads sections through the installed package as an ES module.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { defineSection, doctor, layoutSection, loadSection } from '@exadev/config';
import { z } from 'zod';

const toolA = defineSection('toolA', z.strictObject({ include: z.array(z.string()) }));
const cwd = process.cwd();

assert.deepEqual(await loadSection(layoutSection, { cwd }), { groups: [{ name: 'core', rank: 0 }] });
assert.deepEqual(await loadSection(toolA, { cwd }), { include: ['src'] });

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
