import { onBeforeUnmount, onMounted, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { dispose, init, type Chart, type SymbolInfo } from 'klinecharts';
import type { KlineFeed } from './useKlineFeed';
import { KLINE_CHART_STYLES } from '@/service/kline/chart-styles';

export interface UseKlineChartOptions {
  /**
   * reactive symbol metadata（必含 pricePrecision / volumePrecision）。
   * 切換時以 value-equality（ticker/pricePrecision/volumePrecision）判斷，只有實際變更才 setSymbol，
   * 避免 computed 每次回新 object reference 觸發多餘 resetData → reload → unsubscribe/subscribe。
   * SHIBUSDT 價格 0.000005xx，缺 precision 會用 klinecharts 預設 2 → Y 軸全擠 0.00 → 視覺平線。
   */
  symbol: MaybeRefOrGetter<SymbolInfo>;
  feed: KlineFeed;
}

export interface KlineChartHandle {
  /** init 成功並完成 setSymbol/setPeriod/setDataLoader 後為 true；dispose 後回 false。 */
  initialized: Ref<boolean>;
  /** init 失敗（container 未掛載 / init 回 null / 例外）時帶錯；成功為 null。 */
  initError: Ref<unknown>;
  /** socket resume / reconnect 時重載 history，讓 klinecharts 自己重新 getBars + subscribeBar。 */
  resume(): void;
}

/** value-equality：只比對 klinecharts setSymbol 在意的三欄，避免 object reference 差異造成多餘 reset。 */
function sameSymbolInfo(a: SymbolInfo, b: SymbolInfo): boolean {
  return a.ticker === b.ticker && a.pricePrecision === b.pricePrecision && a.volumePrecision === b.volumePrecision;
}

/**
 * klinecharts chart 生命週期（唯一 import klinecharts 值的地方）。
 * - onMounted：init → setStyles → setSymbol（初值）→ setPeriod（1m）→ setDataLoader。
 * - watch symbol：value 真的改變才 setSymbol（klinecharts 原生 resetData → getBars init → subscribeBar 新 symbol）。
 * - onBeforeUnmount：dispose chart（feed 生命週期由 useKlineFeed 自身 onScopeDispose 負責，不在此雙重 dispose）。
 * - init 失敗不 throw，但以 initialized / initError 暴露狀態，避免 demo 空白時難查。
 */
export function useKlineChart(container: Ref<HTMLElement | null>, options: UseKlineChartOptions): KlineChartHandle {
  const initialized = shallowRef(false);
  const initError = shallowRef<unknown>(null);
  let chart: Chart | null = null;
  let lastApplied: SymbolInfo | null = null;

  function applySymbol(next: SymbolInfo): void {
    if (chart === null) return;
    if (lastApplied !== null && sameSymbolInfo(next, lastApplied)) return;
    lastApplied = next;
    chart.setSymbol(next);
  }

  function resume(): void {
    chart?.resetData();
  }

  onMounted(() => {
    try {
      if (container.value === null) {
        initError.value = new Error('kline container 未掛載');
        return;
      }
      const created = init(container.value);
      if (created === null) {
        initError.value = new Error('klinecharts init() 回傳 null');
        return;
      }
      chart = created;
      chart.setStyles(KLINE_CHART_STYLES);
      // 帶完整 SymbolInfo（含 pricePrecision）才不會把小價格圖壓成平線。
      const initial = toValue(options.symbol);
      lastApplied = initial;
      chart.setSymbol(initial);
      chart.setPeriod({ type: 'minute', span: 1 });
      chart.setDataLoader(options.feed.dataLoader);
      initialized.value = true;
    } catch (error) {
      initError.value = error;
    }
  });

  // reactive symbol switching（value-equality guard 在 applySymbol 內）。
  watch(
    () => toValue(options.symbol),
    next => applySymbol(next)
  );

  onBeforeUnmount(() => {
    if (chart !== null) {
      dispose(chart);
      chart = null;
    }
    initialized.value = false;
  });

  return { initialized, initError, resume };
}
