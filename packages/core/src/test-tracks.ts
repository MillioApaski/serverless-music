export const testTracks = [
  {
    id: 'glow',
    title: '微光',
    duration: 18,
    audioPath: '/api/fixtures/tone.wav',
    resolvePath: '/api/fixtures/resolve',
  },
  {
    id: 'dusk',
    title: '暮色',
    duration: 12,
    audioPath: '/api/fixtures/dusk.wav',
    resolvePath: '/api/fixtures/resolve/dusk',
  },
] as const;

export type TestTrack = (typeof testTracks)[number];
