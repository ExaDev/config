import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { type Config, type ConfigOf, defineConfig, defineSection, type Envelope, type Section, type SectionsOf, withSections } from './section';

interface ToolAConfig {
  include: string[];
  level?: 'low' | 'high';
}

const toolAConfigSchema: z.ZodType<ToolAConfig, ToolAConfig> = z.strictObject({
  include: z.array(z.string()),
  level: z.exactOptional(z.enum(['low', 'high'])),
});

const toolA: Section<'toolA', z.ZodType<ToolAConfig, ToolAConfig>> = defineSection('toolA', toolAConfigSchema);
const toolB = defineSection('toolB', z.strictObject({ rules: z.record(z.string(), z.string()) }));

describe('defineSection', () => {
  it('pairs the name with the schema it was given', () => {
    expect(toolA.name).toBe('toolA');
    expect(toolA.schema).toBe(toolAConfigSchema);
  });

  it('keeps the name as a literal type', () => {
    expectTypeOf(toolA.name).toEqualTypeOf<'toolA'>();
    expectTypeOf(toolB.name).toEqualTypeOf<'toolB'>();
  });

  it.each(['eslint', 'my-tool', 'my_tool', 'A1', 'a', 'a-', 'Z9_-'])('accepts the name %s', (name) => {
    expect(defineSection(name, toolAConfigSchema).name).toBe(name);
  });

  it.each(['', '1tool', '-tool', '_tool', 'my tool', 'my.tool', 'a/b', '../x', 'a\\b', 'tool\n', '\ntool', ' tool', 'tool ', '__proto__', 'é'])(
    'rejects the name %j, which cannot be a key and a file name',
    (name) => {
      expect(() => defineSection(name, toolAConfigSchema)).toThrow(TypeError);
      expect(() => defineSection(name, toolAConfigSchema)).toThrow(/^invalid section name '.*': it must start with a letter and contain only letters, digits, '-' and '_'$/s);
    },
  );

  it('rejects the name of an envelope key', () => {
    expect(() => defineSection('extends', toolAConfigSchema)).toThrow(new TypeError("invalid section name 'extends': it is a key of the config envelope"));
  });
});

describe('withSections', () => {
  it('returns a defineConfig that hands back the config it was given', () => {
    const config = { toolA: { include: ['src'] } };

    expect(withSections(toolA)(config)).toBe(config);
  });

  it('accepts several sections', () => {
    const config = { toolA: { include: ['src'] }, toolB: { rules: { x: 'warn' } } };

    expect(withSections(toolA, toolB)(config)).toBe(config);
  });

  it('rejects a section listed twice, naming it', () => {
    expect(() => withSections(toolA, toolB, defineSection('toolA', toolAConfigSchema))).toThrow(new TypeError("section 'toolA' is listed more than once"));
  });

  it('types the config from the listed descriptors', () => {
    const defineConfigForA = withSections(toolA);

    expectTypeOf(defineConfigForA).parameter(0).toEqualTypeOf<Envelope & { readonly toolA?: ToolAConfig }>();
    expectTypeOf(defineConfigForA).returns.toEqualTypeOf<ConfigOf<[typeof toolA]>>();
  });

  it('derives the section map from the descriptors', () => {
    expectTypeOf<SectionsOf<[typeof toolA, typeof toolB]>>().toEqualTypeOf<{
      toolA: ToolAConfig;
      toolB: { rules: Record<string, string> };
    }>();
  });
});

describe('defineConfig', () => {
  it('returns its argument unchanged', () => {
    const config = { extends: './preset.ts' };

    expect(defineConfig(config)).toBe(config);
  });

  it('accepts only the envelope', () => {
    expectTypeOf(defineConfig).parameter(0).toEqualTypeOf<Envelope>();
  });
});

describe('Config', () => {
  it('adds one optional key per section', () => {
    expectTypeOf<Config<{ readonly a: number }>>().toEqualTypeOf<Envelope & { readonly a?: number }>();
  });

  it('allows extends as a string or a list of strings', () => {
    expectTypeOf<Envelope['extends']>().toEqualTypeOf<string | readonly string[] | undefined>();
  });
});
