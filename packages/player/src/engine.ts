export interface Playable {
  id: string;
  title: string;
  artist: string;
}

export type PlayerState = 'idle' | 'resolving' | 'playing' | 'paused' | 'blocked' | 'error';
export type PlaybackOrder = 'sequential' | 'shuffle' | 'repeat-all' | 'repeat-one';
type ResolveAudio = (signal: AbortSignal) => Promise<string>;

export interface QueueEntry extends Playable {
  resolve: ResolveAudio;
}

export class PlayerEngine {
  private generation = 0;
  private controller?: AbortController;
  private listeners = new Set<() => void>();
  private entries: QueueEntry[] = [];
  private shufflePlayed = new Set<string>();
  private shuffleHistory: string[] = [];
  private nextUp: string[] = [];

  state: PlayerState = 'idle';
  track?: Playable;
  error = '';
  order: PlaybackOrder = 'sequential';

  constructor(readonly audio: HTMLAudioElement) {
    audio.preload = 'metadata';
    audio.addEventListener('play', () => {
      this.state = 'playing';
      this.emit();
    });
    audio.addEventListener('pause', () => {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.emit();
      }
    });
    audio.addEventListener('error', () => {
      this.state = 'error';
      this.error = '音频加载失败';
      this.emit();
    });
    audio.addEventListener('ended', () => {
      if (this.order === 'repeat-one' && this.track) {
        this.seek(0);
        void this.resume();
      } else if (this.canSkip(1)) {
        void this.skip(1);
      } else {
        this.state = 'paused';
        this.emit();
      }
    });
  }

  get queue(): readonly QueueEntry[] {
    return this.entries;
  }

  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };

  private emit() {
    this.listeners.forEach(callback => callback());
  }

  setOrder(order: PlaybackOrder) {
    this.order = order;
    this.shufflePlayed.clear();
    this.shuffleHistory = [];
    this.emit();
  }

  enqueue(entry: QueueEntry, next = false) {
    const existing = this.entries.findIndex(item => item.id === entry.id);
    if (entry.id === this.track?.id || (existing >= 0 && !next)) return;
    if (existing >= 0) this.entries.splice(existing, 1);
    const current = this.entries.findIndex(item => item.id === this.track?.id);
    this.entries.splice(next ? current + 1 : this.entries.length, 0, entry);
    if (next) this.nextUp = [entry.id, ...this.nextUp.filter(id => id !== entry.id)];
    this.emit();
  }

  remove(id: string) {
    if (id === this.track?.id) return;
    this.entries = this.entries.filter(entry => entry.id !== id);
    this.nextUp = this.nextUp.filter(item => item !== id);
    this.shufflePlayed.delete(id);
    this.shuffleHistory = this.shuffleHistory.filter(item => item !== id);
    this.emit();
  }

  async playQueued(id: string) {
    const entry = this.entries.find(item => item.id === id);
    if (!entry) return;
    this.nextUp = this.nextUp.filter(item => item !== id);
    if (this.order === 'shuffle' && this.track && this.track.id !== id) {
      this.shuffleHistory.push(this.track.id);
      this.shufflePlayed.add(this.track.id);
    }
    this.shufflePlayed.add(id);
    await this.select(entry, entry.resolve);
  }

  private adjacent(direction: -1 | 1) {
    const current = this.entries.findIndex(item => item.id === this.track?.id);
    if (current < 0) return direction === 1 ? this.entries[0] : undefined;
    const candidate = this.entries[current + direction];
    if (candidate || this.order !== 'repeat-all') return candidate;
    return direction === 1 ? this.entries[0] : this.entries.at(-1);
  }

  canSkip(direction: -1 | 1) {
    if (direction === 1 && this.nextUp.length) return true;
    if (this.order !== 'shuffle') return Boolean(this.adjacent(direction));
    return direction === 1
      ? this.entries.some(entry => entry.id !== this.track?.id)
      : this.shuffleHistory.length > 0;
  }

  async skip(direction: -1 | 1) {
    if (direction === 1 && this.nextUp.length) {
      await this.playQueued(this.nextUp[0]);
      return;
    }
    if (this.order !== 'shuffle') {
      const entry = this.adjacent(direction);
      if (entry) await this.playQueued(entry.id);
      return;
    }
    if (direction === -1) {
      const previousId = this.shuffleHistory.pop();
      const previous = this.entries.find(entry => entry.id === previousId);
      if (previous) await this.select(previous, previous.resolve);
      return;
    }
    const others = this.entries.filter(entry => entry.id !== this.track?.id);
    if (!others.length) return;
    let candidates = others.filter(entry => !this.shufflePlayed.has(entry.id));
    if (!candidates.length) {
      this.shufflePlayed.clear();
      candidates = others;
    }
    await this.playQueued(candidates[Math.floor(Math.random() * candidates.length)].id);
  }

  async select(track: Playable, resolve: ResolveAudio) {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.track = track;
    this.state = 'resolving';
    this.error = '';
    this.emit();
    try {
      const url = await resolve(controller.signal);
      if (generation !== this.generation) return;
      this.audio.src = url;
      await this.audio.play();
      if (generation !== this.generation) return;
      this.state = 'playing';
      this.emit();
      this.updateMediaSession(track);
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'error';
      this.error = String(error);
      this.emit();
    }
  }

  private updateMediaSession(track: Playable) {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title: track.title, artist: track.artist });
    session.setActionHandler('play', () => void this.resume());
    session.setActionHandler('pause', () => this.pause());
    session.setActionHandler('seekto', detail => {
      if (detail.seekTime !== undefined) this.seek(detail.seekTime);
    });
    session.setActionHandler('previoustrack', () => void this.skip(-1));
    session.setActionHandler('nexttrack', () => void this.skip(1));
  }

  async resume() {
    if (this.state === 'error' && this.track && this.entries.some(entry => entry.id === this.track?.id)) {
      await this.playQueued(this.track.id);
      return;
    }
    const generation = this.generation;
    try {
      await this.audio.play();
      if (generation !== this.generation) return;
      this.state = 'playing';
      this.error = '';
    } catch (error) {
      if (generation !== this.generation) return;
      this.state = error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'error';
      this.error = String(error);
    }
    this.emit();
  }

  pause() {
    this.audio.pause();
    this.state = 'paused';
    this.emit();
  }

  seek(time: number) {
    if (Number.isFinite(time) && time >= 0 && Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.min(time, this.audio.duration);
    }
  }

  setVolume(value: number) {
    if (Number.isFinite(value)) this.audio.volume = Math.max(0, Math.min(1, value));
  }

  reset() {
    ++this.generation;
    this.controller?.abort();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.track = undefined;
    this.shuffleHistory = [];
    this.shufflePlayed.clear();
    this.state = 'idle';
    this.error = '';
    this.emit();
  }
}

let singleton: PlayerEngine | undefined;
export const player = () => singleton ??= new PlayerEngine(new Audio());
