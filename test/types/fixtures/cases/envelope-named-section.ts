import { defineSection } from '../../../../src/index';
import { toolAConfigSchema } from '../tool-a';

// The runtime refuses this name too; the compiler refuses it in the tool's own build.
export const reserved = defineSection('extends', toolAConfigSchema);
