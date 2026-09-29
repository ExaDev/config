import { withSections } from '../../../../src/index';
import { toolA } from '../tool-a';
import { toolB } from '../tool-b';

export const config = withSections(toolA, toolB)({
  extends: ['./preset.ts'],
  toolA: { include: ['src'], level: 'high' },
  toolB: { rules: { x: 'warn' } },
});
