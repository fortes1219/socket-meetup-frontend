/**
 * Leader term：可比較的任期物件。
 * counter 大者新；counter 相同時以 ownerId 做 deterministic tie-break（字典序小者視為較新）。
 */
export interface LeaderTerm {
  counter: number;
  ownerId: string;
}

/** nextLeaderTerm 結果；degraded 表示 localStorage 不可用、counter 走 fallback path。 */
export interface NextLeaderTermResult {
  term: LeaderTerm;
  degraded: boolean;
}

/** leader-term 取得任期所需的最小依賴（皆可注入，便於 deterministic test）。 */
export interface LeaderTermDeps {
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  now: () => number;
}

/** localStorage 中保存單調 counter 的 key（app prefix，避免同 origin 其他頁面碰撞）。 */
export const LEADER_COUNTER_KEY = 'socket-meetup:leader:counter';

/**
 * 產生下一個 leaderTerm。
 * 正常：counter = max(lastSeenCounter, storage counter) + 1，並寫回 storage。
 * degrade：storage throw（隱私模式 / 配額）時，以 `now()` 毫秒當 counter，標記 degraded，仍可比較。
 */
export function nextLeaderTerm(deps: LeaderTermDeps, ownerId: string, lastSeenCounter = 0): NextLeaderTermResult {
  try {
    const raw = deps.storage.getItem(LEADER_COUNTER_KEY);
    const stored = raw === null ? 0 : Number.parseInt(raw, 10);
    const base = Number.isFinite(stored) ? stored : 0;
    const counter = Math.max(base, lastSeenCounter) + 1;
    deps.storage.setItem(LEADER_COUNTER_KEY, String(counter));
    return { term: { counter, ownerId }, degraded: false };
  } catch {
    const counter = Math.max(deps.now(), lastSeenCounter + 1);
    return { term: { counter, ownerId }, degraded: true };
  }
}

/**
 * 比較任期新舊：
 * >0 表 a 較新；<0 表 b 較新；0 表完全相同（counter + ownerId 相同）。
 */
export function compareLeaderTerm(a: LeaderTerm, b: LeaderTerm): number {
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.ownerId === b.ownerId) return 0;
  return a.ownerId < b.ownerId ? 1 : -1;
}
