import React, { useRef, useState } from 'react';
import { ChevronRight, Download, ExternalLink, FileJson, Music2 } from 'lucide-react';
import { importFile, parsePlaylistLink } from '../../../packages/playlist/src/import';
import { exportCsv, importCsv } from '../../../packages/playlist/src/csv';

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
  const [preview, setPreview] = useState<ReturnType<typeof importFile>>();
  const [note, setNote] = useState('');
  const [page, setPage] = useState(0);
  const [link, setLink] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const fileRevision = useRef(0);

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
    fileRevision.current++;
    prepare(() => importFile(JSON.parse(value.replace(/^\uFEFF/, ''))));
  }

  async function loadFile(file?: File) {
    if (!file) return;
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

  function identify() {
    try {
      const { platform, id } = parsePlaylistLink(link);
      setLinkNote(`${platform} · 歌单 ID ${id}`);
    } catch (error) {
      setLinkNote(error instanceof Error ? error.message : String(error));
    }
  }

  const totalPages = Math.ceil((preview?.tracks.length ?? 0) / pageSize);
  return <>
    <h1 className="page-title">歌单导入</h1>
    <p className="page-intro">导入本地 JSON 或 CSV，检查曲目和平台标识，再导出校验后的歌单。</p>
    <div className="import-layout">
      <section className="import-panel">
        <div className="section-heading">
          <h2>本地歌单</h2>
          <button className="text-button" onClick={() => { setText(exampleText); previewJson(exampleText); }}>填入示例</button>
        </div>
        <label htmlFor="playlist-json" className="hint">粘贴含 name、platform 和 tracks 的 JSON</label>
        <textarea id="playlist-json" value={text} onChange={event => {
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
        <h3>识别分享链接</h3>
        <p>可识别网易云和 QQ 音乐的标准链接及歌单 ID。</p>
        <label className="sr-only" htmlFor="playlist-link">歌单分享链接</label>
        <input id="playlist-link" value={link} onChange={event => {
          setLink(event.target.value);
          setLinkNote('');
        }} placeholder="粘贴歌单链接"/>
        <button className="secondary" disabled={!link.trim()} onClick={identify}>识别链接 <ExternalLink size={14}/></button>
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
