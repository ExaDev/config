import { defineConfig } from '../../../../src/index';

// No sections are listed, so no section key is accepted (an empty mapped type would be {} and accept it).
export const config = defineConfig({
  toolA: { include: ['src'] },
});
