import { defineConfig, type ViteUserConfig } from 'vitest/config';

// Every case that loads a TypeScript file pays jiti's first-transpile cost, and the interop cases spawn a second cosmiconfig major. The authoring type test compiles every fixture with the TypeScript compiler in a hook, so hooks get the same allowance.
const SLOW_WORK_TIMEOUT_MS = 30_000;

const config: ViteUserConfig = defineConfig({
  test: {
    testTimeout: SLOW_WORK_TIMEOUT_MS,
    hookTimeout: SLOW_WORK_TIMEOUT_MS,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // cli.ts only forwards process arguments and streams to runCommand; the packaged-install check runs it.
      exclude: ['src/**/*.test.ts', 'src/cli.ts'],
    },
  },
});

export default config;
