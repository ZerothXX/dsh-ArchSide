import { useEffect, useRef, useState } from 'react';
import { project, type Projection } from '../core/projection';
import type { Architecture, Layout } from '../core/model';

declare const __ARCHSIDE_WORKER_SOURCE__: string;
export interface ProjectionRequest { id: number; doc: Architecture; chapter: string | null; detailed: boolean; expanded: Set<string>; layout: Layout }
interface Result { doc: Architecture; chapter: string | null; detailed: boolean; graph: Projection; expanded: Set<string>; positions?: Layout['views'][string]['positions'] }
const geometryPositions = (layout: Layout, chapter: string | null, detailed: boolean) => {
  const saved = layout.views[chapter ? `chapter:${chapter}` : detailed ? 'overview:detailed' : 'overview:simple']?.positions;
  return saved && Object.keys(saved).length ? saved : undefined;
};

/** One in-flight job and one latest pending job; obsolete results never replace a newer view. */
export function useProjection(doc: Architecture | null, chapter: string | null, detailed: boolean, expanded: Set<string>, layout: Layout, onError: (error: unknown) => void) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const runner = useRef<(request: ProjectionRequest) => void>();
  const sequence = useRef(0);
  // Creating the first viewport entry must not invalidate an otherwise empty geometry.
  const positions = geometryPositions(layout, chapter, detailed);
  useEffect(() => {
    let worker: Worker | undefined, url: string | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false, active: ProjectionRequest | undefined, pending: ProjectionRequest | undefined;
    const finish = (job: ProjectionRequest, graph?: Projection, error?: unknown) => {
      active = undefined;
      if (stopped) return;
      if (job.id === sequence.current) {
        if (graph) setResult({ doc: job.doc, chapter: job.chapter, detailed: job.detailed, graph, expanded: job.expanded, positions: geometryPositions(job.layout, job.chapter, job.detailed) });
        if (error) onError(error);
        setBusy(false);
      }
      if (pending) { const next = pending; pending = undefined; run(next); }
    };
    const fallback = (job: ProjectionRequest) => {
      timer = setTimeout(() => {
        try { finish(job, project(job.doc, job.chapter, job.detailed, job.expanded, job.layout)); }
        catch (error) { finish(job, undefined, error); }
      }, 0);
    };
    const run = (job: ProjectionRequest) => {
      active = job;
      if (worker) {
        try { worker.postMessage(job); }
        catch { worker.terminate(); worker = undefined; fallback(job); }
      } else fallback(job);
    };
    try {
      url = URL.createObjectURL(new Blob([__ARCHSIDE_WORKER_SOURCE__], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = (event: MessageEvent<{ id: number; result?: Projection; error?: string }>) => {
        if (active?.id === event.data.id) finish(active, event.data.result, event.data.error);
      };
      worker.onerror = event => {
        event.preventDefault(); worker?.terminate(); worker = undefined;
        if (active) fallback(active);
      };
    } catch { /* Some host security policies disable workers; retain the same graph in fallback mode. */ }
    runner.current = job => { if (active) pending = job; else run(job); };
    return () => { stopped = true; runner.current = undefined; worker?.terminate(); if (url) URL.revokeObjectURL(url); clearTimeout(timer); };
  }, [onError]);
  useEffect(() => {
    const id = ++sequence.current;
    if (!doc) { setResult(null); setBusy(false); return; }
    setBusy(true);
    runner.current?.({ id, doc, chapter, detailed, expanded, layout });
    // Viewport changes do not alter graph geometry. Only saved node positions do.
  }, [doc, chapter, detailed, expanded, positions, onError]);
  const graph = result?.doc === doc && result.chapter === chapter && result.detailed === detailed ? result.graph : null;
  return { graph, busy: !!doc && (busy || !graph || result?.expanded !== expanded || result.positions !== positions) };
}
