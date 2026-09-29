import { layoutSection, withSections } from '../../../../src/index';

export const config = withSections(layoutSection)({
  layout: { defaultRank: 1 },
});
