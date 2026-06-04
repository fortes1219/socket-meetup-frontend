import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue';
import { dispose, init, type Chart, type SymbolInfo } from 'klinecharts';
import type { KlineFeed } from '@/composables/useKlineFeed';
import { KLINE_CHART_STYLES } from '@/service/kline/chart-styles';

export interface UseKlineChartOptions {
  /**
   * symbol metadata fixed at mount for this slice：必須含 pricePrecision / volumePrecision。
   * SHIBUSDT 價格 0.000005xx，缺 precision 會用 klinecharts 預設 2 → Y 軸全擠 0.00 → 視覺平線。
   * 本刀不做 reactive symbol switching，props 變動不會 re-setSymbol。
   */
  symbol: SymbolInfo;
  feed: KlineFeed;
}

export interface KlineChartHandle {
  /** init 成功並完成 setSymbol/setPeriod/setDataLoader 後為 true；dispose 後回 false。 */
  initialized: Ref<boolean>;
  /** init 失敗（container 未掛載 / init 回 null / 例外）時帶錯；成功為 null。 */
  initError: Ref<unknown>;
}

/**
 * klinecharts chart 生命週期（唯一 import klinecharts 值的地方）。
 * - onMounted：init → setSymbol（固定 symbol）→ setPeriod（1m）→ setDataLoader。
 * - onBeforeUnmount：dispose chart（feed 生命週期由 useKlineFeed 自身 onScopeDispose 負責，不在此雙重 dispose）。
 * - init 失敗不 throw，但以 initialized / initError 暴露狀態，避免 demo 空白時難查。
 */
export function useKlineChart(container: Ref<HTMLElement | null>, options: UseKlineChartOptions): KlineChartHandle {
  const initialized = shallowRef(false);
  const initError = shallowRef<unknown>(null);
  let chart: Chart | null = null;

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
      // symbol fixed at mount：不 watch props.symbol、不 resubscribe（本刀僅 SHIBUSDT / 1m）。
      // 帶完整 SymbolInfo（含 pricePrecision）才不會把小價格圖壓成平線。
      chart.setSymbol(options.symbol);
      chart.setPeriod({ type: 'minute', span: 1 });
      chart.setDataLoader(options.feed.dataLoader);
      initialized.value = true;
    } catch (error) {
      initError.value = error;
    }
  });

  onBeforeUnmount(() => {
    if (chart !== null) {
      dispose(chart);
      chart = null;
    }
    initialized.value = false;
  });

  return { initialized, initError };
}
