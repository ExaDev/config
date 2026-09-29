import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

interface Finding {
  readonly line: number;
  readonly code: number;
  readonly message: string;
}

const FIXTURES = join(import.meta.dirname, 'fixtures');
const CASES = join(FIXTURES, 'cases');

/**
 * The compiler options of the project's own tsconfig that decide how strictly an authoring file is checked. `isolatedDeclarations` is added only for the program that emits declarations.
 */
const BASE_OPTIONS: ts.CompilerOptions = {
  exactOptionalPropertyTypes: true,
  lib: ['lib.es2024.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  noUncheckedIndexedAccess: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2024,
  types: [],
  verbatimModuleSyntax: true,
};

function compile(options: ts.CompilerOptions): ReadonlyMap<string, readonly Finding[]> {
  const files = [...readdirSync(CASES).map((name) => join(CASES, name)), join(FIXTURES, 'tool-a.ts'), join(FIXTURES, 'tool-b.ts')];
  const program = ts.createProgram(files, { ...BASE_OPTIONS, ...options });
  const byFile = new Map<string, Finding[]>();
  for (const file of files) {
    const findings = ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).map((diagnostic) => ({
      line: diagnostic.file === undefined || diagnostic.start === undefined ? 0 : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }));
    byFile.set(relative(FIXTURES, file), findings);
  }

  return byFile;
}

let plain: ReadonlyMap<string, readonly Finding[]>;
let isolated: ReadonlyMap<string, readonly Finding[]>;

beforeAll(() => {
  plain = compile({});
  isolated = compile({ declaration: true, isolatedDeclarations: true });
});

function findingsIn(program: ReadonlyMap<string, readonly Finding[]>, name: string): readonly Finding[] {
  const findings = program.get(`${name}.ts`);
  if (findings === undefined) {
    throw new Error(`no fixture named ${name}`);
  }

  return findings;
}

interface Expected {
  readonly line: number;
  readonly code: number;
  /**
   * A fragment of the compiler's message, so a wording change in a later TypeScript release does not fail a test about which error is reported.
   */
  readonly message: string;
}

/**
 * Asserts the compiler reported exactly the errors in `expected`, in order, by line and code, and that each message contains its fragment.
 */
function expectErrors(actual: readonly Finding[], expected: readonly Expected[]): void {
  expect(actual.map(({ line, code }) => ({ line, code }))).toEqual(expected.map(({ line, code }) => ({ line, code })));
  for (const [index, { message }] of expected.entries()) {
    expect(actual[index]?.message).toContain(message);
  }
}

describe('an authoring file', () => {
  it.each(['ok-two-tools', 'ok-layout', 'ok-sections-optional', 'ok-envelope-only', 'ok-isolated-declarations'])('%s type-checks', (name) => {
    expect(findingsIn(plain, `cases/${name}`)).toEqual([]);
  });

  it('rejects an unknown key inside a section, suggesting the near miss', () => {
    expectErrors(findingsIn(plain, 'cases/unknown-key'), [{ line: 5, code: 2561, message: "'inclde' does not exist in type 'ToolAConfig'. Did you mean to write 'include'?" }]);
  });

  it('rejects a field of the wrong type', () => {
    expectErrors(findingsIn(plain, 'cases/wrong-type'), [{ line: 5, code: 2322, message: "Type 'string' is not assignable to type 'string[]'." }]);
  });

  it('rejects a value outside a field\'s union', () => {
    expectErrors(findingsIn(plain, 'cases/bad-enum'), [{ line: 5, code: 2322, message: '"medium"' }]);
  });

  it('rejects a missing required field', () => {
    expectErrors(findingsIn(plain, 'cases/missing-required'), [{ line: 5, code: 2741, message: "Property 'include' is missing" }]);
  });

  it('rejects an explicit undefined for an optional field under exactOptionalPropertyTypes', () => {
    expectErrors(findingsIn(plain, 'cases/exact-optional'), [{ line: 5, code: 2375, message: 'exactOptionalPropertyTypes' }]);
  });

  it('rejects the section of a tool that is installed but not listed', () => {
    expectErrors(findingsIn(plain, 'cases/unlisted-tool'), [{ line: 8, code: 2561, message: "'toolB' does not exist in type" }]);
  });

  it('rejects a misspelt section name', () => {
    expectErrors(findingsIn(plain, 'cases/misspelt-section'), [{ line: 5, code: 2561, message: "Did you mean to write 'toolA'?" }]);
  });

  it('rejects any section key when no section is listed, instead of accepting {}', () => {
    expectErrors(findingsIn(plain, 'cases/empty-map-define-config'), [{ line: 5, code: 2353, message: "'toolA' does not exist in type 'Envelope'" }]);
  });

  it('rejects listing no descriptors at all', () => {
    expectErrors(findingsIn(plain, 'cases/empty-map-with-sections'), [{ line: 3, code: 2555, message: 'Expected at least 1 arguments' }]);
  });

  it('reports a tool whose package is not installed as a module that cannot be found', () => {
    expectErrors(findingsIn(plain, 'cases/uninstalled-tool'), [{ line: 3, code: 2307, message: "Cannot find module '@acme/absent'" }]);
  });

  it('rejects an extends that is not a string or a list of strings', () => {
    expectErrors(findingsIn(plain, 'cases/bad-extends'), [{ line: 3, code: 2322, message: "Type 'number' is not assignable" }]);
  });

  it('checks the layout section like any other', () => {
    expectErrors(findingsIn(plain, 'cases/layout-unknown-key'), [{ line: 4, code: 2561, message: "'rankskip' does not exist in type 'LayoutConfig'. Did you mean to write 'rankSkip'?" }]);
    expectErrors(findingsIn(plain, 'cases/layout-missing-groups'), [{ line: 4, code: 2741, message: "Property 'groups' is missing" }]);
  });
});

describe('with isolatedDeclarations', () => {
  it('accepts an annotated default export and the descriptors a tool package writes', () => {
    expect(findingsIn(isolated, 'cases/ok-isolated-declarations')).toEqual([]);
    expect(findingsIn(isolated, 'tool-a')).toEqual([]);
    expect(findingsIn(isolated, 'tool-b')).toEqual([]);
  });

  it('requires a default export to be a named, annotated value, which ConfigOf makes short to write', () => {
    expectErrors(findingsIn(isolated, 'cases/default-export-inferred'), [{ line: 5, code: 9037, message: "Default exports can't be inferred" }]);
  });
});
