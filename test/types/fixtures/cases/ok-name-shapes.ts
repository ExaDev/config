import { defineSection, withSections } from '../../../../src/index';
import { toolAConfigSchema } from '../tool-a';

export const upper = defineSection('Z9_-', toolAConfigSchema);
export const hyphenated = defineSection('my-tool', toolAConfigSchema);
export const single = defineSection('a', toolAConfigSchema);
export const config = withSections(upper, hyphenated, single)({ 'my-tool': { include: ['src'] } });
