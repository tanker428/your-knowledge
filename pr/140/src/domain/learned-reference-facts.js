/** Return learned ReferenceFacts connected to one active Visit. */
export function getLearnedReferenceFacts(project, visitId, userId = project?.userId || "user-local", entities = []) {
  if (!project || !visitId) return [];
  const photos = (project.photos || []).filter((photo) => photo.visitId === visitId);
  const observations = photos.flatMap((photo) => (photo.observations || [])
    .filter((observation) => observation.included !== false && observation.status !== "rejected")
    .map((observation) => ({ observation, photo })));
  const observationById = new Map(observations.map((item) => [item.observation.id, item]));
  const activeEntityIds = new Set(observations.map((item) => item.observation.entityId).filter(Boolean));
  const entityById = new Map((project.entities || entities || []).map((entity) => [entity.id, entity]));
  const states = new Map((project.userKnowledgeStates || []).map((state) => [`${state.userId}\u0000${state.visitId}\u0000${state.referenceFactId}`, state]));
  return (project.referenceFacts || [])
    .filter((fact) => {
      if (fact.status !== "verified") return false;
      if (fact.visitId && fact.visitId !== visitId) return false;
      const observationId = fact.targetObservationId || fact.observationId;
      return observationById.has(observationId) || activeEntityIds.has(fact.subjectId);
    })
    .map((fact) => {
      const key = `${userId}\u0000${visitId}\u0000${fact.id}`;
      const state = states.get(key);
      const observationId = fact.targetObservationId || fact.observationId || observations.find((item) => item.observation.entityId === fact.subjectId)?.observation.id;
      const connected = observationById.get(observationId) || null;
      return {
        fact,
        state,
        entity: fact.subjectId ? entityById.get(fact.subjectId) || { id: fact.subjectId, name: null } : null,
        observation: connected?.observation || null,
        photo: connected?.photo || null,
        questionId: (project.learningEvents || []).find((event) => event.userId === userId && event.visitId === visitId && event.referenceFactId === fact.id)?.questionId || null,
      };
    })
    .filter((item) => item.state?.masteryValue === 1)
    .sort((a, b) => String(a.fact.id).localeCompare(String(b.fact.id)));
}
