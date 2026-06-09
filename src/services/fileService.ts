import { api } from './api';

export interface FileRecord {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  minio_path: string;
  created_at: string;
}

export interface FileListResponse {
  items: FileRecord[];
  total: number;
}

export async function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<FileRecord> {
  const form = new FormData();
  form.append('file', file);

  const { data } = await api.post<FileRecord>('/files/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
    },
  });
  return data;
}

export async function listFiles(page = 1, pageSize = 50): Promise<FileListResponse> {
  const { data } = await api.get<FileListResponse>('/files', {
    params: { page, page_size: pageSize },
  });
  return data;
}

export async function deleteFile(id: string): Promise<void> {
  await api.delete(`/files/${id}`);
}

export async function getDownloadUrl(
  id: string,
): Promise<{ url: string; file_name: string }> {
  const { data } = await api.get<{ url: string; file_name: string }>(
    `/files/${id}/download`,
  );
  return data;
}
