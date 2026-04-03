import { getLocalDb } from './discovery.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger('annotations');

export interface Annotation {
  objectId: string;
  objectName: string;
  objectType: string;
  summary: string;
  details: string;
  createdAt: string;
  updatedAt: string;
}

/** Ensure the annotations table exists */
async function ensureAnnotationsTable(projectPath: string) {
  const db = await getLocalDb(projectPath);
  if (!(await db.schema.hasTable('annotations'))) {
    await db.schema.createTable('annotations', (table) => {
      table.string('object_id').primary();
      table.string('object_name');
      table.string('object_type');
      table.text('summary');
      table.text('details');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
    log.info('Created annotations table');
  }
}

/** Save an AI-generated annotation for a database object */
export async function saveAnnotation(
  objectId: string,
  objectName: string,
  objectType: string,
  summary: string,
  details: string,
  projectPath: string,
): Promise<void> {
  await ensureAnnotationsTable(projectPath);
  const db = await getLocalDb(projectPath);

  await db('annotations').insert({
    object_id: objectId,
    object_name: objectName,
    object_type: objectType,
    summary,
    details,
    updated_at: db.fn.now(),
  }).onConflict('object_id').merge({
    summary,
    details,
    updated_at: db.fn.now(),
  });
}

/** Get annotation for a specific object */
export async function getAnnotation(objectId: string, projectPath: string): Promise<Annotation | null> {
  await ensureAnnotationsTable(projectPath);
  const db = await getLocalDb(projectPath);

  const row = await db('annotations').where('object_id', objectId).first();
  if (!row) return null;

  return {
    objectId: row.object_id,
    objectName: row.object_name,
    objectType: row.object_type,
    summary: row.summary,
    details: row.details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Get all annotations for a project */
export async function getAllAnnotations(projectPath: string): Promise<Annotation[]> {
  await ensureAnnotationsTable(projectPath);
  const db = await getLocalDb(projectPath);

  const rows = await db('annotations').select('*').orderBy('updated_at', 'desc');
  return rows.map((row: any) => ({
    objectId: row.object_id,
    objectName: row.object_name,
    objectType: row.object_type,
    summary: row.summary,
    details: row.details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
