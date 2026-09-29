import * as validation from 'cosmiconfig-extends';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigValidationError, defineSection, loadSection } from './index';
import { makeProject } from '../test/support/project';

describe('the package entry point', () => {
  it('re-exports the class loadSection throws, so a caller can catch it without depending on cosmiconfig-extends', async () => {
    const section = defineSection('toolA', z.strictObject({ include: z.array(z.string()) }));
    const cwd = makeProject({ 'exadev.config.ts': 'export default { toolA: { include: 1 } };\n' });
    const failure: unknown = await loadSection(section, { cwd }).catch((error: unknown) => error);

    expect(ConfigValidationError).toBe(validation.ConfigValidationError);
    expect(failure).toBeInstanceOf(ConfigValidationError);
  });
});
