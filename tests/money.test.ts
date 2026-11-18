import { describe, expect, it } from 'vitest';
import { calculateTaxMinorUnits, formatMinorUnits, parseMoneyToMinorUnits } from '../api/_lib/money';

describe('money helpers', () => {
  it('parses decimal amounts without floating point multiplication', () => {
    expect(parseMoneyToMinorUnits('19.99')).toBe(1999);
    expect(parseMoneyToMinorUnits(20)).toBe(2000);
  });

  it('rejects negative, exponent and over-precision values', () => {
    expect(() => parseMoneyToMinorUnits('-1.00')).toThrow();
    expect(() => parseMoneyToMinorUnits('1e3')).toThrow();
    expect(() => parseMoneyToMinorUnits('1.001')).toThrow();
  });

  it('formats cents and calculates tax in minor units', () => {
    expect(formatMinorUnits(12345)).toBe('123.45');
    expect(calculateTaxMinorUnits(10000, '15')).toBe(1500);
    expect(calculateTaxMinorUnits(10001, '7.5')).toBe(750);
  });
});
