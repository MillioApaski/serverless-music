const { EVENT_NAMES, on, send } = lx;

on(EVENT_NAMES.request, async ({ source, action }) => {
  if (source !== 'local' || action !== 'musicUrl') {
    throw new Error('不支持的音源操作');
  }
  return 'https://audio-test.convert-alpha.cc/tone.wav';
});

send(EVENT_NAMES.inited, {
  sources: {
    local: { name: '外部测试音源', type: 'music', actions: ['musicUrl'], qualitys: [] },
  },
});
