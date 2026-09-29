import { withSections } from '../../../../src/index';
import { toolA } from '../tool-a';

// The pattern the README warns against under isolatedDeclarations: the default export needs a named, annotated value.
export default withSections(toolA)({ toolA: { include: ['src'] } });
