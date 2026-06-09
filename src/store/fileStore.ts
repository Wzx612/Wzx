import { create } from 'zustand';
import type { FileRecord } from '@/services/fileService';

export interface UploadingEntry {
  localId: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

interface FileState {
  files: FileRecord[];
  uploading: UploadingEntry[];

  setFiles: (files: FileRecord[]) => void;
  prependFile: (file: FileRecord) => void;
  removeFile: (id: string) => void;

  addUploading: (entry: UploadingEntry) => void;
  patchUploading: (localId: string, patch: Partial<UploadingEntry>) => void;
  removeUploading: (localId: string) => void;
}

export const useFileStore = create<FileState>((set) => ({
  files: [],
  uploading: [],

  setFiles: (files) => set({ files }),
  prependFile: (file) => set((s) => ({ files: [file, ...s.files] })),
  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),

  addUploading: (entry) => set((s) => ({ uploading: [...s.uploading, entry] })),
  patchUploading: (localId, patch) =>
    set((s) => ({
      uploading: s.uploading.map((u) =>
        u.localId === localId ? { ...u, ...patch } : u,
      ),
    })),
  removeUploading: (localId) =>
    set((s) => ({ uploading: s.uploading.filter((u) => u.localId !== localId) })),
}));
