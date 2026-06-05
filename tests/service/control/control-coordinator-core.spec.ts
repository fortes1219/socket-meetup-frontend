import { describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ref, shallowRef } from 'vue';
import { createControlCoordinator } from '@/service/control/control-coordinator-core';
import { createSocketEventThrottle } from '@/composables/useSocketEventThrottle';
import { createFakeLeaderEnv, type FakeLeaderEnv } from '../../helpers/fake-leader-env';
import type { LeaderTerm } from '@/service/leader/leader-term';
import type { PublicTradingPair } from '@/service/api/trading-pairs';

const DATA: PublicTradingPair[] = [{ symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_order: 0 }];
const TERM_A: LeaderTerm = { counter: 1, ownerId: 'a' };
const TERM_B: LeaderTerm = { counter: 2, ownerId: 'b' };

interface MessageRecord {
  type?: string;
  sequence?: number;
  throughSequence?: number;
}

function makeGateway() {
  return {
    fetchTradingPairs: vi.fn(async () => DATA),
    setTradingPairs: vi.fn(),
    getTradingPairs: vi.fn(() => undefined)
  };
}

function makeNode(
  env: FakeLeaderEnv,
  id: string,
  opts: { leader: boolean; term: LeaderTerm | null; visible?: boolean }
) {
  const isLeader = ref(opts.leader);
  const leaderTerm = shallowRef<LeaderTerm | null>(opts.term);
  const visibility = env.makeControlVisibility(opts.visible ?? true);
  const gateway = makeGateway();
  const throttle = createSocketEventThrottle({
    random: () => 0,
    setTimeout: env.timers.setTimeout,
    clearTimeout: env.timers.clearTimeout
  });
  const core = createControlCoordinator({
    adapters: { channel: env.makeChannel(id), timers: env.timers, clock: env.clock, visibility },
    gateway,
    throttle,
    isLeader,
    leaderTerm,
    options: { awaitingTimeout: 3000, throttleConfig: { min: 2000, max: 6000, step: 500 } }
  });
  core.start();
  return { core, isLeader, leaderTerm, visibility, gateway };
}

function recorder(env: FakeLeaderEnv): MessageRecord[] {
  const messages: MessageRecord[] = [];
  env.makeChannel('recorder').subscribe(m => messages.push(m as MessageRecord));
  return messages;
}

const ofType = (messages: MessageRecord[], type: string): MessageRecord[] => messages.filter(m => m.type === type);

const invalidated = (term: LeaderTerm, sequence: number) => ({
  type: 'control:invalidated',
  resource: 'trading-pairs',
  reason: 'callUpdate',
  leaderTerm: term,
  sequence,
  emittedAt: 0
});
const updatedMsg = (term: LeaderTerm, throughSequence: number, data: PublicTradingPair[]) => ({
  type: 'control:updated',
  resource: 'trading-pairs',
  data,
  leaderTerm: term,
  throughSequence,
  updatedAt: 0
});
const syncRequest = (awaiting?: { leaderTerm: LeaderTerm; sequence: number }) => ({
  type: 'control:sync-request',
  resource: 'trading-pairs',
  awaiting,
  requestedAt: 0
});

