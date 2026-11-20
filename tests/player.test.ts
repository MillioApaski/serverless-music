import {it,expect} from 'vitest';
import {PlayerEngine} from '../packages/player/src/engine';
class FakeAudio extends EventTarget{src='';preload='';volume=1;duration=18;currentTime=0;async play(){this.dispatchEvent(new Event('play'))}pause(){this.dispatchEvent(new Event('pause'))}removeAttribute(){this.src=''}load(){}}
it('cancels stale selections and ignores a late resolution',async()=>{const audio=new FakeAudio();const engine=new PlayerEngine(audio as unknown as HTMLAudioElement);let release!:(url:string)=>void;let signal!:AbortSignal;const first=engine.select({id:'one',title:'one',artist:'a'},s=>{signal=s;return new Promise(resolve=>release=resolve)});await engine.select({id:'two',title:'two',artist:'b'},async()=>'/two.wav');release('/one.wav');await first;expect(signal.aborted).toBe(true);expect(audio.src).toBe('/two.wav');expect(engine.track?.id).toBe('two');expect(engine.state).toBe('playing')});
it('preserves playback when UI subscribers change',async()=>{const audio=new FakeAudio();const engine=new PlayerEngine(audio as unknown as HTMLAudioElement);const unsubscribe=engine.subscribe(()=>{});await engine.select({id:'one',title:'one',artist:'a'},async()=>'/one.wav');unsubscribe();const next=engine.subscribe(()=>{});expect(audio.src).toBe('/one.wav');expect(engine.state).toBe('playing');next()});
it('exposes browser autoplay blocking without automatic retry loops',async()=>{const audio=new FakeAudio();audio.play=async()=>{throw new DOMException('User gesture required','NotAllowedError')};const engine=new PlayerEngine(audio as unknown as HTMLAudioElement);await engine.select({id:'one',title:'one',artist:'a'},async()=>'/one.wav');expect(engine.state).toBe('blocked')});
it('clamps seeking and volume',()=>{const audio=new FakeAudio();const engine=new PlayerEngine(audio as unknown as HTMLAudioElement);engine.seek(999);expect(audio.currentTime).toBe(18);engine.setVolume(-1);expect(audio.volume).toBe(0);engine.setVolume(9);expect(audio.volume).toBe(1)});

const entry=(id:string)=>({id,title:id,artist:'测试音源',resolve:async()=>`/${id}.wav`});

it('honors next-up order on natural completion and wraps the queue in repeat-all',async()=>{
 const audio=new FakeAudio();
 const engine=new PlayerEngine(audio as unknown as HTMLAudioElement);
 engine.enqueue(entry('one'));
 engine.enqueue(entry('two'));
 engine.enqueue(entry('three'));
 await engine.playQueued('one');
 engine.enqueue(entry('three'),true);
 expect(engine.queue.map(item=>item.id)).toEqual(['one','three','two']);
 audio.dispatchEvent(new Event('ended'));
 await expect.poll(()=>audio.src).toBe('/three.wav');
 await engine.skip(1);
 expect(engine.track?.id).toBe('two');
 expect(engine.canSkip(1)).toBe(false);
 engine.setOrder('repeat-all');
 await engine.skip(1);
 expect(engine.track?.id).toBe('one');
});

it('repeats a completed track without applying repeat-one to a manual skip',async()=>{
 const audio=new FakeAudio();
 const engine=new PlayerEngine(audio as unknown as HTMLAudioElement);
 engine.enqueue(entry('one'));
 engine.enqueue(entry('two'));
 engine.setOrder('repeat-one');
 await engine.playQueued('one');
 audio.currentTime=18;
 audio.dispatchEvent(new Event('ended'));
 expect(audio.currentTime).toBe(0);
 expect(engine.track?.id).toBe('one');
 await engine.skip(1);
 expect(engine.track?.id).toBe('two');
});

it('plays a queued next track before shuffling and returns to the previous track',async()=>{
 const audio=new FakeAudio();
 const engine=new PlayerEngine(audio as unknown as HTMLAudioElement);
 for(const id of ['one','two','three'])engine.enqueue(entry(id));
 engine.setOrder('shuffle');
 await engine.playQueued('one');
 engine.enqueue(entry('three'),true);
 await engine.skip(1);
 expect(engine.track?.id).toBe('three');
 await engine.skip(-1);
 expect(engine.track?.id).toBe('one');
});
