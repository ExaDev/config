import { withSections } from '../../../../src/index';
import { toolA } from '../tool-a';
import { toolB } from '../tool-b';

export const onlyOne = withSections(toolA, toolB)({ toolB: { rules: {} } });
export const none = withSections(toolA)({});
