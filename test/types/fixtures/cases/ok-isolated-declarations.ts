import { type ConfigOf, withSections } from '../../../../src/index';
import { toolA } from '../tool-a';
import { toolB } from '../tool-b';

const config: ConfigOf<[typeof toolA, typeof toolB]> = withSections(toolA, toolB)({
  toolA: { include: ['src'] },
});

export default config;
