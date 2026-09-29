import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * A tool's claim on one top-level key of the unified config: the key's name, and the Standard Schema that owns the shape of its value. The tool exports one; the authoring file passes it to {@link withSections} and the tool passes it to `loadSection`, so name and schema cannot drift apart.
 */
export interface Section<Name extends string = string, Schema extends StandardSchemaV1 = StandardSchemaV1> {
  readonly name: Name;
  readonly schema: Schema;
}

/**
 * The keys every config file may carry regardless of which sections it lists.
 */
export interface Envelope {
  /**
   * Presets to extend, resolved and merged by `cosmiconfig-extends`. For a unified file the presets are whole config files, so a preset can supply any section.
   */
  readonly extends?: string | readonly string[];
}

/**
 * Section name to the value type the authoring file may write for it.
 */
export type SectionMap = Readonly<Record<string, unknown>>;

/**
 * The value an authoring file exports: the {@link Envelope} plus one optional key per listed section.
 *
 * With no sections the mapped part would be `{}`, which TypeScript does not excess-property check, so any key would be accepted. Without sections the type is therefore the envelope alone, and every section key is an unknown-property error.
 */
export type Config<Sections extends SectionMap> = keyof Sections extends never
  ? Envelope
  : Envelope & { readonly [Name in keyof Sections]?: Sections[Name] };

/**
 * The section map for a list of section descriptors: each name to what its schema accepts as input.
 */
export type SectionsOf<Descriptors extends readonly Section[]> = {
  [Descriptor in Descriptors[number] as Descriptor['name']]: StandardSchemaV1.InferInput<Descriptor['schema']>;
};

/**
 * The type of an authoring file's export for a list of section descriptors. Under `isolatedDeclarations` a default export must be a named, annotated value, and this is the annotation: `const config: ConfigOf<[typeof toolA]> = withSections(toolA)({ ... }); export default config;`.
 */
export type ConfigOf<Descriptors extends readonly Section[]> = Config<SectionsOf<Descriptors>>;

/**
 * A type that no value has, used where an argument must be refused: the compiler quotes `Reason` in its error message, so the reason is what the author reads.
 */
export interface Rejected<Reason extends string> {
  readonly rejected: Reason;
}

/**
 * The names of the {@link Envelope} keys, which a section may not take.
 */
export type EnvelopeKey = keyof Envelope;

/**
 * The characters a section name may start with, and (with {@link SECTION_NAME_TAIL_CHARACTERS}) the characters it may continue with. This is the single definition of the allowed character set: the runtime pattern is built from it, and the compile-time check of a literal name is derived from its type.
 */
export const SECTION_NAME_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * The characters a section name may contain after its first letter, besides the letters in {@link SECTION_NAME_LETTERS}. The hyphen is last so that it is literal inside the character class of the runtime pattern.
 */
export const SECTION_NAME_TAIL_CHARACTERS = '0123456789_-';

/**
 * The union of the single characters of `Text`, accumulated so that the recursion is a tail call and the length of the character set is not limited by the nesting depth.
 */
type CharactersOf<Text extends string, Collected extends string = never> = Text extends `${infer First}${infer Rest}` ? CharactersOf<Rest, Collected | First> : Collected;

/**
 * `true` when every character of `Text` is in `Allowed`, including for the empty text. Tail-recursive, so TypeScript evaluates it iteratively up to its limit of 1000 steps; a literal name longer than that is a compile error ("excessively deep") rather than being accepted unchecked.
 */
type AllIn<Text extends string, Allowed extends string> = Text extends `${infer First}${infer Rest}` ? (First extends Allowed ? AllIn<Rest, Allowed> : false) : true;

/**
 * Whether the literal `Name` matches the runtime rule exactly: a letter of {@link SECTION_NAME_LETTERS}, then any number of those letters or characters of {@link SECTION_NAME_TAIL_CHARACTERS}. A union distributes, so the result contains `false` when any member is invalid. The empty name is invalid because it has no first letter.
 */
type IsSectionName<Name extends string> = Name extends `${infer First}${infer Rest}`
  ? First extends CharactersOf<typeof SECTION_NAME_LETTERS>
    ? AllIn<Rest, CharactersOf<typeof SECTION_NAME_LETTERS | typeof SECTION_NAME_TAIL_CHARACTERS>>
    : false
  : false;

/**
 * The members of the literal `Name` (a single name or a union of them) that break the naming rule, or `never` when all follow it.
 */
type BadNames<Name extends string> = Name extends unknown ? (IsSectionName<Name> extends true ? never : Name) : never;

/**
 * What a section name must be besides a string: `unknown` (no further constraint) unless a literal breaks the naming rule, which is reported quoting the offending names, or is an {@link Envelope} key, which a section may not take because the key already means something else. A name that is not a literal (`string`) passes here; the runtime check and {@link Listable} deal with it.
 */
