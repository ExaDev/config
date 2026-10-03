export { ConfigValidationError, type ConfigValidationIssue, type Merge } from 'cosmiconfig-extends';
export { CONFIG_EXTENSIONS, configFileNames, type ConfigFileOptions, type ConfigFileShape, findConfigFiles, type LayerOptions } from './config-file';
export { type CheckedDoctorReport, doctor, type DoctorOptions, type DoctorReport, MANIFEST_FIELD, type UncheckedDoctorReport } from './doctor';
export {
  type GroupSpec,
  type LayoutConfig,
  layoutSchema,
  layoutSection,
  type NamingOptions,
  type NamingStrategy,
  type RankRule,
  type RankSkipOptions,
  type SliceByNamePrefix,
  type SliceBySegment,
  type SliceSpec,
} from './layout';
export { type LoadedSection, loadSection, type LoadSectionOptions } from './load-section';
export { type Config, type ConfigOf, defineConfig, defineSection, type Envelope, type Section, type SectionMap, type SectionsOf, withSections } from './section';
