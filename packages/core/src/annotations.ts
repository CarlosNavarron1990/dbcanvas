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

/** Save an AI-generated annotation for a database object */
export async function saveAnnotation(
  objectId: string,
  objectName: string,
  objectType: string,
  summary: string,
  details: string,
  projectPath: string,
): Promise<void> {
  const store = getLocalDb(projectPath);
  store.saveAnnotation({
    objectId,
    objectName,
    objectType,
    summary,
    details,
    updatedAt: new Date().toISOString(),
  });
  log.info({ objectId }, 'Annotation saved');
}

/** Get annotation for a specific object */
export async function getAnnotation(objectId: string, projectPath: string): Promise<Annotation | null> {
  const store = getLocalDb(projectPath);
  const ann = store.getAnnotation(objectId);
  if (!ann) return null;
  return {
    objectId: ann.objectId,
    objectName: ann.objectName,
    objectType: ann.objectType,
    summary: ann.summary,
    details: ann.details,
    createdAt: ann.updatedAt,
    updatedAt: ann.updatedAt,
  };
}

/** Get all annotations for a project */
export async function getAllAnnotations(projectPath: string): Promise<Annotation[]> {
  const store = getLocalDb(projectPath);
  // Access internal data via the store's read method through the public API
  // We'll iterate using getAnnotation for each
  const annotationsFile = (store as any).read?.('annotations') ?? [];
  return annotationsFile.map((ann: any) => ({
    objectId: ann.objectId,
    objectName: ann.objectName,
    objectType: ann.objectType,
    summary: ann.summary,
    details: ann.details,
    createdAt: ann.updatedAt,
    updatedAt: ann.updatedAt,
  }));
}
