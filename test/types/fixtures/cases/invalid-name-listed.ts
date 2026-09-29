import { type Section, withSections } from '../../../../src/index';
import { toolA, toolAConfigSchema } from '../tool-a';

declare const bad: Section<'a b', typeof toolAConfigSchema>;

export const config = withSections(toolA, bad)({ toolA: { include: ['src'] } });
