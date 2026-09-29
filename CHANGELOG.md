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
