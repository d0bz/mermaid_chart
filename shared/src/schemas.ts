import { z } from 'zod';
import { HASH_REGEX } from './ids.js';

export const HashSchema = z.string().regex(HASH_REGEX, 'Invalid hash format');

export const ProjectSchema = z.object({
  id: HashSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().min(1),
});

export const ChartSchema = z.object({
  id: HashSchema,
  projectId: HashSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  code: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().min(1),
});

export const CreateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    chartName: z.string().trim().min(1).max(200).optional(),
    code: z.string().max(500_000).optional(),
  })
  .optional()
  .default({});

export const UpdateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    baseRevision: z.number().int().min(1),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: 'Either name or description must be provided',
  });

export const CreateChartInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    code: z.string().max(500_000).optional(),
  })
  .optional()
  .default({});

export const UpdateChartInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    code: z.string().max(500_000).optional(),
    baseRevision: z.number().int().min(1),
  })
  .refine(
    (data) =>
      data.name !== undefined || data.description !== undefined || data.code !== undefined,
    {
      message: 'At least one of name, description, or code must be provided',
    }
  );
