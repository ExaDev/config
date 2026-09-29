import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    // Every case that loads a TypeScript file pays jiti's first-transpile cost, and the interop cases spawn a second cosmiconfig major.
    testTimeout: 30_000,
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
