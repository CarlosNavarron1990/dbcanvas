import { z } from 'zod';

export const SpDefinitionArgs = z.object({
  name: z.string().min(1, 'Stored procedure name is required'),
  dbUrl: z.string().optional(),
  projectPath: z.string().optional(),
});

export const TableSchemaArgs = z.object({
  name: z.string().min(1, 'Table name is required'),
  dbUrl: z.string().optional(),
  projectPath: z.string().optional(),
});

export const QueryDataArgs = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  dbUrl: z.string().optional(),
  projectPath: z.string().optional(),
});

export const TestConnectionArgs = z.object({
  dbUrl: z.string().optional(),
  projectPath: z.string().optional(),
});

export const EffectiveConfigArgs = z.object({
  projectPath: z.string().optional(),
});

export const FindObjectArgs = z.object({
  name: z.string().min(1, 'Object name is required'),
  projectPath: z.string().optional(),
});

export const SyncDiscoveryArgs = z.object({
  projectPath: z.string().optional(),
});

export const GetGraphArgs = z.object({
  projectPath: z.string().optional(),
  type: z.enum(['TABLE', 'PROCEDURE', 'VIEW']).optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});

export const ExploreSpArgs = z.object({
  name: z.string().min(1, 'Stored procedure name is required'),
  params: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().positive().optional(),
  projectPath: z.string().optional(),
});

export const ListProjectsArgs = z.object({});

export const TraceLineageArgs = z.object({
  field: z.string().min(1, 'Field name is required'),
  table: z.string().optional(),
  projectPath: z.string().optional(),
});

export const AnnotateArgs = z.object({
  name: z.string().min(1, 'Object name is required'),
  type: z.enum(['PROCEDURE', 'TABLE', 'VIEW']).default('PROCEDURE'),
  summary: z.string().min(1, 'Summary is required'),
  details: z.string().optional(),
  projectPath: z.string().optional(),
});

export const GetAnnotationArgs = z.object({
  name: z.string().min(1, 'Object name is required'),
  type: z.enum(['PROCEDURE', 'TABLE', 'VIEW']).default('PROCEDURE'),
  projectPath: z.string().optional(),
});

export const SpDiffArgs = z.object({
  name: z.string().min(1, 'Stored procedure name is required'),
  projectPath: z.string().optional(),
});

export const AnalyzeArgs = z.object({
  name: z.string().min(1, 'Object name is required'),
  perspective: z.enum(['tech_lead', 'architect', 'analyst', 'product_owner']).optional(),
  projectPath: z.string().optional(),
});

export const CaptureSpDataArgs = z.object({
  name: z.string().min(1, 'Stored procedure name is required'),
  params: z.record(z.string(), z.unknown()),
  projectPath: z.string().optional(),
});

export const SimulateSpArgs = z.object({
  name: z.string().min(1, 'Original SP name is required'),
  modifiedCode: z.string().min(1, 'Modified SP code is required'),
  params: z.record(z.string(), z.unknown()).optional(),
  projectPath: z.string().optional(),
});

export const GetCaptureArgs = z.object({
  name: z.string().min(1, 'SP name is required'),
  projectPath: z.string().optional(),
});
