import { defineSection, type Section, withSections } from '../../../../src/index';
import { toolA, toolAConfigSchema } from '../tool-a';

const bare: Section = defineSection('bareTool', toolAConfigSchema);

export const config = withSections(toolA, bare)({
  toolA: { include: ['src'] },
});
