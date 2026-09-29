import { layoutSection, withSections } from '../../../../src/index';
import { toolA } from '../tool-a';

export const config = withSections(layoutSection, toolA)({
  layout: { groups: [{ name: 'core', rank: 0, slice: { segment: 0 } }], isolatedGroups: [['core', 'features']] },
  toolA: { include: ['src'] },
});
