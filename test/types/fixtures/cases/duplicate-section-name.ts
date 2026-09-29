import { defineSection, withSections } from '../../../../src/index';
import { toolA, toolAConfigSchema } from '../tool-a';

const duplicate = defineSection('toolA', toolAConfigSchema);

export const config = withSections(toolA, duplicate)({
  toolA: { include: ['src'] },
});
