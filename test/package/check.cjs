// Runs in the same scratch project as check.mjs and loads sections through the installed package as CommonJS.
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { ConfigValidationError, configFileNames, defineSection, findConfigFiles, layoutSection, loadSection, withSections } = require('@exadev/config');
const { z } = require('zod');

const toolA = defineSection('toolA', z.strictObject({ include: z.array(z.string()) }));

assert.equal(withSections(toolA).length, 1);
assert.equal(typeof ConfigValidationError, 'function');
assert.deepEqual(configFileNames(toolA).unified, ['exadev.config.ts', 'exadev.config.mts', 'exadev.config.cts']);
assert.equal(findConfigFiles(toolA, { cwd: process.cwd() }).unified, join(process.cwd(), 'exadev.config.ts'));
Promise.all([loadSection(layoutSection, { cwd: process.cwd() }), loadSection(toolA, { cwd: process.cwd() })]).then(([layout, section]) => {
  assert.deepEqual(layout.value, { groups: [{ name: 'core', rank: 0 }] });
  assert.deepEqual(section.value, { include: ['src'] });
});
