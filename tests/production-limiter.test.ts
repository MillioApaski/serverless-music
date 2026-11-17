import { describe, expect, it, vi } from 'vitest';

// Authentication is covered by security.test.ts. Stub only that boundary here
// so these requests exercise the real production limiter and routing paths.
vi.mock('../apps/worker/src/auth', () => ({
  authenticate: vi.fn(async () => ({ id: 'verified-user-for-limiter', mode: 'access' })),
}));

import { app } from '../apps/worker/src/index';

const origin = 'https://music.example.com';
const bridgeBody = { url: `${origin}/api/fixtures/resolve` };
type Limiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

function post(path: string, body: unknown, limiter?: Limiter) {
  return app.request(`${origin}${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, { APP_ENV: 'production', HTTP_LIMITER: limiter });
}

describe('production HTTP limiter', () => {
  it('refuses bridge requests when the binding is missing', async () => {
    const response = await post('/api/sources/poc-owned/request', bridgeBody);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'LIMITER_CONFIGURATION', message: '请求限流尚未配置' },
    });
  });

  it('allows the bridge when the bound limiter accepts the verified user', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const response = await post('/api/sources/poc-owned/request', bridgeBody, { limit });
    expect(response.status).toBe(200);
    expect(limit).toHaveBeenCalledWith({ key: 'verified-user-for-limiter' });
    const data = await response.json() as { statusCode: number; body: string };
    expect(data.statusCode).toBe(200);
    expect(JSON.parse(data.body).url).toBe(`${origin}/api/fixtures/tone.wav`);
  });

  it('returns 429 when the limiter rejects a request', async () => {
    const response = await post('/api/sources/poc-owned/request', bridgeBody, {
      limit: async () => ({ success: false }),
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: '请求过于频繁' },
    });
  });

  it('uses the same user allowance for bridge and playback sessions', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const bridge = await post('/api/sources/poc-owned/request', bridgeBody, { limit });
    const session = await post('/api/playback/session', {
      sourceId: 'poc-owned', url: `${origin}/api/fixtures/tone.wav`, mode: 'direct',
    }, { limit });
    expect(bridge.status).toBe(200);
    expect(session.status).toBe(200);
    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit.mock.calls).toEqual([
      [{ key: 'verified-user-for-limiter' }],
      [{ key: 'verified-user-for-limiter' }],
    ]);
  });
});