describe('control-coordinator leader', () => {
  it('callUpdate → sequence++ + invalidated + throttled fetch + publish updated', async () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const { core, gateway } = makeNode(env, 'L', { leader: true, term: TERM_A });

    core.notifyCallUpdate();
    expect(ofType(rec, 'control:invalidated')).toHaveLength(1);
    expect(ofType(rec, 'control:invalidated')[0].sequence).toBe(1);
    expect(core.controlSequence.value).toBe(1);
    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();

    env.advance(2001);
    await flushPromises();

    expect(gateway.fetchTradingPairs).toHaveBeenCalledTimes(1);
    expect(ofType(rec, 'control:updated')).toHaveLength(1);
    expect(ofType(rec, 'control:updated')[0].throughSequence).toBe(1);
    expect(gateway.setTradingPairs).toHaveBeenCalledWith(DATA);
  });

  it('連續 callUpdate dedupe → 只一次 fetch、throughSequence 取最新', async () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const { core, gateway } = makeNode(env, 'L', { leader: true, term: TERM_A });

    core.notifyCallUpdate();
    core.notifyCallUpdate();
    env.advance(2001);
    await flushPromises();

    expect(gateway.fetchTradingPairs).toHaveBeenCalledTimes(1);
    expect(ofType(rec, 'control:updated')[0].throughSequence).toBe(2);
  });

  it('leaderTerm=null → 不 broadcast invalidated/updated、degraded、不 fetch', async () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const { core, gateway } = makeNode(env, 'L', { leader: true, term: null });

    core.notifyCallUpdate();
    expect(ofType(rec, 'control:invalidated')).toHaveLength(0);
    expect(core.degraded.value).toBe(true);

    env.advance(2001);
    await flushPromises();
    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();
  });

  it('notifyAcquire 只重設 sequence，不做 authoritative fetch', async () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const { core, gateway } = makeNode(env, 'L', { leader: true, term: TERM_A });

    core.notifyCallUpdate();
    expect(core.controlSequence.value).toBe(1);

    core.notifyAcquire();
    await flushPromises();

    expect(core.controlSequence.value).toBe(0);
    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();
    expect(ofType(rec, 'control:updated')).toHaveLength(0);
  });

  it('[B1] sync-request awaiting.sequence > lastPublishedSequence → 必 fetch，不回舊 cache', async () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { core, gateway } = makeNode(env, 'L', { leader: true, term: TERM_A });

    core.notifyCallUpdate();
    env.advance(2001);
    await flushPromises(); // published seq=1
    gateway.fetchTradingPairs.mockClear();

    core.notifyCallUpdate(); // seq=2，refresh 尚未跑 → lastPublishedSequence 仍 1
    driver.post(syncRequest({ leaderTerm: TERM_A, sequence: 2 }));
    env.advance(2001);
    await flushPromises();

    expect(gateway.fetchTradingPairs).toHaveBeenCalled(); // 不得用 cache 假裝 fresh
  });

  it('[B1] sync-request awaiting.sequence <= lastPublishedSequence → 用 lastPublishedData，不 fetch', async () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const driver = env.makeChannel('driver');
    const { core, gateway } = makeNode(env, 'L', { leader: true, term: TERM_A });

    core.notifyCallUpdate();
    env.advance(2001);
    await flushPromises(); // published seq=1
    gateway.fetchTradingPairs.mockClear();
    const before = ofType(rec, 'control:updated').length;

    driver.post(syncRequest({ leaderTerm: TERM_A, sequence: 1 }));

    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();
    expect(ofType(rec, 'control:updated').length).toBe(before + 1);
  });
});

describe('control-coordinator follower', () => {
  it('invalidated → awaiting，fetch 0 次', () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { core, gateway } = makeNode(env, 'F', { leader: false, term: null });

    driver.post(invalidated(TERM_A, 2));
    expect(core.awaitingSequence.value).toBe(2);
    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();
  });

  it('updated valid → setTradingPairs + lastApplied，清 awaiting，永不 fetch', () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { core, gateway } = makeNode(env, 'F', { leader: false, term: null });

    driver.post(invalidated(TERM_A, 2));
    driver.post(updatedMsg(TERM_A, 2, DATA));

    expect(gateway.setTradingPairs).toHaveBeenCalledWith(DATA);
    expect(core.lastAppliedSequence.value).toBe(2);
    expect(core.awaitingSequence.value).toBeNull();
    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();
  });

  it('stale term snapshot 被 reject', () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { gateway } = makeNode(env, 'F', { leader: false, term: null });

    driver.post(updatedMsg(TERM_B, 1, DATA)); // 先建立 known term B
    gateway.setTradingPairs.mockClear();
    driver.post(updatedMsg(TERM_A, 5, DATA)); // A < B → reject
    expect(gateway.setTradingPairs).not.toHaveBeenCalled();
  });

  it('same term sequence <= lastApplied 被 reject', () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { gateway } = makeNode(env, 'F', { leader: false, term: null });

    driver.post(updatedMsg(TERM_A, 2, DATA));
    gateway.setTradingPairs.mockClear();
    driver.post(updatedMsg(TERM_A, 2, DATA)); // 2 > 2 false
    driver.post(updatedMsg(TERM_A, 1, DATA)); // 1 > 2 false
    expect(gateway.setTradingPairs).not.toHaveBeenCalled();
  });

  it('visible follower timeout 3000 → sync-request，不 fetch', () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const driver = env.makeChannel('driver');
    const { gateway } = makeNode(env, 'F', { leader: false, term: null, visible: true });

    driver.post(invalidated(TERM_A, 2));
    env.advance(3001);

    expect(ofType(rec, 'control:sync-request')).toHaveLength(1);
    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();
  });

  it('[B2] hidden follower timeout 不送 sync-request；visible 後才送', () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const driver = env.makeChannel('driver');
    const { visibility } = makeNode(env, 'F', { leader: false, term: null, visible: false });

    driver.post(invalidated(TERM_A, 2));
    env.advance(3001);
    expect(ofType(rec, 'control:sync-request')).toHaveLength(0);

    visibility.set(true);
    expect(ofType(rec, 'control:sync-request')).toHaveLength(1);
  });

  it('stale invalidated（same term sequence <= lastApplied）被擋，不重啟 awaiting/timeout', () => {
    const env = createFakeLeaderEnv();
    const rec = recorder(env);
    const driver = env.makeChannel('driver');
    const { core, gateway } = makeNode(env, 'F', { leader: false, term: null, visible: true });

    driver.post(invalidated(TERM_A, 5));
    driver.post(updatedMsg(TERM_A, 5, DATA)); // 套用 → lastApplied=5、awaiting 清空
    expect(core.awaitingSequence.value).toBeNull();

    driver.post(invalidated(TERM_A, 4)); // stale sequence
    driver.post(invalidated(TERM_A, 5)); // stale sequence（== lastApplied）
    expect(core.awaitingSequence.value).toBeNull();

    env.advance(3001);
    expect(ofType(rec, 'control:sync-request')).toHaveLength(0);
    expect(gateway.fetchTradingPairs).not.toHaveBeenCalled();
  });

  it('hidden follower updated → pendingSnapshot（不 setQueryData）；visible 後套用', () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { core, gateway, visibility } = makeNode(env, 'F', { leader: false, term: null, visible: false });

    driver.post(invalidated(TERM_A, 2));
    driver.post(updatedMsg(TERM_A, 2, DATA));
    expect(gateway.setTradingPairs).not.toHaveBeenCalled();
    expect(core.pendingSnapshotPresent.value).toBe(true);

    visibility.set(true);
    expect(gateway.setTradingPairs).toHaveBeenCalledWith(DATA);
    expect(core.pendingSnapshotPresent.value).toBe(false);
  });
});

