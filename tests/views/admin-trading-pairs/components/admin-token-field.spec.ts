import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import AdminTokenField from '@/views/admin-trading-pairs/components/AdminTokenField.vue';
import { useAdminTokenStore } from '@/stores/admin-token';
import { tradingPairKeys } from '@/queries/keys';

const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>'
});

const ADMIN_KEY = tradingPairKeys.admin({ include_disabled: true });

function mountField() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const removeSpy = vi.spyOn(queryClient, 'removeQueries');
  const wrapper = mount(AdminTokenField, {
    global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]], stubs: { QBtn: ButtonStub } }
  });
  return { wrapper, invalidateSpy, removeSpy };
}

describe('AdminTokenField', () => {
  it('submit token → setToken + invalidate admin key；token input 清空', async () => {
    const { wrapper, invalidateSpy } = mountField();
    await wrapper.find('[data-test="token-input"]').setValue('test-admin-token');
    await wrapper.find('[data-test="token-submit"]').trigger('click');

    const store = useAdminTokenStore();
    expect(store.token).toBe('test-admin-token');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ADMIN_KEY });
    expect((wrapper.find('[data-test="token-input"]').element as HTMLInputElement).value).toBe('');
  });

  it('clear token → clearToken + removeQueries admin key', async () => {
    const { wrapper, removeSpy } = mountField();
    const store = useAdminTokenStore();
    store.setToken('test-admin-token');
    await nextTick();

    await wrapper.find('[data-test="token-clear"]').trigger('click');
    expect(store.token).toBe('');
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ADMIN_KEY });
  });
});
