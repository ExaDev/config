## [2.1.1](https://github.com/ExaDev/config/compare/v2.1.0...v2.1.1) (2026-10-03)

# [2.1.0](https://github.com/ExaDev/config/compare/v2.0.0...v2.1.0) (2026-10-03)


### Features

* expose the config file names and lookup a section is read from ([c4c42b3](https://github.com/ExaDev/config/commit/c4c42b346a0791ad1a9c679dc6aa79deffae5b58))

# [2.0.0](https://github.com/ExaDev/config/compare/v1.2.0...v2.0.0) (2026-10-03)


* feat(load-section)!: take merge and presetSchema per file shape, and report the file read ([0a74f61](https://github.com/ExaDev/config/commit/0a74f619f07c84bab03914df290cfcac94c2c013)), closes [#8](https://github.com/ExaDev/config/issues/8)


### BREAKING CHANGES

* merge and presetSchema are no longer top-level options
of loadSection, doctor or ConfigFileOptions.
Pass them as unified: { merge, presetSchema } for whole config files,
or standalone: { merge, presetSchema } for section values.
loadSection resolves to { value, shape, file } instead of the value;
read .value.

# [1.2.0](https://github.com/ExaDev/config/compare/v1.1.3...v1.2.0) (2026-10-02)


### Bug Fixes

* **config-file:** pass cosmiconfig-extends only the declared loading options ([1d2ebf7](https://github.com/ExaDev/config/commit/1d2ebf727bad10de8977bf1c39bea712f15e5bdc))


### Features

* **config-file:** accept a presetSchema that validates each preset ([e7abff6](https://github.com/ExaDev/config/commit/e7abff6579ab44822c3a6ecc5247b6fc9232a0f8))

## [1.1.3](https://github.com/ExaDev/config/compare/v1.1.2...v1.1.3) (2026-10-02)

## [1.1.2](https://github.com/ExaDev/config/compare/v1.1.1...v1.1.2) (2026-10-02)

## [1.1.1](https://github.com/ExaDev/config/compare/v1.1.0...v1.1.1) (2026-10-02)

# [1.1.0](https://github.com/ExaDev/config/compare/v1.0.0...v1.1.0) (2026-09-30)


### Features

* reject invalid literal section names at compile time ([928298c](https://github.com/ExaDev/config/commit/928298c68bd67b7a6116fc2d59aea663315cdd97))
* report a missing config file in doctor and add --require-config ([f7f1e66](https://github.com/ExaDev/config/commit/f7f1e66a66efa3a8713e043b8baa9462615fb47b))

# 1.0.0 (2026-09-29)


### Bug Fixes

* accept doctor --help, fail on a missing command, and say when there is no config ([29677c1](https://github.com/ExaDev/config/commit/29677c18394c121f928211e943073be0591392bb))
* declare the runtime dependencies as caret ranges ([d851777](https://github.com/ExaDev/config/commit/d851777d06b4247845f0428de580680f24ea4316))
* fail on a config file that exports no default or a null default ([8d98f69](https://github.com/ExaDev/config/commit/8d98f6949be221fa6f632e8b87d11369e3dfd801))
* fail when the directory to read config from does not exist ([a7db03c](https://github.com/ExaDev/config/commit/a7db03c869c042fd3e5f2a3528884cfc5a6c63d2))
* let the project's own manifest own sections and tolerate unknown manifest keys ([f86991f](https://github.com/ExaDev/config/commit/f86991f324e918a5055910834b1c29cc47cb5f7e))
* namespace the standalone file and read .mts and .cts config files ([1d586af](https://github.com/ExaDev/config/commit/1d586af5637f8dfd6fbddf3341878635297f1a28))
* refuse section descriptors that widen or collide at the type level ([347cb3f](https://github.com/ExaDev/config/commit/347cb3f48889e393171cfebac6ad5958d57ea997))
* reject a malformed package.json in doctor instead of ignoring it ([286d179](https://github.com/ExaDev/config/commit/286d179285386f2eda78af2d2ed441ac4d1afd87))


### Features

* add typed section descriptors and the shared layout section ([cce2138](https://github.com/ExaDev/config/commit/cce21388364d63ec347dc238e5d165ae56d4603e))
* re-export ConfigValidationError and ConfigValidationIssue ([f429b10](https://github.com/ExaDev/config/commit/f429b10ba9841e37b857abed46c18c21c9c254d3))
* report config sections that no installed tool owns, with a command ([91b5c9e](https://github.com/ExaDev/config/commit/91b5c9ede84c378affff8f2242a1c0873cf0623b))
* resolve a tool's section from the unified file or a standalone file ([75aa2a1](https://github.com/ExaDev/config/commit/75aa2a18976b9d62e85c9784eeb3b06990fe37ab))
