import { getGraphForActiveVisit } from "../domain/knowledge-graph.js";

/**
 * Load a Project through the repository and derive its active-visit graph.
 * No additional IndexedDB store is needed for this projection.
 * @param {{loadProject:(projectId:string)=>Promise<any>}} repository
 * @param {string} projectId
 * @param {any} registries
 * @returns {Promise<import('../domain/knowledge-graph.js').KnowledgeGraph|null>}
 */
export async function loadActiveVisitKnowledgeGraph(repository, projectId, registries = {}) {
  const project = await repository.loadProject(projectId);
  return project ? getGraphForActiveVisit(project, registries) : null;
}
