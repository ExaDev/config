import { defineSection } from '../../../../src/index';
import { toolAConfigSchema } from '../tool-a';

export const bad = defineSection('Foo Bar', toolAConfigSchema);
