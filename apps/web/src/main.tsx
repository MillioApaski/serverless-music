import React,{useState,useEffect,useRef,useReducer} from 'react';
import {createRoot} from 'react-dom/client';
import {Headphones,Compass,Radio,FolderInput,FlaskConical,ArrowUpRight,Play,Pause,SkipBack,SkipForward,Volume2,ShieldCheck,Check,LoaderCircle,ChevronRight,Music2,ExternalLink,AlertCircle,FileJson,Download,RotateCcw,ListMusic,X} from 'lucide-react';
import {SourceClient} from '../../../packages/source-runtime/src/client';
import {player,type PlaybackOrder,type QueueEntry} from '../../../packages/player/src/engine';
import {sha256,type Source,type Track} from '../../../packages/core/src/index';
import {testTracks,type TestTrack} from '../../../packages/core/src/test-tracks';
import './style.css';
type Page='overview'|'sources'|'import'|'evidence';
type PlaybackMode='direct'|'redirect'|'proxy';
type Result={name:string;status:'passed'|'failed';ms:number;detail:string};
const engine=player();
const playbackOrders: Record<PlaybackOrder,string> = {
 sequential:'顺序播放', shuffle:'随机播放', 'repeat-all':'列表循环', 'repeat-one':'单曲循环',
};
function readPreference(key:string){
 try{return localStorage.getItem('serverless-music:'+key)}catch{return null}
}
function savePreference(key:string,value:string){
 try{localStorage.setItem('serverless-music:'+key,value)}catch{/* Keep session settings when storage is unavailable. */}
}
function initialVolume(){
 const stored=readPreference('volume');
 const value=stored===null?NaN:Number(stored);
 return Number.isFinite(value)&&value>=0&&value<=1?value:.65;
}
function initialOrder():PlaybackOrder{
 const value=readPreference('order');
 return value&&Object.hasOwn(playbackOrders,value)?value as PlaybackOrder:'sequential';
}
async function api(path:string,body?:unknown,signal?:AbortSignal){const response=await fetch(path,body===undefined?{signal}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});const data:any=await response.json();if(!response.ok)throw new Error(data.error?.message||`HTTP ${response.status}`);return data}
const demoScript=`lx.on(lx.EVENT_NAMES.request, async () => 'isolated');lx.send(lx.EVENT_NAMES.inited,{sources:{local:{type:'music',actions:['musicUrl'],qualitys:[]}}});`;
function App(){
 const [page,setPage]=useState<Page>('overview');const [sources,setSources]=useState<Source[]>([]);const [error,setError]=useState('');const [identity,setIdentity]=useState('正在检查');const [running,setRunning]=useState(false);const [results,setResults]=useState<Result[]>([]);const [playMode,setPlayMode]=useState<PlaybackMode>('direct');const [labSourceId,setLabSourceId]=useState('poc-owned');const [progress,setProgress]=useState(0);const [duration,setDuration]=useState(18);const [volume,setVolume]=useState(initialVolume);
 const [labTrackId,setLabTrackId]=useState<TestTrack['id']>(testTracks[0].id);
 const [order,setOrder]=useState(initialOrder);
 const [queueOpen,setQueueOpen]=useState(false);
 const [,refreshPlayer]=useReducer((revision:number)=>revision+1,0);
 const state=engine.state;
 const [importText,setImportText]=useState('');const [tracks,setTracks]=useState<Track[]>([]);const [importNote,setImportNote]=useState('');const [link,setLink]=useState('');const [linkNote,setLinkNote]=useState('');
 const clients=useRef(new Set<SourceClient>());
 useEffect(()=>{window.scrollTo({top:0})},[page]);
 useEffect(()=>{api('/api/me').then(me=>setIdentity(me.mode==='local'?'本地验证身份':'Access 已验证')).catch(e=>{setIdentity('未连接');setError(e.message)});api('/api/sources').then(d=>setSources(d.sources)).catch(e=>setError(e.message));const unsub=engine.subscribe(()=>{refreshPlayer();if(engine.error)setError(engine.error)});const update=()=>{setProgress(engine.audio.currentTime||0);setDuration(Number.isFinite(engine.audio.duration)?engine.audio.duration:18)};engine.audio.addEventListener('timeupdate',update);engine.audio.addEventListener('loadedmetadata',update);return()=>{unsub();engine.audio.removeEventListener('timeupdate',update);engine.audio.removeEventListener('loadedmetadata',update);clients.current.forEach(c=>c.dispose())}},[]);
 useEffect(()=>{engine.setVolume(volume);savePreference('volume',String(volume))},[volume]);
 useEffect(()=>{engine.setOrder(order);savePreference('order',order)},[order]);
 const source=sources.find(s=>s.id==='poc-owned');
 const labSources=sources.filter(s=>s.enabled&&s.supportedPlatforms.includes('local')&&s.supportedActions.includes('musicUrl'));
 const labSource=labSources.find(s=>s.id===labSourceId);
 const labTracks=labSource?.id==='poc-owned'?testTracks:testTracks.slice(0,1);
 const labTrack=labTracks.find(track=>track.id===labTrackId)??testTracks[0];
 async function withClient<T>(fn:(c:SourceClient)=>Promise<T>){const client=new SourceClient();clients.current.add(client);try{return await fn(client)}finally{client.dispose();clients.current.delete(client)}}
 async function resolveTone(selectedSource:Source,track:TestTrack,mode:PlaybackMode,signal:AbortSignal){return withClient(async client=>{
  signal.addEventListener('abort',()=>client.dispose(),{once:true});
  const response=await fetch(selectedSource.scriptUrl,{signal});
  if(!response.ok)throw new Error('无法加载音源脚本');
  await client.load(await response.text(),selectedSource);
  const resolved=await client.request({source:'local',action:'musicUrl',info:{type:null,musicInfo:{endpoint:`${location.origin}${track.resolvePath}`}}});
  return (await api('/api/playback/session',{sourceId:selectedSource.id,url:resolved,mode},signal)).url;
 })}
 function queueEntry(selectedSource:Source,track:TestTrack,mode:PlaybackMode):QueueEntry{
  return {
   id:`${selectedSource.id}:${track.id}:${mode}`,
   title:`${track.title} · 测试旋律`,
   artist:`${selectedSource.name} · ${mode.toUpperCase()}`,
   resolve:signal=>resolveTone(selectedSource,track,mode,signal),
  };
 }
 function playSource(selectedSource:Source,track:TestTrack,mode:PlaybackMode){
  const entry=queueEntry(selectedSource,track,mode);
  setError('');
  engine.enqueue(entry);
  void engine.playQueued(entry.id);
 }
 function playTone(){if(source)playSource(source,testTracks[0],playMode)}
 function addSource(selectedSource:Source,next=false){
  engine.enqueue(queueEntry(selectedSource,labTrack,playMode),next);
  setQueueOpen(true);
 }
 function skip(direction:-1|1){
  setError('');
  void engine.skip(direction);
 }
 function togglePlayback(){
  if(state==='playing'){engine.pause();return}
  setError('');
  if(engine.track)void engine.resume();
  else if(engine.queue.length)skip(1);
  else playTone();
 }
 async function runChecks(){if(running||!source)return;setRunning(true);setResults([]);setPage('evidence');
  const record=async(name:string,fn:()=>Promise<string>)=>{const start=performance.now();try{const detail=await fn();setResults(r=>[...r,{name,status:'passed',ms:performance.now()-start,detail}])}catch(e){setResults(r=>[...r,{name,status:'failed',ms:performance.now()-start,detail:String(e)}])}};
  await record('QuickJS 初始化与 HTTP Bridge',()=>withClient(async c=>{const script=await(await fetch(source.scriptUrl)).text();await c.load(script,source);const value=await c.request({source:'local',action:'musicUrl',info:{musicInfo:{endpoint:`${location.origin}/api/fixtures/resolve`}}});if(value!==`${location.origin}/api/fixtures/tone.wav`)throw new Error('结果不匹配');return 'WASM 内的异步回调已通过同源 Bridge 完成'}));
  await record('宿主对象隔离',()=>withClient(async c=>{const script=demoScript.replace("'isolated'","[typeof window,typeof document,typeof fetch,typeof indexedDB].join(',')");await c.load(script,{...source,sha256:await sha256(script)});const result=await c.request({source:'local',action:'musicUrl',info:{}});if(result!=='undefined,undefined,undefined,undefined')throw new Error(result);return '脚本无法访问 window、document、fetch、IndexedDB'}));
  await record('无限循环中断',()=>withClient(async c=>{const script=demoScript.replace("async () => 'isolated'","async () => {while(true){}}");await c.load(script,{...source,sha256:await sha256(script)});try{await c.request({source:'local',action:'musicUrl',info:{}})}catch(e){if(/interrupt|timeout/i.test(String(e)))return '循环已中断，工作线程已销毁';throw e}throw new Error('未中断')}));
  await record('超时后的新实例恢复',()=>withClient(async c=>{await c.load(demoScript,{...source,sha256:await sha256(demoScript)});if(await c.request({source:'local',action:'musicUrl',info:{}})!=='isolated')throw new Error('恢复失败');return '全新运行时可以继续解析'}));
  await record('Range 字节读取',async()=>{const r=await fetch('/api/fixtures/tone.wav',{headers:{Range:'bytes=44-107'}});const b=await r.arrayBuffer();if(r.status!==206||b.byteLength!==64||!r.headers.get('content-range')?.startsWith('bytes 44-107/'))throw new Error('Range 不符合预期');return '206 / Content-Range / 64 字节均符合预期'});
  setRunning(false);
 }
 async function previewImport(value=importText){try{const data=await api('/api/playlists/preview',JSON.parse(value));setTracks(data.tracks);setImportNote(`${data.tracks.length} 首已读取 · ${data.duplicates} 首重复 · ${data.failures.length} 首失败`)}catch(e){setImportNote(String(e));setTracks([])}}
 function example(){const text=JSON.stringify({name:'我的测试歌单',platform:'tx',tracks:[{songmid:'owned-example-id',songname:'微光（元数据示例）',singer:[{name:'Serverless Music'}],albumname:'测试歌单',interval:18}]},null,2);setImportText(text);void previewImport(text)}
 const passed=results.filter(r=>r.status==='passed').length;
 return <div className="app-shell"><aside className="sidebar"><button className="brand" onClick={()=>setPage('overview')}><span className="brand-mark"><Headphones size={21}/></span><span>Serverless<span className="brand-sub">MUSIC</span></span></button><div className="nav-caption">工作空间</div><nav>{([{id:'overview',label:'概览',icon:Compass},{id:'sources',label:'音源实验室',icon:Radio},{id:'import',label:'歌单导入',icon:FolderInput},{id:'evidence',label:'验证记录',icon:FlaskConical}] as const).map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}><item.icon size={18}/>{item.label}{item.id==='evidence'&&results.length>0&&<span className="nav-count">{results.length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="secure"><ShieldCheck size={17}/><span>{identity}</span><span className="status-dot"/></div><p>Phase 1 · 基础播放器<br/>音源、歌单与播放器独立运行</p></div></aside>
 <div className="workspace"><header><div className="breadcrumb">工作空间 <ChevronRight size={13}/> {({overview:'概览',sources:'音源实验室',import:'歌单导入',evidence:'验证记录'})[page]}</div><div className="header-right"><span className="build-tag">PHASE 1</span><button className="avatar" title="当前验证身份">S</button></div></header><main>
 {error&&<div className="error-banner" role="alert"><AlertCircle size={17}/>{error}<button onClick={()=>setError('')}>关闭</button></div>}
 {page==='overview'&&<><div className="eyebrow"><span/> SERVERLESS MUSIC LAB</div><section className="hero"><div><h1>音乐，自由流动。</h1><p>让歌单跨越平台，让播放回归简单。<br/>从一个安全、轻盈的音源运行时开始。</p><div className="hero-actions"><button className="primary" onClick={playTone} disabled={!source}><Play size={15} fill="currentColor"/>试听自有音频</button><button className="text-button" onClick={()=>void runChecks()} disabled={!source||running}>运行技术验证 <ArrowUpRight size={16}/></button></div></div><div className="record-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="record"><div className="record-label"><span>SM</span><small>ORIGINAL TEST AUDIO</small><i/></div></div><div className="record-caption"><span className="tiny-dot"/> PLAY YOUR OWN FREQUENCY</div></div></section>
 <div className="section-heading"><h2>从这里开始</h2><span>三个独立模块，一条完整播放链路</span></div><div className="feature-grid"><button className="feature" onClick={()=>setPage('sources')}><span className="feature-icon violet"><Radio size={20}/></span><span className="feature-number">01</span><h3>隔离运行音源</h3><p>在 Web Worker 内运行 QuickJS，<br/>脚本只通过受限接口访问网络。</p><span className="feature-link">打开音源实验室 <ArrowUpRight size={15}/></span></button><button className="feature" onClick={()=>setPage('import')}><span className="feature-icon amber"><FolderInput size={20}/></span><span className="feature-number">02</span><h3>带上你的歌单</h3><p>预览 JSON 元数据，保留原生 ID。<br/>无需提前解析音乐播放地址。</p><span className="feature-link">预览歌单数据 <ArrowUpRight size={15}/></span></button><button className="feature" onClick={()=>void runChecks()} disabled={!source||running}><span className="feature-icon mint"><FlaskConical size={20}/></span><span className="feature-number">03</span><h3>让结果可验证</h3><p>在当前浏览器执行沙箱与 Range 检查。<br/>每一项状态都来自实际运行。</p><span className="feature-link">{running?'正在运行…':'执行浏览器验证'} <ArrowUpRight size={15}/></span></button></div>
 <div className="section-heading audio-heading"><h2>测试音频</h2><span>自有生成旋律 · 无第三方音乐资源</span></div><div className="track-table"><div className="table-head"><span>#</span><span>歌曲</span><span>来源</span><span>时长</span><span/></div>{testTracks.map((track,index)=><div className="track-row" key={track.id}>
  <span className="track-index">{String(index+1).padStart(2,'0')}</span>
  <div className="track-title"><span className="mini-cover"><Music2 size={22}/></span><div><strong>{track.title}</strong><small>Serverless Music · 原创测试旋律</small></div></div>
  <span className="source-pill">自有测试音源</span><span className="muted">{formatTime(track.duration)}</span>
  <button className="icon-button" aria-label={`播放${track.title}`} onClick={()=>{if(source)playSource(source,track,playMode)}} disabled={!source}><Play size={17}/></button>
 </div>)}</div><div className="gate-note"><ShieldCheck size={18}/><p>技术验证已收尾。独立测试音源已验证播放链路和 Workers CPU 开销。</p><button onClick={()=>setPage('evidence')}>查看进度 <ChevronRight size={14}/></button></div></>}
 {page==='sources'&&<><div className="eyebrow">SOURCE LAB</div><h1 className="page-title">音源实验室</h1><p className="page-intro">脚本执行在独立的 QuickJS 虚拟机中，页面与用户数据不向脚本开放。</p><div className="section-heading"><h2>音源注册表</h2><span>{sources.length} 个测试音源 · 第三方音源尚未接入</span></div>{sources.map(s=><div className="source-detail" key={s.id}><div className="source-top"><span className="feature-icon violet"><Radio size={22}/></span><div><h3>{s.name}</h3><p>v{s.version} · {s.license} · 本项目自行编写</p></div><span className="badge">测试用</span></div><p>{s.authorization}</p><div className="hash">SHA-256 <code>{s.sha256}</code></div><div className="source-footer"><span>local / musicUrl</span><span>{s.allowedHosts.length?s.allowedHosts.map(policy=>policy.host+policy.pathPrefix).join('、'):'网络权限：固定的同源测试端点'}</span></div></div>)}<div className="section-heading"><h2>播放链路</h2></div>
 <label className="source-picker">试听音源
  <select value={labSourceId} onChange={event=>setLabSourceId(event.target.value)} disabled={!labSources.length}>
   {labSources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
  </select>
 </label>
 <label className="source-picker">试听曲目
  <select value={labTrack.id} onChange={event=>{const track=labTracks.find(item=>item.id===event.target.value);if(track)setLabTrackId(track.id)}} disabled={!labSource||labTracks.length===1}>
   {labTracks.map(track=><option key={track.id} value={track.id}>{track.title}</option>)}
  </select>
 </label>
 <div className="mode-options">{([{id:'direct',title:'Direct',text:'直接读取已批准的音频地址'},{id:'redirect',title:'Redirect',text:'通过短期凭证返回 302 跳转'},{id:'proxy',title:'Proxy',text:'同源流式返回，支持 Range'}] as const).map(m=><button className={playMode===m.id?'selected':''} key={m.id} onClick={()=>setPlayMode(m.id)}><strong>{m.title}</strong><small>{m.text}</small>{playMode===m.id&&<Check size={17}/>}</button>)}</div><p className="hint">自有音源提供两首测试曲。外部源提供《微光》，可验证跨域跳转与代理回源。</p><button className="primary" onClick={()=>{if(labSource)playSource(labSource,labTrack,playMode)}} disabled={!labSource}><Play size={15}/>用 {playMode} 模式试听</button>
 <div className="queue-actions">
  <button className="secondary" disabled={!labSource} onClick={()=>{if(labSource)addSource(labSource)}}>加入队列</button>
  <button className="secondary" disabled={!labSource} onClick={()=>{if(labSource)addSource(labSource,true)}}>下一首播放</button>
 </div><div className="sandbox-box"><FlaskConical size={24}/><div><h3>检查沙箱能否可靠退出</h3><p>实际执行无限循环、宿主对象隔离、异步 HTTP 和超时恢复检查。</p></div><button className="secondary" onClick={()=>void runChecks()} disabled={!source||running}>运行验证 <ArrowUpRight size={15}/></button></div></>}
 {page==='import'&&<><div className="eyebrow">YOUR PLAYLISTS</div><h1 className="page-title">把歌单带过来。</h1><p className="page-intro">先验证数据与平台标识。当前提供本地 JSON 预览，线上歌单抓取尚未启用。</p><div className="import-layout"><section className="import-panel"><div className="section-heading"><h2>JSON 元数据</h2><button className="text-button" onClick={example}>填入示例</button></div><label htmlFor="playlist-json" className="hint">格式：name、platform（wy / tx / native）、tracks</label><textarea id="playlist-json" value={importText} onChange={e=>setImportText(e.target.value)} placeholder={'{\n  "name": "我的歌单",\n  "platform": "tx",\n  "tracks": []\n}'}/><div className="import-actions"><label className="secondary file-label"><FileJson size={16}/>选择 JSON<input type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>1024*1024){setImportNote('文件超过 1 MiB');return}setImportText(await file.text())}}/></label><button className="primary" onClick={()=>void previewImport()} disabled={!importText.trim()}>预览歌单 <ChevronRight size={15}/></button></div><p role="status" className="hint">{importNote}</p></section><section className="import-help"><h3>保留属于歌曲的信息</h3><p>歌曲的平台 ID 和原始字段会一并保留，方便后续选择兼容的播放音源。</p><div className="subtle-line"/><h3>识别分享链接</h3><p>支持识别网易云与 QQ 音乐标准歌单链接；此步骤不会抓取歌曲。</p><label className="sr-only" htmlFor="playlist-link">歌单分享链接</label><input id="playlist-link" value={link} onChange={e=>setLink(e.target.value)} placeholder="粘贴歌单链接"/><button className="secondary" disabled={!link} onClick={()=>api('/api/playlists/identify',{url:link}).then(d=>setLinkNote(`${d.platform} · 歌单 ID ${d.id}`)).catch(e=>setLinkNote(e.message))}>识别链接 <ExternalLink size={14}/></button><p className="hint" role="status">{linkNote}</p></section></div>{tracks.length>0&&<><div className="section-heading"><h2>导入预览</h2><span>仅预览 · 尚未写入云端</span></div>{tracks.slice(0,100).map(t=><div className="preview-track" key={t.id}><Music2 size={19}/><div><strong>{t.title}</strong><small>{t.artists.join(' / ')}</small></div><code>{t.identifiers.map(i=>`${i.platform}:${i.id}`).join(', ')}</code></div>)}{tracks.length>100&&<p className="hint">已预览前 100 首，共 {tracks.length} 首。</p>}</>}</>}
 {page==='evidence'&&<><div className="eyebrow">MEASURE, DON'T ASSUME</div><div className="evidence-title"><div><h1 className="page-title">验证记录</h1><p className="page-intro">浏览器检查与云端验收分别记录。耗时为当前设备的墙钟时间。</p></div><button className="primary" onClick={()=>void runChecks()} disabled={!source||running}>{running?<LoaderCircle className="spin" size={16}/>:<RotateCcw size={16}/>} {running?'正在验证':'重新验证'}</button></div><div className="evidence-summary"><div><strong>{passed}<small> / {results.length||'—'}</small></strong><span>浏览器检查通过</span></div><div><strong>达标</strong><span>测试音源 Workers CPU P95</span></div><div><strong>已完成</strong><span>Phase 0 技术验证</span></div></div><div className="section-heading"><h2>当前浏览器</h2><span>{running?'执行中，请保留页面':'结果仅代表本次运行'}</span></div>{results.length===0?<div className="empty-state"><FlaskConical size={34}/><h3>还没有运行记录</h3><p>开始验证后，这里会显示实际结果。</p></div>:<div className="results-list">{results.map((r,i)=><div className="result" key={i}><span className={`result-symbol ${r.status}`}>{r.status==='passed'?<Check size={16}/>:<AlertCircle size={16}/>}</span><div><strong>{r.name}</strong><small>{r.detail}</small></div><code>{Math.round(r.ms)} ms</code></div>)}</div>}<div className="section-heading"><h2>后续验收</h2></div><div className="pending-list"><p><span/>Cloudflare Access：真实身份会话与全站访问保护</p><p><span/>内存：浏览器长期运行与 Workers 长流内存</p><p><span/>真实音源：授权依据、LX 加密兼容及可播放性</p><p><span/>线上歌单：平台端点、分页与部分失败恢复</p></div><p className="hint">Phase 0 已按约定范围收尾。生产验收仍需覆盖以上项目。</p></>}
 <footer>Serverless Music <span>轻盈运行，认真验证。</span><span className="footer-version">PHASE 1 / OPEN DEVELOPMENT</span></footer></main></div>
 {queueOpen&&<aside className="player-queue" id="player-queue" aria-label="播放队列">
  <div className="queue-heading">
   <h2>播放队列 <small>{engine.queue.length}</small></h2>
   <button className="icon-button" aria-label="关闭播放队列" onClick={()=>setQueueOpen(false)}><X size={18}/></button>
  </div>
  <div className="queue-settings">
   <label>播放顺序
    <select value={order} onChange={event=>setOrder(event.target.value as PlaybackOrder)}>
     {Object.entries(playbackOrders).map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select>
   </label>
   <label>音量 <input type="range" min="0" max="1" step=".01" value={volume} onChange={event=>setVolume(Number(event.target.value))}/></label>
  </div>
  {engine.queue.length===0?<p className="hint">可以从音源实验室添加试听曲目。</p>:<ol className="queue-list">
   {engine.queue.map(entry=><li key={entry.id} className={entry.id===engine.track?.id?'current':''}>
    <button className="queue-track" aria-current={entry.id===engine.track?.id?true:undefined} onClick={()=>{setError('');void engine.playQueued(entry.id)}}>
     <strong>{entry.title}</strong><small>{entry.artist}</small>
    </button>
    <button className="icon-button" aria-label={`移除 ${entry.artist}`} disabled={entry.id===engine.track?.id} onClick={()=>engine.remove(entry.id)}><X size={16}/></button>
   </li>)}
  </ol>}
 </aside>}
 <div className="player-bar">
  <div className="now-playing">
   <span className="mini-cover large"><Music2 size={24}/></span>
   <div><strong>{engine.track?.title||'还没有开始播放'}</strong><small>{engine.track?.artist||'选择自有测试音频，听一小段旋律'}</small></div>
  </div>
  <div className="player-center">
   <div className="player-controls">
    <button className="icon-button" aria-label="上一首" disabled={!engine.canSkip(-1)} onClick={()=>skip(-1)}><SkipBack size={17}/></button>
    <button className="play-button" aria-label={state==='playing'?'暂停':'播放'} onClick={togglePlayback} disabled={(!source&&!engine.queue.length)||state==='resolving'}>
     {state==='resolving'?<LoaderCircle className="spin" size={18}/>:state==='playing'?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}
    </button>
    <button className="icon-button" aria-label="下一首" disabled={!engine.canSkip(1)} onClick={()=>skip(1)}><SkipForward size={17}/></button>
    <button className="icon-button queue-toggle" aria-controls={queueOpen?'player-queue':undefined} aria-expanded={queueOpen} aria-label="播放队列" onClick={()=>setQueueOpen(!queueOpen)}><ListMusic size={19}/></button>
   </div>
   <div className="progress"><span>{formatTime(progress)}</span><input aria-label="播放进度" type="range" min="0" max={duration} step=".1" value={Math.min(progress,duration)} onChange={event=>{engine.seek(Number(event.target.value));setProgress(Number(event.target.value))}}/><span>{formatTime(duration)}</span></div>
  </div>
  <div className="player-extra"><Volume2 size={17}/><input aria-label="播放器音量" type="range" min="0" max="1" step=".01" value={volume} onChange={event=>setVolume(Number(event.target.value))}/></div>
 </div></div>;
}
function formatTime(t:number){return `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`}
createRoot(document.getElementById('root')!).render(<App/>);
