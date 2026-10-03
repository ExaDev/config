// Runs in the same scratch project as check.mjs and loads sections through the installed package as CommonJS.
const assert = require('node:assert/strict');
const { ConfigValidationError, defineSection, layoutSection, loadSection, withSections } = require('@exadev/config');
const { z } = require('zod');

const toolA = defineSection('toolA', z.strictObject({ include: z.array(z.string()) }));

assert.equal(withSections(toolA).length, 1);
assert.equal(typeof ConfigValidationError, 'function');
Promise.all([loadSection(layoutSection, { cwd: process.cwd() }), loadSection(toolA, { cwd: process.cwd() })]).then(([layout, section]) => {
  assert.deepEqual(layout.value, { groups: [{ name: 'core', rank: 0 }] });
  assert.deepEqual(section.value, { include: ['src'] });
});
