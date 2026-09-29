import { defineSection, type Section } from '../../../src/index';
import { z } from 'zod';

export interface ToolBConfig {
  rules: Record<string, string>;
}

export const toolBConfigSchema: z.ZodType<ToolBConfig, ToolBConfig> = z.strictObject({ rules: z.record(z.string(), z.string()) });

export const toolB: Section<'toolB', z.ZodType<ToolBConfig, ToolBConfig>> = defineSection('toolB', toolBConfigSchema);
