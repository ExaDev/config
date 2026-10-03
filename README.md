# @exadev/config

The unified `exadev.config.ts`. Each ExaDev tool contributes a typed, schema-validated section to one config file, or reads the same section from a standalone `exadev.<tool>.config.ts`, and this package imports no tool to make that work. It builds on [cosmiconfig-extends](https://github.com/ExaDev/cosmiconfig-extends), so a config file is TypeScript evaluated through jiti and can `extends` presets, under that package's trust policy.

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

- A key, or a value of a type, that the section's type does not allow is an error on that key, with a near-miss suggestion for a misspelt one. The type is the schema's input type, so a rule the schema enforces only at runtime (an integer minimum, unique names, a valid pattern) passes the type checker and is checked when a tool loads the section.
- A section whose tool is installed but not passed to `withSections` is an unknown-property error on its key.
- A descriptor that could not be told apart in the type (a name that is not a literal, an envelope key such as `extends`, a name listed twice) is refused with a message saying why.
- A section whose tool is not installed is a module-not-found error on the import.
- A config that lists no sections accepts none. Without a section an empty mapped type would be `{}`, which TypeScript does not check for excess properties, so `defineConfig` accepts only the `extends` key and `withSections` needs at least one descriptor.

The unknown-key and misspelt-name errors come from TypeScript's excess-property check, which applies to an object literal passed directly to the function. A config built elsewhere and passed by variable or spread is not checked for extra keys, so `exadev-config doctor` (below) remains the check for a key nobody reads.

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

A tool reads its section with `loadSection(section, { cwd })`. `cwd` must be an existing directory, and a mistyped one throws instead of reading as a directory with no config. The section comes from either of two files in `cwd`, and neither is searched for in a parent directory:

- `exadev.config.ts`, under the key `section.name`.
- `exadev.<section.name>.config.ts`, whose default export is the section itself.

The standalone name is namespaced because the plain `<name>.config.ts` is the native config file of many tools (`eslint.config.ts`, `vitest.config.ts`), so a section called `eslint` would otherwise read the ESLint flat config as its own. Either file may use the extension `.mts` or `.cts` instead of `.ts`; a file that exists under more than one extension throws, since choosing one silently would hide a configuration that never takes effect. Other extensions, and the plain `<name>.config.ts`, are never read.

Both are evaluated with `extends` applied, and both produce the same section for the same content, given layer options that apply the same rules to each shape (below). A section defined in both files (the unified file counts a section a preset supplies) throws an error naming both, since choosing one silently would hide a configuration that never takes effect.

The result is `undefined` when neither file defines the section, and otherwise a `LoadedSection`:

```ts
interface LoadedSection<Value> {
  readonly value: Value; // the schema's output, defaults included
  readonly shape: ConfigFileShape; // 'unified' or 'standalone'
  readonly file: string; // the absolute path of the file it was read from, with its extension
}
```

`shape` and `file` say where the section lives, so a tool that writes the section back, or reports where a value came from, need not hard-code the two file names and three extensions. For a section that a preset of the unified file supplies, `file` is the unified file, not the preset.

`loadSection` returns `undefined` both when neither file exists and when a file exists but does not define the section. A tool that must tell those apart, for example to name the file when evaluating it fails, can ask which files a section can live in without evaluating any:

```ts
import { CONFIG_EXTENSIONS, configFileNames, findConfigFiles } from '@exadev/config';

CONFIG_EXTENSIONS; // ['.ts', '.mts', '.cts'], in the order they are looked up
configFileNames(myTool);
// { unified: ['exadev.config.ts', 'exadev.config.mts', 'exadev.config.cts'], standalone: ['exadev.myTool.config.ts', 'exadev.myTool.config.mts', 'exadev.myTool.config.cts'] }
findConfigFiles(myTool, { cwd });
// { unified: '/path/to/exadev.config.ts', standalone: undefined }
```

`configFileNames` is pure: it returns the candidate names of each shape relative to the config directory, in extension order, for a caller that checks for files through its own file system. `findConfigFiles` looks in `cwd` itself and returns the absolute path of the file of each shape that exists, or `undefined`, reading neither; like `loadSection`, it throws when `cwd` is not an existing directory or a file exists under more than one extension. Both are built from the same names `loadSection` reads, so they cannot disagree with it.

A section that fails its schema throws `ConfigValidationError`, which this package re-exports along with its `ConfigValidationIssue` type so a caller can catch it by class without depending on cosmiconfig-extends, naming the file, with one normalised `{ path, message }` entry per problem. A unified file that exports anything but an object throws a `TypeError`, and so does any config file with no default export or a `null` one, since a configuration that never takes effect must not read as an absent file. Only an empty file, or one whose default export is `undefined`, is an empty config.

`loadSection` also takes the options cosmiconfig-extends passes through for every file: `alias` (the directory an authoring import such as `@exadev/config` resolves to, whatever the install layout), `fsCache` and `trust` (which `extends` references may load; local paths only by default). How a file and its presets are checked and combined depends on the file's shape, so it is given per shape: `unified` applies to the layers of the unified file and `standalone` to the layers of the standalone file, and each is a `LayerOptions` pair of `merge` (how a file and its presets combine; arrays replace by default) and `presetSchema` (a Standard Schema each preset must pass before it is merged; none by default). A shape given no pair uses those defaults. `doctor` takes `alias`, `fsCache`, `trust` and `unified`; it reads only the unified file, so it has no `standalone` pair. No other cosmiconfig-extends option reaches the loader, even on a wider options object.

The two pairs are separate because the two shapes hold different layers. In the unified file each layer is a whole config file, holding the section under its name beside other tools' sections, so the unified `merge` folds whole files and the unified `presetSchema` describes a whole preset file (typically a loose object whose sections are optional layers). In a standalone file each layer is a value of the section itself, with the preset's `extends` key beside its fields, so the standalone `merge` folds section values and the standalone `presetSchema` describes a section layer plus `extends`. A rule written for one shape cannot be applied to the other: the value alone does not say which shape it is, since a misspelt section key looks like another tool's section.

Without a `presetSchema` a preset is only checked as part of the merged section, so an invalid key a preset supplies is reported against the file that extends it. With it, the failing preset throws `ConfigValidationError` with a message beginning `invalid preset '<ref>':`, where `<ref>` is the `extends` value as the file naming the preset wrote it (`./presets/base.ts`, or a package name). The schema's output replaces the preset, so it must keep the `extends` key, and it must apply no defaults, since a default would turn "no opinion" into an override. The config file itself is not a preset; its section is checked by the section's own schema.

```ts
import { loadSection } from '@exadev/config';
import { z } from 'zod';

// mergeMyToolLayers is myTool's own merge rule for its section values, for example that include lists form a union; mergeMyToolFiles applies it to the myTool key of two whole config files. Both are a Merge, (base: unknown, override: unknown) => unknown, a type this package re-exports.
import { mergeMyToolFiles, mergeMyToolLayers } from './merge';

// A layer of myTool: what a preset may supply, every field optional and no defaults.
const myToolLayer = z.strictObject({ include: z.array(z.string()).optional(), level: z.enum(['low', 'high']).optional() });

const loaded = await loadSection(myTool, {
  cwd,
  unified: {
    merge: mergeMyToolFiles,
    presetSchema: z.looseObject({ extends: z.unknown().optional(), myTool: myToolLayer.optional() }),
  },
  standalone: {
    merge: mergeMyToolLayers,
    presetSchema: myToolLayer.extend({ extends: z.unknown().optional() }),
  },
});
```

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

export async function loadMyToolConfig(cwd: string): Promise<MyToolConfig | undefined> {
  return (await loadSection(myTool, { cwd }))?.value;
}
```

Notes for the tool author:

- The name is both the key in the unified file and the base of the standalone file name, so it starts with a letter and contains only letters (`A-Z`, `a-z`), digits, `-` and `_`. `extends` is reserved. A literal name that breaks the rule (`'1 bad name'`, `'Foo Bar'`, `'a_b.c'`, `''`) is a compile error at `defineSection` and at `withSections` whose message quotes the name and the rule, and the type accepts exactly the names the runtime check accepts, both derived from one pair of character-set constants. Two cases are left to the runtime check, which throws a `TypeError`: a name that is not a literal (`string`), and a literal longer than about a thousand characters, which TypeScript cannot check and reports as excessively deep.
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

The schema rejects an unknown key at every level and checks the rules that relate one part of the layout to another: group names are unique, a rank pattern compiles as a regular expression, and an isolated pair names two different declared groups. Messages name the path and the rule and never quote a value from the config. A key written with the value `undefined` is rejected, since the type does not allow it under `exactOptionalPropertyTypes`; `@exadev/eslint-config`'s own reader accepts it. The relational rules run once the shape is valid, so a shape error hides a duplicate group name until it is fixed. Per-rule policy (allow lists, required files and scripts) is not part of the layout; it belongs to the section of the tool that owns the rule.

## Finding sections nobody reads

A section for a tool that is not installed, or under a misspelt name, is ignored by every tool, and the type system cannot see it from the tool's side. `doctor` reports such sections:

```ts
import { doctor } from '@exadev/config';

const report = await doctor({ cwd: process.cwd(), listed: ['myTool'] });
// report.unowned lists the keys of exadev.config.ts that no installed or listed tool owns.
// report.outcome is 'checked', 'empty' (the file exists but exports undefined) or 'no-config-file'; the last two mean nothing was checked, so an empty report.unowned is not a clean result.
```

A key is owned when it is `layout`, when a dependency of the project's `package.json` declares it in its `exadevConfig.sections`, or when the project's own `package.json` declares it (a tool repository dogfooding its section), or when it appears in `listed`. Keys of `exadevConfig` other than `sections` are ignored, so a later manifest version does not break an older `doctor`. A dependency is looked for in the `node_modules` directories from `cwd` upwards. The command wraps the same function:

```sh
exadev-config doctor [--cwd <directory>] [--section <name>]... [--require-config]
```

| Exit code | Meaning |
| --- | --- |
| 0 | Every section is owned. Also the result when nothing was checked: the command then says so, either that no exadev config file was found in the directory or that the file is empty. |
| 1 | Some section is not owned. |
| 2 | The command could not run: a missing command, a `--cwd` that is not a directory, a config that fails to load, or, with `--require-config`, a directory with no exadev config file. |

The directory is not searched upward, so run the command where the file is. `--require-config` turns the no-file case into a failure for a script that must not pass without a config; an empty file still exits 0 with its message. `exadev-config --help` and `exadev-config doctor --help` print the usage.

## Development

Requires Node 22 or later for the toolchain and pnpm. The published package supports Node 20 and later.

```sh
pnpm install
pnpm lint            # eslint, with --fix
pnpm lint:check      # eslint, check only; what CI runs
pnpm typecheck
pnpm test            # vitest, with coverage
pnpm build           # tsdown: ESM, CJS and declarations
pnpm test:mutation   # Stryker, with a 100% break threshold; CI runs it on manual dispatch only
```

CI also runs `pnpm exec publint` and `pnpm exec attw --pack` after the build, and installs the packed tarball into a scratch project on each supported Node line and both cosmiconfig majors (`test/package/install-check.sh`), where it loads sections as ESM and as CommonJS and runs the command from the ESM check.

The authoring type checks are tests: `test/types/authoring-types.integration.test.ts` compiles the files in `test/types/fixtures/cases` with the TypeScript compiler API and asserts the exact errors each one produces, so a change that loosens the types fails a test instead of passing silently.

CI also lints the workflows themselves with [actionlint](https://github.com/rhysd/actionlint) (and the shellcheck it runs on every `run:` script) and [zizmor](https://docs.zizmor.sh), each at a pinned version and configured in `.github/actionlint.yaml` and `.github/zizmor.yml`; both are part of the Required Checks status.

CI selects its runner with `ExaDev/runner-fallback-action` (self-hosted fleet first, Blacksmith as fallback). The release job is the exception: it runs on a GitHub-hosted runner, as described under Releases.

Commits follow [Conventional Commits](https://www.conventionalcommits.org); semantic-release derives the version from them.

## Releases

Every push to `main` runs the Release job in `.github/workflows/ci.yml`, after the commitlint, lint, typecheck and package jobs pass, and [semantic-release](https://semantic-release.gitbook.io) (configured in `release.config.ts`) decides from the Conventional Commits since the last tag whether a release is due. Every commit type the project accepts, `docs` included, triggers at least a patch release, `feat` a minor one and a breaking change a major one. A release publishes to npm, creates a tag and a GitHub Release, and commits `CHANGELOG.md` and `package.json` back to `main` as a `chore(release)` commit.

Publishing uses npm trusted publishing: the job exchanges its GitHub OIDC identity for npm credentials and publishes with provenance, so there is no stored npm token. That is why the job runs on a GitHub-hosted runner and not on the runner the rest of CI selects.

`main` is protected by a ruleset that requires the Required Checks status, an up-to-date branch, linear history, and forbids deletion and non-fast-forward updates. The default `GITHUB_TOKEN` cannot bypass a ruleset, so the release commit and tag are pushed over SSH with a repository deploy key, which the ruleset lists as a bypass actor. `release.config.ts` therefore uses the SSH form of `repositoryUrl`. The key lives in the `RELEASE_DEPLOY_KEY` secret and is written to the runner's temporary directory only for the step that provisions it and the step that runs semantic-release, passed through `GIT_SSH_COMMAND` with GitHub's published host key pinned, and deleted afterwards. It never enters git config, and the actions in the release job are pinned to commit SHAs, but a malicious background process started by an earlier step (the dependency install, for instance) could still read it while it exists.
