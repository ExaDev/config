import { defineSection, type Section } from '../../../src/index';
import { z } from 'zod';

export interface ToolAConfig {
  include: string[];
  level?: 'low' | 'high';
}

export const toolAConfigSchema: z.ZodType<ToolAConfig, ToolAConfig> = z.strictObject({
  include: z.array(z.string()),
  level: z.exactOptional(z.enum(['low', 'high'])),
});

export const toolA: Section<'toolA', z.ZodType<ToolAConfig, ToolAConfig>> = defineSection('toolA', toolAConfigSchema);
