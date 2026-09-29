import { defineSection } from '../../../../src/index';
import { toolAConfigSchema } from '../tool-a';

declare const either: 'good' | 'not good';

export const bad = defineSection(either, toolAConfigSchema);
