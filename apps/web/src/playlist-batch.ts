import { useEffect, useRef, useState } from 'react';
import type { Track } from '../../../packages/core/src/index';
import type { importFile, PlaylistSource } from '../../../packages/playlist/src/import';
import type { PlaylistPage } from '../../../packages/playlist/src/providers';

export const batchLimit = 10;
export type Preview = ReturnType<typeof importFile>;

type Progress = {
  url: string;
  next: number | null;
  cursor?: string;
  total: number;
  name: string;
  source?: PlaylistSource;
  tracks: Map<string, Track>;
  failures: PlaylistPage['failures'];
  duplicates: number;
  fingerprints: Set<string>;
};

type Job = {
  url: string;
  phase: 'waiting' | 'reading' | 'paused' | 'failed' | 'done';
  note: string;
  preview?: Preview;
  progress: Progress;
  refreshing?: boolean;
};

function newProgress(url: string): Progress {
  return { url, next: 0, total: 0, name: '', tracks: new Map(), failures: [], duplicates: 0, fingerprints: new Set() };
}

export async function playlistRequest<T>(action: string, url: string, offset: number, signal: AbortSignal, cursor?: string): Promise<T> {
  const response = await fetch(`/api/playlists/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, offset, cursor }), signal,
  });
  const data = await response.json() as T & { error?: { message: string } };
  if (!response.ok) throw new Error(data.error?.message ?? '平台歌单读取失败');
  return data;
}

async function loadPage(progress: Progress, signal: AbortSignal, onPage: (preview: Preview, total: number) => void) {
  while (progress.next !== null) {
    const offset: number = progress.next;
    const data = await playlistRequest<PlaylistPage & { source?: PlaylistSource }>('import', progress.url, offset, signal, progress.cursor);
    signal.throwIfAborted();
    if (offset && (progress.name !== data.name || progress.total !== data.total)) {
      throw new Error('远程歌单已发生变更，请重新同步');
    }
    const received = data.tracks.length + data.failures.length;
    const end = offset + received;
    if (end > data.total || (data.nextOffset === null ? end !== data.total : received === 0 || data.nextOffset !== end)) {
      throw new Error('平台返回了不完整的分页结果');
    }
    const fingerprint = JSON.stringify(data.tracks.map(track => track.id));
    if (data.tracks.length > 1 && progress.fingerprints.has(fingerprint)) {
      throw new Error('平台重复返回了同一页曲目，请重试');
    }
    if (data.tracks.length > 1) progress.fingerprints.add(fingerprint);
    for (const track of data.tracks) {
      if (progress.tracks.has(track.id)) progress.duplicates++;
      else progress.tracks.set(track.id, track);
    }
    progress.failures.push(...data.failures);
    progress.name = data.name;
    progress.source ??= data.source;
    // Subsequent pages use the canonical link so the share redirect is only resolved once.
    if (progress.source) progress.url = progress.source.url;
    progress.total = data.total;
    progress.next = data.nextOffset;
    progress.cursor = data.nextCursor;
    onPage({
      name: progress.name, source: progress.source, total: end, duplicates: progress.duplicates,
      tracks: [...progress.tracks.values()], failures: [...progress.failures],
    }, data.total);
  }
}

export function usePlaylistBatch() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, select] = useState(0);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const queue = useRef<Job[]>([]);
  useEffect(() => () => request.current?.abort(), []);

  function publish() {
    setJobs([...queue.current]);
  }

  function update(index: number, job: Job) {
    queue.current[index] = job;
    publish();
  }

  async function run(indices: number[], restart = false) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      for (const index of indices) {
        if (controller.signal.aborted) break;
        const current = queue.current[index];
        const progress = restart ? newProgress(current.preview?.source?.url ?? current.url) : current.progress;
        const refreshing = (restart && !!current.preview) || current.refreshing;
        let job: Job = { ...current, progress, refreshing, phase: 'reading', note: '正在读取歌单…' };
        update(index, job);
        try {
          await loadPage(progress, controller.signal, (preview, total) => {
            job = {
              ...job, preview: refreshing && progress.next !== null ? current.preview : preview,
              note: `已读取 ${preview.total} / ${total} 首 · ${preview.duplicates} 首重复 · ${preview.failures.length} 首失败`,
            };
            update(index, job);
          });
          update(index, { ...job, refreshing: false, phase: 'done' });
        } catch (error) {
          if (request.current !== controller) break;
          const paused = controller.signal.aborted;
          const message = paused ? '已暂停，可继续导入' : error instanceof Error ? error.message : '平台歌单读取失败';
          update(index, {
            ...job, phase: paused ? 'paused' : 'failed',
            note: job.preview && !refreshing ? `已保留前 ${job.preview.total} 首的结果。 ${message}` : message,
          });
        }
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  function start(urls: string[]) {
    if (request.current || !urls.length) return;
    queue.current = [...new Set(urls)].map(url => ({ url, phase: 'waiting', note: '等待导入', progress: newProgress(url) }));
    select(0);
    publish();
    void run(queue.current.map((_, index) => index));
  }

  function reset() {
    request.current?.abort();
    request.current = null;
    queue.current = [];
    publish();
    setPending(false);
    select(0);
  }

  const remaining = jobs.flatMap((job, index) => job.phase !== 'done' ? [index] : []);
  return {
    jobs, selected, select, pending, remaining, start, reset,
    pause: () => request.current?.abort(),
    resume: () => void run(remaining),
    retry: () => void run([selected]),
    refresh: () => void run([selected], true),
  };
}
