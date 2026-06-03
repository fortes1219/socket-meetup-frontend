import { beforeEach, describe, expect, it } from 'vitest';
import { createLeaderCoordinator, type LeaderCoordinator } from '@/service/leader/leader-coordinator-core';
import { createFakeLeaderEnv, type FakeLeaderEnv } from '../../helpers/fake-leader-env';

const OPTIONS = {
  heartbeatInterval: 1000,
  staleThreshold: 3000,
  claimDelayBase: 200,
  claimDelayJitter: 200
};

let env: FakeLeaderEnv;

function makeCoordinator(
  id: string,
  visibility: ReturnType<FakeLeaderEnv['makeVisibility']>,
  seed: number
): LeaderCoordinator {
  return createLeaderCoordinator(
    {
      channel: env.makeChannel(id),
      storage: env.storage,
      timers: env.timers,
      clock: env.clock,
      random: env.seededRandom(seed),
      visibility
    },
    { ...OPTIONS, instanceId: id }
  );
}

beforeEach(() => {
  env = createFakeLeaderEnv();
});

describe('leader election', () => {
  it('單一 visible tab 在 claim delay 後成為 leader', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);
    expect(a.leaderTerm.value?.counter).toBe(1);
  });

  it('第二個 tab 收到 heartbeat 後成為 follower、不競選', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);

    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);

    expect(a.isLeader.value).toBe(true);
    expect(b.isLeader.value).toBe(false);
    expect(b.role.value).toBe('follower');
  });

  it('leader 失聯超過 stale threshold → follower 接手', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);
    expect(b.isLeader.value).toBe(false);

    env.disconnect('a'); // 模擬 leader crash：heartbeat 不再送達
    env.advance(4000);

    expect(b.isLeader.value).toBe(true);
    expect(b.leaderTerm.value?.counter).toBe(2);
  });

  it('並發 claim 收斂為唯一 leader（deterministic）', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 5);
    const b = makeCoordinator('b', env.makeVisibility(true), 9);
    a.start();
    b.start();
    env.advance(600);

    const leaders = [a, b].filter(coordinator => coordinator.isLeader.value);
    expect(leaders).toHaveLength(1);
  });

  it('hidden tab 不主動 claim；變 visible 後才競選', () => {
    const visibility = env.makeVisibility(false);
    const c = makeCoordinator('c', visibility, 3);
    c.start();
    env.advance(1000);
    expect(c.isLeader.value).toBe(false);

    visibility.set(true);
    env.advance(600);
    expect(c.isLeader.value).toBe(true);
  });

  it('leader 變 hidden 不會因此 step down', () => {
    const visibilityA = env.makeVisibility(true);
    const a = makeCoordinator('a', visibilityA, 1);
    a.start();
    env.advance(600);
    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    visibilityA.set(false);
    env.advance(1000);
    expect(a.isLeader.value).toBe(true);
  });

  it('hidden leader 收到較新 term 立即 step down（不等回 visible）', () => {
    const visibilityA = env.makeVisibility(true);
    const a = makeCoordinator('a', visibilityA, 1);
    a.start();
    env.advance(600);
    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);

    // A 轉 hidden 且 heartbeat 暫時送不到 B → B 因 stale 接手；A 在 disconnect 期間漏接
    visibilityA.set(false);
    env.disconnect('a');
    env.advance(4000);
    expect(a.isLeader.value).toBe(true);
    expect(b.isLeader.value).toBe(true);

    // A 仍 hidden，重新收到 B 的較新 heartbeat → 立即 step down
    env.reconnect('a');
    env.advance(1100);
    expect(a.isLeader.value).toBe(false);
  });

  it('hidden 期間漏接 message，回 visible 才 silent release', () => {
    const visibilityA = env.makeVisibility(true);
    const a = makeCoordinator('a', visibilityA, 1);
    a.start();
    env.advance(600);
    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);

    visibilityA.set(false);
    env.disconnect('a');
    env.advance(4000);
    expect(a.isLeader.value).toBe(true); // 漏接，仍以為自己是 leader

    // resume：channel 復原同時回 visible，但不前進時間（沒有 periodic heartbeat）
    env.reconnect('a');
    visibilityA.set(true);
    expect(a.isLeader.value).toBe(false); // 由 visible re-sync（request-leader）補判而 release
    expect(b.isLeader.value).toBe(true);
  });

  it('stop() 後 start() 仍可靠（channel 未被 close）', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    a.stop();
    expect(a.isLeader.value).toBe(false);

    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);
  });

  it('malformed BroadcastChannel message 被 type guard 擋下，不影響 leadership', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    const attacker = env.makeChannel('attacker');
    attacker.post({ type: 'evil' });
    attacker.post({ type: 'leader-heartbeat', instanceId: 123 });
    attacker.post({ type: 'leader-heartbeat', instanceId: 'x', term: { counter: 'no', ownerId: 'x' } });
    env.advance(100);

    expect(a.isLeader.value).toBe(true);
  });

  it('非法 LeaderTerm（NaN / Infinity / -1 / 1.5 / empty ownerId）被擋下，不污染 election', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    const attacker = env.makeChannel('attacker');
    // 這些 counter 若被接受都會 > A 的 counter 1 而搶走 leadership，必須全被擋下。
    attacker.post({ type: 'leader-heartbeat', instanceId: 'x', term: { counter: Number.NaN, ownerId: 'x' } });
    attacker.post({
      type: 'leader-heartbeat',
      instanceId: 'x',
      term: { counter: Number.POSITIVE_INFINITY, ownerId: 'x' }
    });
    attacker.post({ type: 'leader-heartbeat', instanceId: 'x', term: { counter: -1, ownerId: 'x' } });
    attacker.post({ type: 'leader-heartbeat', instanceId: 'x', term: { counter: 1.5, ownerId: 'x' } });
    attacker.post({ type: 'leader-heartbeat', instanceId: 'x', term: { counter: 5, ownerId: '' } });
    env.advance(100);

    expect(a.isLeader.value).toBe(true);
    expect(a.leaderTerm.value?.counter).toBe(1);
  });

  it('dispose() 後 start() 為 no-op：不重新 subscribe / 競選', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    a.dispose();
    expect(a.isLeader.value).toBe(false);

    a.start();
    env.advance(2000);
    expect(a.isLeader.value).toBe(false);
    expect(a.role.value).toBe('follower');

    // dispose 後 channel 已 close：其他 tab 的 request-leader 不會被 A 回應、A 也不再競選。
    const probe = env.makeChannel('probe');
    probe.post({ type: 'request-leader', instanceId: 'probe' });
    env.advance(600);
    expect(a.isLeader.value).toBe(false);
  });
});
