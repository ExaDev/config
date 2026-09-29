import { defineSection, type Section, withSections } from '../../../../src/index';
import { toolA, toolAConfigSchema } from '../tool-a';

const wide: Section<string, typeof toolAConfigSchema> = defineSection('wideTool', toolAConfigSchema);

export const config = withSections(toolA, wide)({
  toolA: { include: ['src'] },
  toola: { include: ['src'] },
});
