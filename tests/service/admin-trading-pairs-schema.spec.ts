import { describe, expect, it } from 'vitest';
import {
  AdminListQuerySchema,
  AdminTradingPairSchema,
  CreateTradingPairBodySchema,
  PatchTradingPairBodySchema
} from '@/service/schema/trading-pair';

const validAdminPair = {
  id: '11111111-1111-1111-1111-111111111111',
  symbol: 'BTCUSDT',
  base_asset: 'BTC',
  quote_asset: 'USDT',
  enabled: false,
  display_order: 0,
  created_at: 1,
  updated_at: 2
};

describe('AdminTradingPairSchema', () => {
  it('接受合法 admin pair', () => {
    expect(AdminTradingPairSchema.parse(validAdminPair)).toEqual(validAdminPair);
  });

  it('strict：拒未知欄', () => {
    expect(() => AdminTradingPairSchema.parse({ ...validAdminPair, extra: 1 })).toThrow();
  });

  it('拒非 uuid id / 負 display_order', () => {
    expect(() => AdminTradingPairSchema.parse({ ...validAdminPair, id: 'nope' })).toThrow();
    expect(() => AdminTradingPairSchema.parse({ ...validAdminPair, display_order: -1 })).toThrow();
  });
});

describe('CreateTradingPairBodySchema', () => {
  it('trim + uppercase', () => {
    expect(CreateTradingPairBodySchema.parse({ symbol: ' btcusdt ' })).toEqual({ symbol: 'BTCUSDT' });
  });

  it('trim 後空 → reject', () => {
    expect(() => CreateTradingPairBodySchema.parse({ symbol: '   ' })).toThrow();
  });

  it('strict：拒未知欄', () => {
    expect(() => CreateTradingPairBodySchema.parse({ symbol: 'BTCUSDT', extra: 1 })).toThrow();
  });
});

describe('PatchTradingPairBodySchema', () => {
  it('單欄可 parse（enabled）', () => {
    expect(PatchTradingPairBodySchema.parse({ enabled: true })).toEqual({ enabled: true });
  });

  it('display_order 須 >= 0', () => {
    expect(PatchTradingPairBodySchema.parse({ display_order: 0 })).toEqual({ display_order: 0 });
    expect(() => PatchTradingPairBodySchema.parse({ display_order: -1 })).toThrow();
  });

  it('strict：拒未知欄', () => {
    expect(() => PatchTradingPairBodySchema.parse({ enabled: true, extra: 1 })).toThrow();
  });
});

describe('AdminListQuerySchema', () => {
  it('include_disabled 可省略 / 為 boolean', () => {
    expect(AdminListQuerySchema.parse({})).toEqual({});
    expect(AdminListQuerySchema.parse({ include_disabled: true })).toEqual({ include_disabled: true });
  });

  it('strict：拒未知欄', () => {
    expect(() => AdminListQuerySchema.parse({ include_disabled: true, extra: 1 })).toThrow();
  });
});
