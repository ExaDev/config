# @exadev/config

The unified `exadev.config.ts`. Each ExaDev tool contributes a typed, schema-validated section to one config file, or reads the same section from a standalone `<tool>.config.ts`, and this package imports no tool to make that work. It builds on [cosmiconfig-extends](https://github.com/ExaDev/cosmiconfig-extends), so a config file is TypeScript evaluated through jiti and can `extends` presets, under that package's trust policy.

## Getting started

```sh
pnpm add @exadev/config cosmiconfig
```

`cosmiconfig` is a peer dependency (`^9.0.0 || ^10.0.0`). The package supports Node 20 and later; cosmiconfig 10 itself declares Node `^22.18 || >=24`, so a consumer on an older Node sees an engines warning from cosmiconfig, not from this package. The package replaces the only part of cosmiconfig 10 that depends on that Node version, its `.ts` loading.

## Authoring a config

Each tool package exports the section it owns. The authoring file passes the sections it uses to `withSections`, which returns a `defineConfig` typed for exactly those sections:

```ts
// exadev.config.ts
import { layoutSection, withSections } from '@exadev/config';
import { myTool } from 'my-tool';

export default withSections(layoutSection, myTool)({
  layout: {
    groups: [
      { name: 'core', rank: 0 },
      { name: 'features', rank: 1, slice: { segment: 0 } },
    ],
  },
  myTool: { include: ['src'] },
});
```

A section is accepted exactly when its descriptor is passed, so the type system reports the mistakes a config file is likely to contain:

- A key or value the section's schema does not allow is an error on that key, with a near-miss suggestion for a misspelt one.
- A section whose tool is installed but not passed to `withSections` is an unknown-property error on its key.
- A section whose tool is not installed is a module-not-found error on the import.
- A config that lists no sections accepts none. Without a section an empty mapped type would be `{}`, which TypeScript does not check for excess properties, so `defineConfig` accepts only the `extends` key and `withSections` needs at least one descriptor.

`extends` names presets, resolved and merged by cosmiconfig-extends. For the unified file a preset is a whole config file, so it can supply any section.

`defineConfig` and the function `withSections` returns hand back their argument untouched. They apply no schema defaults, because `extends` merges what a file exports and a default applied while authoring would look like a value the author wrote and override the presets it extends. Defaults belong to a section's schema, applied when a tool loads it.

### Emitting declarations

Under `isolatedDeclarations` a default export cannot be inferred. Name the value and annotate it with `ConfigOf`:

```ts
import { type ConfigOf, layoutSection, withSections } from '@exadev/config';

const config: ConfigOf<[typeof layoutSection]> = withSections(layoutSection)({ layout: { groups: [] } });

export default config;
```

## Standalone and unified files

A tool reads its section with `loadSection(section, { cwd })`. The section comes from either of two files in `cwd`, and neither is searched for in a parent directory:

- `exadev.config.ts`, under the key `section.name`.
- `<section.name>.config.ts`, whose default export is the section itself.

Both are evaluated with `extends` applied, and both produce the same section for the same content. A section defined in both files throws an error naming both, since choosing one silently would hide a configuration that never takes effect. When neither file defines it the result is `undefined`.

The result is the schema's output, so defaults the schema applies are included. A section that fails its schema throws `ConfigValidationError` from cosmiconfig-extends, naming the file, with one normalised `{ path, message }` entry per problem. A unified file that exports anything but an object throws a `TypeError`, and so does any config file with no default export or a `null` one, since a configuration that never takes effect must not read as an absent file. Only an empty file, or one whose default export is `undefined`, is an empty config.

`loadSection` also takes the options cosmiconfig-extends passes through: `alias` (the directory an authoring import such as `@exadev/config` resolves to, whatever the install layout), `fsCache`, `trust` (which `extends` references may load; local paths only by default) and `merge` (how a file and its presets combine; arrays replace by default).

## Writing a section for a tool

A tool exports a descriptor made from a name and any [Standard Schema](https://standardschema.dev) (zod, valibot, ArkType and others):

```ts
import { defineSection, loadSection, type Section } from '@exadev/config';
import { z } from 'zod';

export interface MyToolConfig {
  include: string[];
  level?: 'low' | 'high';
}

const schema: z.ZodType<MyToolConfig, MyToolConfig> = z.strictObject({
  include: z.array(z.string()),
  level: z.exactOptional(z.enum(['low', 'high'])),
});

export const myTool: Section<'myTool', z.ZodType<MyToolConfig, MyToolConfig>> = defineSection('myTool', schema);

export function loadMyToolConfig(cwd: string): Promise<MyToolConfig | undefined> {
  return loadSection(myTool, { cwd });
}
```

Notes for the tool author:

- The name is both the key in the unified file and the base of the standalone file name, so it starts with a letter and contains only letters, digits, `-` and `_`. `extends` is reserved. `defineSection` throws a `TypeError` otherwise.
- Under `isolatedDeclarations` an exported schema needs a written type. Write the interface by hand and annotate the schema `z.ZodType<Config, Config>` (output first, then input), as above, and use `z.exactOptional` for optional fields under `exactOptionalPropertyTypes`.
- Use `.strict()` schemas (`z.strictObject`) so a misspelt key in a config file fails at load time as well as in the type checker.
- To let `doctor` know which sections an installed package owns, declare them in the package's `package.json`:

  ```json
  { "exadevConfig": { "sections": ["myTool"] } }
  ```

## The layout section

`layoutSection` is the shared `layout` section: the shape of a workspace, so the ESLint architecture rules and the conformance tool read one description. Its fields match `WorkspaceArchitectureOptions` in `@exadev/eslint-config`:

- `root`, `packages` and `dependencyFields` say where packages are and which `package.json` fields count as dependencies.
- `groups` are the top-level directories that group packages. Each has a `name` and optionally a `path`, a `rank`, a `slice` (`{ segment: n }` or `{ namePrefix: true }`) and a `naming` strategy (`drop-group`, `keep-group` or `basename`).
- `nameRanks` and `defaultRank` rank packages by declared name, for a workspace whose layers are roles rather than directories.
- `rankSkip` limits how many ranks below itself a package may depend, with `exemptRanks` reachable from anywhere.
- `isolatedGroups` lists pairs of groups that may not depend on each other in either direction.
- `naming` gives the `scope` and `separator` of the package name convention.

The schema rejects an unknown key at every level and checks the rules that relate one part of the layout to another: group names are unique, a rank pattern compiles as a regular expression, and an isolated pair names two different declared groups. Per-rule policy (allow lists, required files and scripts) is not part of the layout; it belongs to the section of the tool that owns the rule.

## Finding sections nobody reads

A section for a tool that is not installed, or under a misspelt name, is ignored by every tool, and the type system cannot see it from the tool's side. `doctor` reports such sections:

```ts
import { doctor } from '@exadev/config';

const report = await doctor({ cwd: process.cwd(), listed: ['myTool'] });
// report.unowned lists the keys of exadev.config.ts that no installed or listed tool owns.
```

A key is owned when it is `layout`, when a dependency of the project's `package.json` declares it in its `exadevConfig.sections`, or when it appears in `listed`. A dependency is looked for in the `node_modules` directories from `cwd` upwards. The command wraps the same function:

```sh
exadev-config doctor [--cwd <directory>] [--section <name>]...
```

It exits 0 when every section is owned, 1 when some is not, and 2 when it could not run.

## Development

Requires Node 22 or later for the toolchain and pnpm. The published package supports Node 20 and later.

```sh
pnpm install
pnpm lint            # eslint, with --fix
pnpm lint:check      # eslint, check only; what CI runs
pnpm typecheck
pnpm test            # vitest, with coverage
pnpm build           # tsdown: ESM, CJS and declarations
pnpm test:mutation   # Stryker, with a 100% break threshold
```

CI also runs `pnpm exec publint` and `pnpm exec attw --pack` after the build, and installs the packed tarball into a scratch project on each supported Node line and both cosmiconfig majors (`test/package/install-check.sh`), where it loads sections and runs the command as ESM and as CommonJS.

The authoring type checks are tests: `test/types/authoring-types.integration.test.ts` compiles the files in `test/types/fixtures/cases` with the TypeScript compiler API and asserts the exact errors each one produces, so a change that loosens the types fails a test instead of passing silently.

CI selects its runner with `ExaDev/runner-fallback-action` (self-hosted fleet first, Blacksmith as fallback). The release job stays on a GitHub-hosted runner because npm trusted publishing needs one, and publishes with provenance through OIDC, with no stored token.

Commits follow [Conventional Commits](https://www.conventionalcommits.org); semantic-release derives the version from them.
