import { defineSection } from '../../../../src/index';
import { toolAConfigSchema } from '../tool-a';

export const bad = defineSection('a.b', toolAConfigSchema);
