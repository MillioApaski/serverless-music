import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, FileJson, Music2 } from 'lucide-react';
import { importFile } from '../../../packages/playlist/src/import';
import { exportCsv, importCsv } from '../../../packages/playlist/src/csv';
import type { PlaylistPage } from '../../../packages/playlist/src/providers';
import type { Track } from '../../../packages/core/src/index';

const pageSize = 50;
type RemoteImport = {
  url: string;
  name: string;
  total: number;
  next: number | null;
  tracks: Map<string, Track>;
  failures: PlaylistPage['failures'];
  duplicates: number;
  fingerprints: Set<string>;
};
const exampleText = JSON.stringify({
  name: '我的测试歌单',
  platform: 'tx',
  tracks: [{
    songmid: 'owned-example-id',
    songname: '微光（元数据示例）',
    singer: [{ name: 'Serverless Music' }],
    albumname: '测试歌单',
    interval: 18,
  }],
}, null, 2);

export function PlaylistImport() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof importFile>>();
  const [note, setNote] = useState('');
  const [page, setPage] = useState(0);
  const [link, setLink] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const [remotePending, setRemotePending] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const fileRevision = useRef(0);
  const remoteRequest = useRef<AbortController | null>(null);
  const remoteProgress = useRef<RemoteImport | null>(null);
  useEffect(() => () => remoteRequest.current?.abort(), []);

  function resetRemote() {
    remoteRequest.current?.abort();
    remoteRequest.current = null;
    remoteProgress.current = null;
    setRemotePending(false);
    setCanResume(false);
    setLinkNote('');
  }

  function prepare(parse: () => ReturnType<typeof importFile>) {
    setPage(0);
    setPreview(undefined);
    try {
      const result = parse();
      setPreview(result);
      setNote(`${result.tracks.length} 首已读取 · ${result.duplicates} 首重复 · ${result.failures.length} 首失败`);
    } catch (error) {
      setNote(String(error));
    }
  }

  function previewJson(value: string) {
    resetRemote();
    fileRevision.current++;
    prepare(() => importFile(JSON.parse(value.replace(/^\uFEFF/, ''))));
  }

  async function loadFile(file?: File) {
    if (!file) return;
    resetRemote();
    const revision = ++fileRevision.current;
    setPreview(undefined);
    setNote('正在读取文件…');
    setText('');
    if (file.size > 8 * 1024 * 1024) {
      setNote('文件超过 8 MiB');
      return;
    }

    try {
      const content = await file.text();
      if (revision !== fileRevision.current) return;
      if (/\.csv$/i.test(file.name)) {
        prepare(() => importCsv(content, file.name.replace(/\.csv$/i, '')));
      } else {
        setText(content);
        previewJson(content);
      }
    } catch {
      if (revision === fileRevision.current) setNote('无法读取文件');
    }
  }

  function download(format: 'json' | 'csv') {
    if (!preview) return;
    const { name, tracks } = preview;
    const content = format === 'json'
      ? JSON.stringify({ name, platform: 'native', tracks }, null, 2)
      : exportCsv(name, tracks);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importLink(resume = false) {
    if (remoteRequest.current || (resume && !remoteProgress.current)) return;
    fileRevision.current++;
    const controller = new AbortController();
    remoteRequest.current = controller;
    setRemotePending(true);
    setCanResume(false);
    setLinkNote('正在读取歌单…');
    setNote('');
    if (!resume) {
      setText('');
      setPage(0);
      setPreview(undefined);
      remoteProgress.current = {
        url: link.trim(), name: '', total: 0, next: 0, tracks: new Map(),
        failures: [], duplicates: 0, fingerprints: new Set(),
      };
    }
    const progress = remoteProgress.current;
    try {
      if (!progress) return;
      while (progress.next !== null) {
        const offset: number = progress.next;
        const response = await fetch('/api/playlists/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: progress.url, offset }),
          signal: controller.signal,
        });
        const data = await response.json() as PlaylistPage & { error?: { message: string } };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error?.message ?? '平台歌单读取失败');
        if (offset && (progress.name !== data.name || progress.total !== data.total)) {
          throw new Error('远程歌单已发生变更，请重新导入');
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
        progress.total = data.total;
        progress.next = data.nextOffset;
        setPreview({
          name: progress.name, total: end, duplicates: progress.duplicates,
          tracks: [...progress.tracks.values()], failures: [...progress.failures],
        });
        setLinkNote(`已读取 ${end} / ${data.total} 首 · ${progress.duplicates} 首重复 · ${progress.failures.length} 首失败`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : '平台歌单读取失败';
        setLinkNote(progress?.next ? `已保留前 ${progress.next} 首的结果。 ${message}` : message);
        setCanResume(progress?.next != null);
      }
    } finally {
      if (remoteRequest.current === controller) {
        remoteRequest.current = null;
        setRemotePending(false);
      }
    }
  }

  function stopImport() {
    remoteRequest.current?.abort();
    setCanResume(remoteProgress.current?.next != null);
    setLinkNote('已暂停导入，可从当前页继续');
  }

  const totalPages = Math.ceil((preview?.tracks.length ?? 0) / pageSize);
  return <>
    <h1 className="page-title">歌单导入</h1>
    <p className="page-intro">导入本地 JSON、CSV 或公开歌单链接，检查曲目和平台标识，再导出校验后的歌单。</p>
    <div className="import-layout">
      <section className="import-panel">
        <div className="section-heading">
          <h2>本地歌单</h2>
          <button className="text-button" onClick={() => { setText(exampleText); previewJson(exampleText); }}>填入示例</button>
        </div>
        <label htmlFor="playlist-json" className="hint">粘贴含 name、platform 和 tracks 的 JSON</label>
        <textarea id="playlist-json" value={text} onChange={event => {
          resetRemote();
          fileRevision.current++;
          setText(event.target.value);
          setPreview(undefined);
          setNote('');
        }}/>
        <div className="import-actions">
          <label className="secondary file-label">
            <FileJson size={16}/>选择 JSON 或 CSV
            <input type="file" accept=".json,.csv,application/json,text/csv" onChange={event => {
              void loadFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}/>
          </label>
          <button className="primary" onClick={() => previewJson(text)} disabled={!text.trim()}>
            预览歌单 <ChevronRight size={15}/>
          </button>
        </div>
        <p role="status" className="hint">{note}</p>
      </section>
      <section className="import-help">
        <h3>CSV 格式</h3>
        <p>首行包含 title 和 artist 两列，专辑和时长可用 album 和 duration，时长以秒计。</p>
        <div className="subtle-line"/>
        <h3>从分享链接导入</h3>
        <p>粘贴网易云音乐或 QQ 音乐的公开歌单链接。</p>
        <form onSubmit={event => { event.preventDefault(); void importLink(); }}>
          <label className="sr-only" htmlFor="playlist-link">歌单分享链接</label>
          <input id="playlist-link" value={link} onChange={event => {
            resetRemote();
            setLink(event.target.value);
          }} maxLength={2048} placeholder="粘贴歌单链接"/>
          <div className="playlist-actions">
            <button className="primary" disabled={!link.trim() || remotePending}>导入链接</button>
            {remotePending && <button className="secondary" type="button" onClick={stopImport}>暂停导入</button>}
            {canResume && !remotePending &&
              <button className="secondary" type="button" onClick={() => void importLink(true)}>继续导入</button>}
          </div>
        </form>
        <p className="hint" role="status">{linkNote}</p>
      </section>
    </div>
    {preview && <>
      <div className="section-heading"><h2>{preview.name}</h2><span>{preview.total} 首原始曲目</span></div>
      {preview.failures.length > 0 && <details className="import-failures">
        <summary>{preview.failures.length} 首曲目导入失败</summary>
        <ol>{preview.failures.map(failure =>
          <li key={failure.index}>第 {failure.index + 1} 首 · {failure.message}</li>)}</ol>
      </details>}
      {preview.tracks.length > 0 && <>
        <div className="playlist-actions">
          <button className="secondary" onClick={() => download('json')}><Download size={14}/>导出 JSON</button>
          <button className="secondary" onClick={() => download('csv')}><Download size={14}/>导出 CSV</button>
        </div>
        {preview.tracks.slice(page * pageSize, (page + 1) * pageSize).map(track =>
          <div className="preview-track" key={track.id}>
            <Music2 size={19}/>
            <div><strong>{track.title}</strong><small>{track.artists.join(' / ')}</small></div>
            <code>{track.identifiers.map(id => `${id.platform}:${id.id}`).join(', ')}</code>
          </div>)}
        {totalPages > 1 && <div className="playlist-actions playlist-pagination">
          <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
          <span className="hint" aria-live="polite">第 {page + 1} / {totalPages} 页</span>
          <button className="secondary" disabled={page + 1 === totalPages} onClick={() => setPage(page + 1)}>下一页</button>
        </div>}
      </>}
    </>}
  </>;
}
