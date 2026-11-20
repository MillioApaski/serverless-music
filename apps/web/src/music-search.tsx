import React, { useEffect, useRef, useState } from 'react';
import { Link2, Music2, Search } from 'lucide-react';
import type { Track } from '../../../packages/core/src/index';
import type { MetadataPlatform } from '../../../packages/playlist/src/providers';
import { compareTracks, type TrackMatch } from '../../../packages/playlist/src/match';

type PlatformFilter = MetadataPlatform | 'all';
type SearchGroup = { platform: MetadataPlatform; tracks: Track[]; hasMore: boolean; error?: string };
type SearchRequest = { query: string; platform: PlatformFilter; page: number };
const platformNames = { wy: '网易云音乐', tx: 'QQ 音乐' };
const associationKey = 'serverless-music:metadata-links';
const matchLabels: Partial<Record<TrackMatch, string>> = {
  isrc: 'ISRC 相同',
  likely: '歌手、专辑和时长相符',
  review: '同名同歌手，请核对版本',
};

function storedLinks(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(associationKey) ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).filter(([key, target]) =>
        /^(wy|tx):/.test(key) && typeof target === 'string' && /^(wy|tx):/.test(target),
      ));
    }
  } catch {}
  return {};
}

export function MusicSearch() {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [submitted, setSubmitted] = useState<SearchRequest>();
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState<Track>();
  const [links, setLinks] = useState(storedLinks);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function run(input: SearchRequest) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setGroups([]);
    setMessage('');
    setSubmitted(input);

    try {
      const response = await fetch('/api/metadata/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const data = await response.json() as { results?: SearchGroup[]; error?: { message: string } };
      if (controller.signal.aborted) return;
      if (!data.results) throw new Error(data.error?.message ?? '搜索请求失败');
      setGroups(data.results);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : '搜索请求失败');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  function compare(track: Track) {
    const other = track.identifiers[0]?.platform === 'wy' ? 'tx' : 'wy';
    const title = track.title.slice(0, 100);
    setReference(track);
    setQuery(title);
    setPlatform(other);
    void run({ query: title, platform: other, page: 1 });
  }

  function confirm(reference: Track, candidate: Track) {
    const updated = { ...links };
    for (const id of [reference.id, candidate.id]) {
      const previous = updated[id];
      delete updated[id];
      if (previous && updated[previous] === id) delete updated[previous];
    }
    if (links[reference.id] !== candidate.id) {
      updated[reference.id] = candidate.id;
      updated[candidate.id] = reference.id;
    }
    setLinks(updated);
    try {
      localStorage.setItem(associationKey, JSON.stringify(updated));
    } catch {
      setMessage('当前浏览器无法保存关联，本次页面内仍可使用');
    }
  }

  return <>
    <h1 className="page-title">音乐搜索</h1>
    <p className="page-intro">搜索网易云音乐和 QQ 音乐的曲目信息，核对同一录音在不同平台上的版本。</p>
    <form className="metadata-form" onSubmit={event => {
      event.preventDefault();
      if (!query.trim()) return;
      setReference(undefined);
      void run({ query: query.trim(), platform, page: 1 });
    }}>
      <label className="sr-only" htmlFor="metadata-query">歌曲或歌手</label>
      <input id="metadata-query" value={query} onChange={event => setQuery(event.target.value)}
        maxLength={100} placeholder="输入歌曲或歌手"/>
      <label className="sr-only" htmlFor="metadata-platform">搜索平台</label>
      <select id="metadata-platform" value={platform} onChange={event => setPlatform(event.target.value as PlatformFilter)}>
        <option value="all">全部平台</option>
        <option value="wy">网易云音乐</option>
        <option value="tx">QQ 音乐</option>
      </select>
      <button className="primary" disabled={!query.trim()}><Search size={15}/>搜索</button>
      {pending && <button className="secondary" type="button" onClick={() => {
        request.current?.abort();
        setMessage('搜索已取消');
      }}>取消搜索</button>}
    </form>
    {reference && <div className="metadata-reference">
      <Link2 size={17}/>
      <span>对比《{reference.title}》 · {reference.artists.join(' / ')}</span>
      <button className="secondary" onClick={() => setReference(undefined)}>结束对比</button>
    </div>}
    {(pending || message) && <p className="hint" role="status">{pending ? '正在查询平台…' : message}</p>}
    {groups.map(group => <section key={group.platform}>
      <div className="section-heading"><h2>{platformNames[group.platform]}</h2></div>
      {group.error && <p role="status" className="hint">{group.error}</p>}
      {!group.error && group.tracks.length === 0 && <p className="hint">这一页没有匹配的曲目。</p>}
      {group.tracks.map(track => {
        const label = reference && matchLabels[compareTracks(reference, track)];
        const linked = reference && links[reference.id] === track.id;
        const duration = Math.floor(track.duration ?? 0);
        return <div className="preview-track metadata-track" key={track.id}>
          <Music2 size={17}/>
          <div>
            <strong>{track.title}</strong>
            <small>{[track.artists.join(' / '), track.album, duration ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : ''].filter(Boolean).join(' · ')}</small>
            {label && <small>{label}</small>}
          </div>
          {reference
            ? (label || linked) && <button className="secondary" onClick={() => confirm(reference, track)}>{linked ? '取消关联' : '确认关联'}</button>
            : <button className="secondary" onClick={() => compare(track)}>找跨平台版本</button>}
        </div>;
      })}
    </section>)}
    {!pending && submitted && (message || groups.some(group => group.error)) &&
      <button className="secondary" onClick={() => void run(submitted)}>重试本页</button>}
    {!pending && submitted && (submitted.page > 1 || groups.some(group => group.hasMore)) &&
      <div className="playlist-actions playlist-pagination">
        <button className="secondary" disabled={submitted.page === 1}
          onClick={() => void run({ ...submitted, page: submitted.page - 1 })}>上一页</button>
        <span className="hint">第 {submitted.page} 页</span>
        <button className="secondary" disabled={!groups.some(group => group.hasMore)}
          onClick={() => void run({ ...submitted, page: submitted.page + 1 })}>下一页</button>
      </div>}
  </>;
}
