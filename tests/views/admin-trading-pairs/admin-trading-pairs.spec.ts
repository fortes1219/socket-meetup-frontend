import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';

vi.mock('@/stores/admin-token', async () => {
  const { reactive } = await import('vue');
  const store = reactive({ hasToken: false, token: '', setToken: () => {}, clearToken: () => {} });
  return { useAdminTokenStore: () => store };
});

vi.mock('@/queries/use-admin-trading-pairs-query', async () => {
  const { ref } = await import('vue');
  const state = {
    data: ref<unknown>(undefined),
    isPending: ref(false),
    isError: ref(false),
    error: ref<unknown>(null)
  };
  return { useAdminTradingPairsQuery: () => state };
});

vi.mock('@/queries/use-admin-trading-pairs-mutations', async () => {
  const { ref } = await import('vue');
  const make = () => ({ mutation: { mutate: vi.fn(), error: ref<unknown>(null) }, broadcastFailed: ref(false) });
  const create = make();
  const patch = make();
  const del = make();
  return { useCreatePair: () => create, usePatchPair: () => patch, useDeletePair: () => del };
});

import AdminTradingPairs from '@/views/AdminTradingPairs.vue';
import { useAdminTokenStore } from '@/stores/admin-token';
import { useAdminTradingPairsQuery } from '@/queries/use-admin-trading-pairs-query';
import { useCreatePair, useDeletePair, usePatchPair } from '@/queries/use-admin-trading-pairs-mutations';

interface TokenState {
  hasToken: boolean;
  token: string;
}
interface QueryState {
  data: { value: unknown };
  isPending: { value: boolean };
  isError: { value: boolean };
  error: { value: unknown };
}
interface MutationApi {
  mutation: { mutate: ReturnType<typeof vi.fn>; error: { value: unknown } };
  broadcastFailed: { value: boolean };
}

const tokenState = useAdminTokenStore() as unknown as TokenState;
const queryState = useAdminTradingPairsQuery() as unknown as QueryState;
const createApi = useCreatePair() as unknown as MutationApi;
const patchApi = usePatchPair() as unknown as MutationApi;
const deleteApi = useDeletePair() as unknown as MutationApi;

const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>'
});
const STUBS = {
  QLayout: Passthrough,
  QHeader: Passthrough,
  QToolbar: Passthrough,
  QToolbarTitle: Passthrough,
  QIcon: Passthrough,
  QPageContainer: Passthrough,
  QPage: Passthrough,
  QCard: Passthrough,
  QCardSection: Passthrough,
  QSeparator: Passthrough,
  QBtn: ButtonStub,
  AdminTokenField: true // 有 queryClient 依賴，另檔測；此處 stub
};

const pair = {
  id: '11111111-1111-1111-1111-111111111111',
  symbol: 'ADAUSDT',
  base_asset: 'ADA',
  quote_asset: 'USDT',
  enabled: false,
  display_order: 0,
  created_at: 1,
  updated_at: 2
};

function reset() {
  tokenState.hasToken = false;
  tokenState.token = '';
  queryState.data.value = undefined;
  queryState.isPending.value = false;
  queryState.isError.value = false;
  queryState.error.value = null;
  for (const api of [createApi, patchApi, deleteApi]) {
    api.mutation.mutate.mockClear();
    api.mutation.error.value = null;
    api.broadcastFailed.value = false;
  }
}

function mountAdmin() {
  return mount(AdminTradingPairs, { global: { stubs: STUBS } });
}

beforeEach(reset);

describe('AdminTradingPairs token gating', () => {
  it('無 token → 顯示 need-token，不顯示 create form', async () => {
    const wrapper = mountAdmin();
    await nextTick();
    expect(wrapper.find('[data-test="need-token"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="create-symbol"]').exists()).toBe(false);
  });

  it('有 token + data → 顯示 list 與 row', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair];
    const wrapper = mountAdmin();
    await nextTick();
    expect(wrapper.find('[data-test="admin-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="pair-row-ADAUSDT"]').exists()).toBe(true);
  });
});

describe('AdminTradingPairs CRUD wiring', () => {
  it('create form submit → create.mutate(symbol)', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [];
    const wrapper = mountAdmin();
    await nextTick();
    await wrapper.find('[data-test="create-symbol"]').setValue('ADAUSDT');
    await wrapper.find('[data-test="create-submit"]').trigger('click');
    expect(createApi.mutation.mutate).toHaveBeenCalledWith('ADAUSDT');
  });

  it('row 啟用 → patch.mutate({id, patch:{enabled:true}})', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair]; // enabled:false
    const wrapper = mountAdmin();
    await nextTick();
    await wrapper.find('[data-test="toggle-ADAUSDT"]').trigger('click');
    expect(patchApi.mutation.mutate).toHaveBeenCalledWith({ id: pair.id, patch: { enabled: true } });
  });

  it('row 套用順序 → patch.mutate({id, patch:{display_order}})', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair];
    const wrapper = mountAdmin();
    await nextTick();
    await wrapper.find('[data-test="order-ADAUSDT"]').setValue('3');
    await wrapper.find('[data-test="apply-order-ADAUSDT"]').trigger('click');
    expect(patchApi.mutation.mutate).toHaveBeenCalledWith({ id: pair.id, patch: { display_order: 3 } });
  });

  it('row 刪除 → delete.mutate(id)', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair];
    const wrapper = mountAdmin();
    await nextTick();
    await wrapper.find('[data-test="delete-ADAUSDT"]').trigger('click');
    expect(deleteApi.mutation.mutate).toHaveBeenCalledWith(pair.id);
  });

  it('display_order 空值 → apply 擋下，不 emit', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair];
    const wrapper = mountAdmin();
    await nextTick();
    await wrapper.find('[data-test="order-ADAUSDT"]').setValue('');
    await wrapper.find('[data-test="apply-order-ADAUSDT"]').trigger('click');
    expect(patchApi.mutation.mutate).not.toHaveBeenCalled();
  });

  it('display_order 負數 → apply 擋下，不 emit', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair];
    const wrapper = mountAdmin();
    await nextTick();
    await wrapper.find('[data-test="order-ADAUSDT"]').setValue('-1');
    await wrapper.find('[data-test="apply-order-ADAUSDT"]').trigger('click');
    expect(patchApi.mutation.mutate).not.toHaveBeenCalled();
  });
});

describe('AdminTradingPairs warning / error UI', () => {
  it('committed_broadcast_failed → 顯示 broadcast-warning', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair];
    createApi.broadcastFailed.value = true;
    const wrapper = mountAdmin();
    await nextTick();
    expect(wrapper.find('[data-test="broadcast-warning"]').exists()).toBe(true);
  });

  it('401 → 顯示 unauthorized', async () => {
    tokenState.hasToken = true;
    queryState.error.value = { source: 'backend', code: 'unauthorized', message: 'no', status: 401 };
    queryState.isError.value = true;
    const wrapper = mountAdmin();
    await nextTick();
    expect(wrapper.find('[data-test="unauthorized"]').exists()).toBe(true);
  });

  it('committed_broadcast_failed 不重複顯示為 mutation-error（只走 broadcast-warning）', async () => {
    tokenState.hasToken = true;
    queryState.data.value = [pair];
    patchApi.mutation.error.value = {
      source: 'backend',
      code: 'committed_broadcast_failed',
      message: 'x',
      status: 500
    };
    patchApi.broadcastFailed.value = true;
    const wrapper = mountAdmin();
    await nextTick();
    expect(wrapper.find('[data-test="broadcast-warning"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="mutation-error"]').exists()).toBe(false);
  });
});
