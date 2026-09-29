import { layoutSection, withSections } from '../../../../src/index';

export const config = withSections(layoutSection)({
  layout: { groups: [], rankskip: { maxDistance: 1, exemptRanks: [] } },
});
