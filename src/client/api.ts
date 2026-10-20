import type { Layout, Snapshot } from '../core/model';
export interface ArchsideApi {
  snapshot(): Promise<Snapshot>;
  saveLayout(layout: Layout): Promise<unknown>;
  reference(id: string): Promise<void>;
  insertPrompt(text: string): Promise<void>;
  asset(path: string): Promise<string>;
}
