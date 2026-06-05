import { computed, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SymbolInfo } from 'klinecharts';
import { useTradingPairsQuery } from '@/queries/use-trading-pairs-query';
import { resolveKlineSymbolInfo, resolveSelectedSymbol } from '@/service/kline/symbol-info';
import type { PublicTradingPair } from '@/service/api/trading-pairs';
import type { AppError } from '@/service/error';

/** URL query key for selected symbol（per-tab，不進 BroadcastChannel）。 */
const SYMBOL_QUERY_KEY = 'symbol';

export interface UseSelectedSymbol {
  pairs: ComputedRef<PublicTradingPair[]>;
  isPending: Ref<boolean>;
  isError: Ref<boolean>;
  error: Ref<AppError | null>;
  /** 解析後的 stable symbol key（uppercase；無可選 symbol → null）。 */
  selectedSymbol: ComputedRef<string | null>;
  /** 供 KlineChart 用的完整 SymbolInfo（含 registry precision）；無可選 → null。 */
  selectedSymbolInfo: ComputedRef<SymbolInfo | null>;
  /** 由 selectedSymbol 派生的最新 pair snapshot（不保存過期 object）。 */
  selectedPair: ComputedRef<PublicTradingPair | null>;
  /** 使用者主動切換：uppercase normalize 後以 push 寫 URL。 */
  selectSymbol(symbol: string): void;
}

/**
 * Public symbol selection 的唯一 query + resolve owner（D-1 / D-4）。
 * - selected state 只存 URL stable key；selectedPair 從 Query 最新資料派生。
 * - URL canonical normalize（uppercase / fallback）只在 query data ready 後 router.replace，pending 不改 URL；
 *   resolved === 現 URL 時不 replace（防 loop）。使用者主動切換用 push。
 * - selection per-tab，不進 BroadcastChannel。
 */
export function useSelectedSymbol(): UseSelectedSymbol {
  const route = useRoute();
  const router = useRouter();
  const query = useTradingPairsQuery();

  const pairs = computed<PublicTradingPair[]>(() => query.data.value ?? []);

  const urlSymbol = computed<string | null>(() => {
    const raw = route.query[SYMBOL_QUERY_KEY];
    return typeof raw === 'string' ? raw : null;
  });

  // query data ready：成功且資料到位（非 pending、非 error、data 已定義）。
  const isDataReady = computed(() => !query.isPending.value && !query.isError.value && query.data.value !== undefined);

  const selectedSymbol = computed<string | null>(() =>
    resolveSelectedSymbol({ urlSymbol: urlSymbol.value, pairs: pairs.value })
  );
  const selectedSymbolInfo = computed<SymbolInfo | null>(() =>
    selectedSymbol.value === null ? null : resolveKlineSymbolInfo(selectedSymbol.value)
  );
  const selectedPair = computed<PublicTradingPair | null>(() => {
    const symbol = selectedSymbol.value;
    if (symbol === null) return null;
    return pairs.value.find(pair => pair.symbol === symbol) ?? null;
  });

  // URL canonical normalize：data ready 才 replace；resolved === 現值不 replace（防 loop / pending 不改 URL）。
  watch(
    [isDataReady, selectedSymbol],
    () => {
      if (!isDataReady.value) return;
      const resolved = selectedSymbol.value;
      if (resolved === null) return; // 無可選 symbol → 不寫 URL（empty/precondition state）
      if (route.query[SYMBOL_QUERY_KEY] === resolved) return; // 已 canonical → 不 replace
      void router.replace({ query: { ...route.query, [SYMBOL_QUERY_KEY]: resolved } });
    },
    { immediate: true }
  );

  function selectSymbol(symbol: string): void {
    const normalized = symbol.trim().toUpperCase(); // 入口一律 uppercase normalize
    if (route.query[SYMBOL_QUERY_KEY] === normalized) return;
    void router.push({ query: { ...route.query, [SYMBOL_QUERY_KEY]: normalized } });
  }

  return {
    pairs,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    selectedSymbol,
    selectedSymbolInfo,
    selectedPair,
    selectSymbol
  };
}
