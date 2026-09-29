import { withSections } from '../../../../src/index';
import { toolA } from '../tool-a';

export const config = withSections(toolA)({
  toolA: { include: ['src'], inclde: ['x'] },
});