describe('control-coordinator lifecycle', () => {
  it('start → stop → start 後仍能接收 message（channel 未被 close）', () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { core } = makeNode(env, 'F', { leader: false, term: null });

    core.stop();
    core.start();

    driver.post(invalidated(TERM_A, 1));
    expect(core.awaitingSequence.value).toBe(1);
  });

  it('dispose → start 為 no-op（不復活）', () => {
    const env = createFakeLeaderEnv();
    const driver = env.makeChannel('driver');
    const { core } = makeNode(env, 'F', { leader: false, term: null });

    core.dispose();
    core.start();

    driver.post(invalidated(TERM_A, 1));
    expect(core.awaitingSequence.value).toBeNull();
  });
});

describe('control-coordinator 雙 instance', () => {
  it('leader callUpdate → follower 收 invalidated+updated 並套用，follower 永不 fetch', async () => {
    const env = createFakeLeaderEnv();
    const leader = makeNode(env, 'L', { leader: true, term: TERM_A });
    const follower = makeNode(env, 'F', { leader: false, term: null });

    leader.core.notifyCallUpdate();
    expect(follower.core.awaitingSequence.value).toBe(1);

    env.advance(2001);
    await flushPromises();

    expect(follower.gateway.setTradingPairs).toHaveBeenCalledWith(DATA);
    expect(follower.core.lastAppliedSequence.value).toBe(1);
    expect(follower.gateway.fetchTradingPairs).not.toHaveBeenCalled();
  });

  it('follower 漏掉 updated → timeout sync-request → leader 從 lastPublished 回 updated → follower 套用', async () => {
    const env = createFakeLeaderEnv();
    const leader = makeNode(env, 'L', { leader: true, term: TERM_A });
    const follower = makeNode(env, 'F', { leader: false, term: null, visible: true });

    leader.core.notifyCallUpdate(); // follower 收 invalidated（awaiting 1）
    env.disconnect('F'); // follower 在 leader publish 期間斷線 → 漏 updated
    env.advance(2001);
    await flushPromises();
    expect(follower.gateway.setTradingPairs).not.toHaveBeenCalled();

    env.reconnect('F');
    env.advance(1001); // 累計 > 3000 → follower awaiting timeout → sync-request → leader 回 updated
    await flushPromises();

    expect(follower.gateway.setTradingPairs).toHaveBeenCalledWith(DATA);
    expect(follower.gateway.fetchTradingPairs).not.toHaveBeenCalled();
  });
});
