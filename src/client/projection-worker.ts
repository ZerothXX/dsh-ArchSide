import { project } from '../core/projection';
import type { ProjectionRequest } from './useProjection';

self.onmessage = (event: MessageEvent<ProjectionRequest>) => {
  const { id, doc, chapter, detailed, expanded, layout } = event.data;
  try { self.postMessage({ id, result: project(doc, chapter, detailed, expanded, layout) }); }
  catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
