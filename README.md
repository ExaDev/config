# config

`@exadev/config` is the unified `exadev.config.ts` for ExaDev tools: each tool contributes a typed, schema-validated section, and the package resolves a tool's section from either the unified file or a standalone `<tool>.config.ts`, without importing any tool.
