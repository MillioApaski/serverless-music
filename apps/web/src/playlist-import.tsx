import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Download, FileJson, Music2 } from 'lucide-react';
import { importFile } from '../../../packages/playlist/src/import';
import { exportCsv, importCsv } from '../../../packages/playlist/src/csv';
import { playlistUrl } from '../../../packages/playlist/src/links';
import type { ProfilePage } from '../../../packages/playlist/src/providers';
import { batchLimit, playlistRequest, usePlaylistBatch, type Preview } from './playlist-batch';

const pageSize = 50;
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
  const [filePreview, setFilePreview] = useState<Preview>();
  const [note, setNote] = useState('');
  const [page, setPage] = useState(0);
  const [link, setLink] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const batch = usePlaylistBatch();
  const activeJob = batch.jobs[batch.selected];
  const preview = activeJob?.preview ?? filePreview;
  const [profile, setProfile] = useState<ProfilePage>();
  const [checked, setChecked] = useState<string[]>([]);
  const [profilePending, setProfilePending] = useState(false);
  const [profileNote, setProfileNote] = useState('');
  const fileRevision = useRef(0);
  const profileRequest = useRef<AbortController | null>(null);
  useEffect(() => () => profileRequest.current?.abort(), []);

  function resetProfile() {
    profileRequest.current?.abort();
    profileRequest.current = null;
    setProfile(undefined);
    setChecked([]);
    setProfilePending(false);
    setProfileNote('');
  }

  function prepare(parse: () => ReturnType<typeof importFile>) {
    setPage(0);
    setFilePreview(undefined);
    try {
      const result = parse();
      setFilePreview(result);
      setNote(`${result.tracks.length} 首已读取 · ${result.duplicates} 首重复 · ${result.failures.length} 首失败`);
    } catch (error) {
      setNote(String(error));
    }
  }

  function previewJson(value: string) {
    batch.reset();
    fileRevision.current++;
    prepare(() => importFile(JSON.parse(value.replace(/^\uFEFF/, ''))));
  }

  async function loadFile(file?: File) {
    if (!file) return;
    batch.reset();
    const revision = ++fileRevision.current;
    setFilePreview(undefined);
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
    const { name, tracks, source } = preview;
    const content = format === 'json'
      ? JSON.stringify({ name, platform: 'native', source, tracks }, null, 2)
      : exportCsv(name, tracks, source);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function startImport(urls: string[]) {
    if (!urls.length || batch.pending) return;
    if (urls.length > batchLimit) {
      setLinkNote(`每批最多导入 ${batchLimit} 个歌单`);
      return;
    }
    fileRevision.current++;
    setText('');
    setPage(0);
    setFilePreview(undefined);
    setNote('');
    setLinkNote('');
    batch.start(urls);
  }

  async function loadProfile(offset = 0) {
    if (profileRequest.current) return;
    const controller = new AbortController();
    profileRequest.current = controller;
    setProfilePending(true);
    setProfileNote('');
    if (!offset) {
      setChecked([]);
      setProfile(undefined);
    }
    try {
      const result = await playlistRequest<ProfilePage>('profile', link.trim(), offset, controller.signal);
      controller.signal.throwIfAborted();
      if (result.nextOffset !== null && result.nextOffset <= offset) throw new Error('平台未能返回下一页');
      setProfile(previous => {
        const list = new Map(previous && offset ? previous.playlists.map(item => [item.id, item]) : []);
        for (const item of result.playlists) list.set(item.id, item);
        return { playlists: [...list.values()], nextOffset: result.nextOffset };
      });
    } catch (error) {
      if (!controller.signal.aborted) setProfileNote(error instanceof Error ? error.message : '主页读取失败');
    } finally {
      if (profileRequest.current === controller) {
        profileRequest.current = null;
        setProfilePending(false);
      }
    }
  }

  const links = [...new Set(link.match(/https?:\/\/[^\s<>"‘’“”【】()（）]+/gi) ?? [link.trim()])].filter(Boolean);
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
          batch.reset();
          fileRevision.current++;
          setText(event.target.value);
          setFilePreview(undefined);
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
        <p>支持网易云、QQ 音乐、酷我、咪咕和汽水的歌单。网易云与 QQ 音乐可从公开主页选歌单。</p>
        <form onSubmit={event => { event.preventDefault(); startImport(links); }}>
          <label className="sr-only" htmlFor="playlist-link">歌单分享链接</label>
          <textarea id="playlist-link" value={link} onChange={event => {
            resetProfile();
            setLinkNote('');
            setLink(event.target.value);
          }} maxLength={batchLimit * 2048} placeholder="粘贴歌单、短链或公开主页" rows={3}/>
          <div className="playlist-actions">
            <button className="primary" disabled={!links.length || batch.pending}>导入链接</button>
            <button className="secondary" type="button" disabled={links.length !== 1 || profilePending || batch.pending}
              onClick={() => void loadProfile()}>查找公开歌单</button>
          </div>
        </form>
        {linkNote && <p className="hint" role="status">{linkNote}</p>}
        {profilePending && <p className="hint" role="status">正在读取公开歌单…</p>}
        {profileNote && <p className="hint" role="status">{profileNote}</p>}
        {profile && <section className="playlist-profile" aria-label="公开歌单">
          <p className="hint">{profile.playlists.length ? `已选 ${checked.length} / ${batchLimit} 个` : '本页没有公开歌单'}</p>
          {profile.playlists.map(item => <label key={item.id} className="profile-playlist">
            <input type="checkbox" checked={checked.includes(item.url)}
              disabled={!checked.includes(item.url) && checked.length >= batchLimit}
              onChange={event => setChecked(event.currentTarget.checked ? [...checked, item.url] : checked.filter(url => url !== item.url))}/>
            <span>{item.name}</span><small>{item.trackCount} 首</small>
          </label>)}
          <div className="playlist-actions">
            <button className="primary" disabled={!checked.length || batch.pending}
              onClick={() => startImport(checked)}>导入所选</button>
            {profile.nextOffset !== null && <button className="secondary" disabled={profilePending}
              onClick={() => void loadProfile(profile.nextOffset ?? 0)}>更多歌单</button>}
          </div>
        </section>}

      </section>
    </div>
    {batch.jobs.length > 0 && <section aria-label="导入进度">
      <div className="section-heading"><h2>导入进度</h2><span>已完成 {batch.jobs.length - batch.remaining.length} / {batch.jobs.length} 个歌单</span></div>
      {batch.jobs.length > 1 && <div className="playlist-jobs">
        {batch.jobs.map((job, index) => <button className="secondary" key={job.url}
          aria-pressed={batch.selected === index} onClick={() => { batch.select(index); setPage(0); }}>
          <strong>{job.preview?.name ?? `歌单 ${index + 1}`}</strong><small>{job.note}</small>
        </button>)}
      </div>}
      <p role="status" className="hint">{activeJob?.note}</p>
      <div className="playlist-actions">
        {batch.pending && <button className="secondary" onClick={batch.pause}>暂停导入</button>}
        {!batch.pending && batch.remaining.length > 0 &&
          <button className="secondary" onClick={batch.resume}>继续导入</button>}
        {!batch.pending && batch.jobs.length > 1 && (activeJob?.phase === 'failed' || activeJob?.phase === 'paused') &&
          <button className="secondary" onClick={batch.retry}>重试当前歌单</button>}
        {!batch.pending && (activeJob?.phase === 'done' || activeJob?.preview) &&
          <button className="secondary" onClick={() => { setPage(0); batch.refresh(); }}>重新同步当前歌单</button>}
      </div>
    </section>}
    {preview && <>
      <div className="section-heading"><h2>{preview.name}</h2><span>{preview.total} 首原始曲目</span></div>
      {preview.source && <div className="playlist-actions">
        <a className="secondary" href={playlistUrl(preview.source.platform, preview.source.id)} target="_blank" rel="noreferrer">查看原歌单</a>
        {!activeJob && <button className="secondary" onClick={() => {
          const source = preview.source;
          if (source) startImport([playlistUrl(source.platform, source.id)]);
        }}>重新同步歌单</button>}
      </div>}

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
