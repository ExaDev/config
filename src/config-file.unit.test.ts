import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CONFIG_EXTENSIONS, configFileNames } from './index';
import { layoutSection } from './layout';
import { defineSection } from './section';

describe('CONFIG_EXTENSIONS', () => {
  it('lists the extensions a config file may have, in the order they are looked up', () => {
    expect(CONFIG_EXTENSIONS).toEqual(['.ts', '.mts', '.cts']);
  });
});

describe('configFileNames', () => {
  it('names the unified file and the standalone file of a section under every extension, in lookup order', () => {
    expect(configFileNames(layoutSection)).toEqual({
      unified: ['exadev.config.ts', 'exadev.config.mts', 'exadev.config.cts'],
      standalone: ['exadev.layout.config.ts', 'exadev.layout.config.mts', 'exadev.layout.config.cts'],
    });
  });

  it('builds the standalone names from the section name verbatim, and the unified names independently of it', () => {
    const section = defineSection('my-Tool_2', z.unknown());

    expect(configFileNames(section)).toEqual({
      unified: ['exadev.config.ts', 'exadev.config.mts', 'exadev.config.cts'],
      standalone: ['exadev.my-Tool_2.config.ts', 'exadev.my-Tool_2.config.mts', 'exadev.my-Tool_2.config.cts'],
    });
  });

  it('gives each shape one name per extension, ending in that extension', () => {
    const names = configFileNames(layoutSection);

    for (const candidates of [names.unified, names.standalone]) {
      expect(candidates.map((name) => CONFIG_EXTENSIONS.find((extension) => name.endsWith(`.config${extension}`)))).toEqual(CONFIG_EXTENSIONS);
    }
  });
});
