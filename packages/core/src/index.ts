// @dbcanvas/core - Barrel export
export {
  createDbClient,
  getProcedureCode,
  getTableColumns,
  executeSafeRead,
  testConnection,
  findObjectAcrossDatabases,
  getTableForeignKeys,
  getProcedureDependencies,
  getProcedureDependenciesFromSql,
} from './database.js';
export type { DbClient } from './database.js';

export {
  getLocalDb,
  closeAllLocalDbs,
  syncDiscovery,
  getDiscoveryGraph,
  discoverObject,
  ensureShadowTable,
  captureShadowData,
  getShadowData,
} from './discovery.js';
export type { DiscoveryNode, DiscoveryEdge, GraphQueryOptions } from './discovery.js';

export { logger, createChildLogger } from './logger.js';
export { generateAgentPrompt, listAgents, AGENT_PERSPECTIVES } from './agents.js';
export type { AgentPerspective } from './agents.js';

export { captureSpData, simulateSp, compareResults, getLatestCapture } from './simulator.js';
export type { CaptureResult, SimulationResult, CompareResult, CapturedTable, SpParam } from './simulator.js';

export { traceFieldLineage, getStoredLineage } from './lineage.js';
export { saveAnnotation, getAnnotation, getAllAnnotations } from './annotations.js';
export type { Annotation } from './annotations.js';
export type { LineageNode, LineageEdge, LineageGraph } from './lineage.js';

export {
  discoverConnectionString,
  findSolutionRoot,
  registerSolutionRoot,
  getRegisteredProjects,
  removeProject,
  updateProjectName,
  discoverLocalProjects,
} from './config.js';
export type { DbConfig, RegisteredProject } from './config.js';
