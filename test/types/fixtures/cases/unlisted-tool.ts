import { withSections } from '../../../../src/index';
import { toolA } from '../tool-a';
import { toolB } from '../tool-b';

// toolB is installed and imported, but not passed to withSections.
export const config = withSections(toolA)({
  toolA: { include: ['src'] },
  toolB: { rules: { x: 'warn' } },
});

export const unused = toolB;
