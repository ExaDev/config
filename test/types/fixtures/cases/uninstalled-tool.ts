import { withSections } from '../../../../src/index';
// The package is not installed, so the import itself reports the error.
import { absent } from '@acme/absent';

export const config = withSections(absent)({});
