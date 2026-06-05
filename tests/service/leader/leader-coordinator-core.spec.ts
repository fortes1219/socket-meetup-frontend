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

  it('第二個 visible window request-leader → 現任 leader 禮讓並暫停競選，第二個接手', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);

    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);

    expect(a.isLeader.value).toBe(false);
    expect(a.isSuspended.value).toBe(true);
    expect(b.isLeader.value).toBe(true);

    env.advance(4000);
    expect(a.isLeader.value).toBe(false);
    expect(b.isLeader.value).toBe(true);
  });

  it('visible leader 收到 request-leader → release，另一個 visible window 立即接手（雙視窗切換）', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);

    expect(a.isLeader.value).toBe(false);
    expect(a.isSuspended.value).toBe(true);
    expect(b.isLeader.value).toBe(true);
  });

  it('suspended window 需要 resumeLeadership 才能重新 request leader', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);
    expect(a.isSuspended.value).toBe(true);
    expect(b.isLeader.value).toBe(true);

    a.resumeLeadership();
    env.advance(600);

    expect(a.isSuspended.value).toBe(false);
    expect(a.isLeader.value).toBe(true);
    expect(b.isLeader.value).toBe(false);
    expect(b.isSuspended.value).toBe(true);
  });

  it('hidden follower 不搶 leader；回 visible 才 request 並接手', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    const bVis = env.makeVisibility(false);
    const b = makeCoordinator('b', bVis, 2);
    b.start();
    env.advance(1100); // hidden follower 先收到 leader heartbeat，建立 fresh known leader
    expect(b.isLeader.value).toBe(false);
    expect(a.isLeader.value).toBe(true);

    bVis.set(true);
    env.advance(600);

    expect(b.isLeader.value).toBe(true);
    expect(a.isLeader.value).toBe(false);
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

  it('visible leader 失聯後重連、收到較新 term → step down（handleLeaderSignal）', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    const bVis = env.makeVisibility(false);
    const b = makeCoordinator('b', bVis, 2);
    b.start();
    env.advance(1100);
    expect(a.isLeader.value).toBe(true);

    // a 仍 visible（不 hidden，故不 release），但 channel 失聯（crash-like）→ b 回 visible 後等 stale 接手；a 漏接仍以為自己是 leader
    env.disconnect('a');
    bVis.set(true);
    env.advance(4000);
    expect(a.isLeader.value).toBe(true);
    expect(b.isLeader.value).toBe(true);

    // a 重連（仍 visible）→ 收到 b 的較新 heartbeat → 立即 step down
    env.reconnect('a');
    env.advance(1100);
    expect(a.isLeader.value).toBe(false);
    expect(a.isSuspended.value).toBe(true);
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

describe('member-style visibility and window handoff', () => {
  it('single hidden leader keeps leadership and socket ownership intent', () => {
    const visA = env.makeVisibility(true);
    const a = makeCoordinator('a', visA, 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);
    expect(a.role.value).toBe('leader');
    expect(a.leaderTerm.value?.counter).toBe(1);

    visA.set(false);
    env.advance(600);
    expect(a.isLeader.value).toBe(true);
    expect(a.role.value).toBe('leader');
    expect(a.leaderTerm.value?.counter).toBe(1);

    visA.set(true);
    env.advance(600);
    expect(a.isLeader.value).toBe(true);
    expect(a.leaderTerm.value?.counter).toBe(1);
  });

  it('hidden leader yields only when another visible tab requests leadership', () => {
    const visA = env.makeVisibility(true);
    const a = makeCoordinator('a', visA, 1);
    a.start();
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    visA.set(false);
    env.advance(600);
    expect(a.isLeader.value).toBe(true);

    const b = makeCoordinator('b', env.makeVisibility(true), 2);
    b.start();
    env.advance(600);

    expect(a.isLeader.value).toBe(false);
    expect(b.isLeader.value).toBe(true);
    expect(b.leaderTerm.value?.counter ?? 0).toBeGreaterThan(1);
  });

  it('hidden follower does not claim until visible, then requests leadership', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    const bVis = env.makeVisibility(false);
    const b = makeCoordinator('b', bVis, 2);
    b.start();
    env.advance(1100);
    expect(a.isLeader.value).toBe(true);
    expect(b.isLeader.value).toBe(false);

    bVis.set(true);
    env.advance(600);
    expect(a.isLeader.value).toBe(false);
    expect(b.isLeader.value).toBe(true);
  });

  it('regression: stale fallback remains when the leader crashes without release', () => {
    const a = makeCoordinator('a', env.makeVisibility(true), 1);
    a.start();
    env.advance(600);
    const bVis = env.makeVisibility(false);
    const b = makeCoordinator('b', bVis, 2);
    b.start();
    env.advance(1100);
    expect(b.isLeader.value).toBe(false);

    env.disconnect('a');
    bVis.set(true);
    env.advance(500);
    expect(b.isLeader.value).toBe(false);
    env.advance(3000);
    expect(b.isLeader.value).toBe(true);
  });
});