type Nameable<Name extends string> = string extends Name
  ? unknown
  : [BadNames<Name>] extends [never]
    ? [Extract<Name, EnvelopeKey>] extends [never]
      ? unknown
      : Rejected<'a section may not be named after a key of the config envelope'>
    : Rejected<`invalid section name '${BadNames<Name>}': it must start with a letter and contain only letters, digits, '-' and '_'`>;

/**
 * The literal names of every descriptor in `Descriptors` except the one at `Index`. A name that is not a literal is left out, because `string` would otherwise be reported as a duplicate of every other name; it is rejected on its own.
 */
type OtherNames<Descriptors extends readonly Section[], Index extends PropertyKey> = {
  [Position in keyof Descriptors]: Position extends Index ? never : string extends Descriptors[Position]['name'] ? never : Descriptors[Position]['name'];
}[number];

/**
 * `unknown` (no further constraint) unless `Descriptors` is empty. With no sections the mapped part of {@link Config} would be `{}`, so {@link withSections} refuses an empty list.
 */
type NonEmpty<Descriptors extends readonly Section[]> = Descriptors extends readonly [] ? Rejected<'list at least one section, or use defineConfig for a config with none'> : unknown;

/**
 * What an argument of {@link withSections} must be besides a descriptor: `unknown` (no further constraint) when the descriptor can be listed, otherwise a {@link Rejected} that says why not.
 *
 * A name that breaks the naming rule of {@link defineSection}, which only a hand-written descriptor type can carry, is refused with the rule. A name that is not a literal (`string`, from a descriptor annotated with a wide {@link Section} type) would give {@link SectionsOf} a string index signature, which turns off the excess-property check for the whole config. A name that is an {@link Envelope} key, or is shared by two descriptors, would give one key two meanings.
 */
export type Listable<Descriptor extends Section, Descriptors extends readonly Section[], Index extends PropertyKey> = string extends Descriptor['name']
  ? Rejected<'a listed section needs a literal name type: annotate the descriptor as Section<"name", Schema> or leave it inferred'>
  : Descriptor['name'] extends EnvelopeKey
    ? Rejected<'a section may not be named after a key of the config envelope'>
    : [BadNames<Descriptor['name']>] extends [never]
      ? Descriptor['name'] extends OtherNames<Descriptors, Index>
        ? Rejected<'a section name may be listed only once'>
        : unknown
      : Rejected<`invalid section name '${BadNames<Descriptor['name']>}': it must start with a letter and contain only letters, digits, '-' and '_'`>;

const SECTION_NAME = new RegExp(`^[${SECTION_NAME_LETTERS}][${SECTION_NAME_LETTERS}${SECTION_NAME_TAIL_CHARACTERS}]*$`);
const ENVELOPE_KEYS: readonly string[] = ['extends'];

/**
 * Describe a tool's section. `name` is both the key in the unified config and the base of the standalone file name `exadev.<name>.config.ts`, so it must start with a letter and contain only letters, digits, `-` and `_`, and it must not be a key of the {@link Envelope}. A literal name that breaks the rule is a compile error quoting the name; a name that is not a literal, or is longer than TypeScript can check, is checked when the call runs. Throws a `TypeError` otherwise.
 */
export function defineSection<const Name extends string, Schema extends StandardSchemaV1>(
  name: Name & Nameable<Name>,
  schema: Schema,
): Section<Name, Schema> {
  if (!SECTION_NAME.test(name)) {
    throw new TypeError(`invalid section name '${name}': it must start with a letter and contain only letters, digits, '-' and '_'`);
  }
  if (ENVELOPE_KEYS.includes(name)) {
    throw new TypeError(`invalid section name '${name}': it is a key of the config envelope`);
  }

  return { name, schema };
}

/**
 * Bind the sections a config file may contain. The authoring file passes the descriptors its tools export, and gets back a `defineConfig` for exactly those sections:
 *
 * ```ts
 * export default withSections(eslint, layoutSection)({ layout: { groups: [{ name: 'core' }] } });
 * ```
 *
 * A section is accepted when its descriptor is passed, so a tool whose package is not installed is a module-not-found error on its import, and a tool that is installed but not passed is an unknown-property error on its key. At least one descriptor is required, and each name may be listed once: a repeated name throws a `TypeError`.
 */
export function withSections<const Descriptors extends readonly Section[]>(
  ...sections: Descriptors & NonEmpty<Descriptors> & { readonly [Index in keyof Descriptors]: Listable<Descriptors[Index], Descriptors, Index> }
): (config: ConfigOf<Descriptors>) => ConfigOf<Descriptors> {
  const names = new Set<string>();
  for (const { name } of sections) {
    if (names.has(name)) {
      throw new TypeError(`section '${name}' is listed more than once`);
    }
    names.add(name);
  }

  return (config) => config;
}

/**
 * Type-check a config that lists no sections, so only the {@link Envelope} keys are accepted. The value is returned unchanged: schema defaults are never applied while authoring, because `extends` merges what a file exports and a default would look like a value the author wrote.
 */
export function defineConfig(config: Envelope): Envelope {
  return config;
}
