import { create } from 'zustand';

/* ============================================================
   Knowledge Base store — manages locally-tracked documents.
   Persisted to localStorage.  When a backend is configured the
   doc list is loaded from /knowledge/docs; otherwise only
   locally-uploaded docs are tracked.
   ============================================================ */

export type KbPhase = 'uploading' | 'chunking' | 'embedding' | 'done' | 'error';

export interface KbDoc {
  id:         string;
  name:       string;
  /** bytes */
  size:       number;
  /** MIME type */
  mimeType:   string;
  /** estimated chunk count */
  chunks:     number;
  /** embedding progress 0-100 */
  embed:      number;
  phase:      KbPhase;
  uploadedAt: number;
  hash?:      string;
  url?:       string;
  error?:     string;
}

interface KbState {
  docs: KbDoc[];
  addDoc:    (doc: KbDoc) => void;
  patchDoc:  (id: string, patch: Partial<KbDoc>) => void;
  removeDoc: (id: string) => void;
  clearAll:  () => void;
}

const STORAGE_KEY = 'atlas-kb-docs';

function load(): KbDoc[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KbDoc[]) : [];
  } catch {
    return [];
  }
}

function save(docs: KbDoc[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs.slice(0, 500)));
  } catch { /* quota */ }
}

export const useKnowledgeStore = create<KbState>((set) => ({
  docs: load(),

  addDoc: (doc) =>
    set((s) => {
      const docs = [doc, ...s.docs];
      save(docs);
      return { docs };
    }),

  patchDoc: (id, patch) =>
    set((s) => {
      const docs = s.docs.map((d) => (d.id === id ? { ...d, ...patch } : d));
      save(docs);
      return { docs };
    }),

  removeDoc: (id) =>
    set((s) => {
      const docs = s.docs.filter((d) => d.id !== id);
      save(docs);
      return { docs };
    }),

  clearAll: () => {
    save([]);
    set({ docs: [] });
  },
}));
