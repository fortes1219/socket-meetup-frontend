import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import SymbolSelector from '@/views/home/components/SymbolSelector.vue';
import type { PublicTradingPair } from '@/service/api/trading-pairs';

// q-btn stub：真 button，轉發 click + 反映 disable，便於斷言 disabled 與點擊。
const QBtnStub = defineComponent({
  props: { disable: { type: Boolean, default: false } },
  emits: ['click'],
  template: '<button :disabled="disable" @click="$emit(\'click\')"><slot /></button>'
});

function pair(symbol: string, order: number): PublicTradingPair {
  return { symbol, base_asset: symbol.replace('USDT', ''), quote_asset: 'USDT', display_order: order };
}

const PAIRS = [pair('BTCUSDT', 0), pair('ETHUSDT', 1), pair('XRPUSDT', 2)]; // XRPUSDT 非 registry-known

function mountSelector(selected: string | null) {
  return mount(SymbolSelector, {
    props: { pairs: PAIRS, selected },
    global: { stubs: { QBtn: QBtnStub } }
  });
}

describe('SymbolSelector', () => {
  it('known 可選、unknown disabled + 「不支援 realtime」標籤', () => {
    const wrapper = mountSelector('BTCUSDT');
    expect(wrapper.find('[data-test="symbol-option-BTCUSDT"]').attributes('disabled')).toBeUndefined();
    const xrp = wrapper.find('[data-test="symbol-option-XRPUSDT"]');
    expect(xrp.attributes('disabled')).toBeDefined();
    expect(xrp.text()).toContain('不支援 realtime');
  });

  it('點 known（非當前）→ emit select(symbol)', async () => {
    const wrapper = mountSelector('BTCUSDT');
    await wrapper.find('[data-test="symbol-option-ETHUSDT"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['ETHUSDT']]);
  });

  it('點 unknown → 不 emit（guard 擋下）', async () => {
    const wrapper = mountSelector('BTCUSDT');
    await wrapper.find('[data-test="symbol-option-XRPUSDT"]').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('點當前 selected → 不 emit', async () => {
    const wrapper = mountSelector('BTCUSDT');
    await wrapper.find('[data-test="symbol-option-BTCUSDT"]').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
