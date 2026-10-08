import { describe, expect, it } from 'vitest';
import { calculateBill } from '../src/bill';
import { businessDate, financialYear } from '../src/dates';

const gst5 = [
  { name: 'CGST', rate: 2.5 },
  { name: 'SGST', rate: 2.5 },
];

describe('calculateBill', () => {
  it('adds GST on top of menu prices', () => {
    const bill = calculateBill({
      lines: [
        { key: 'a', unitPrice: 280, quantity: 1, taxes: gst5 },
        { key: 'b', unitPrice: 50, quantity: 4, taxes: gst5 },
      ],
    });

    expect(bill.subtotal).toBe(480);
    expect(bill.tax).toBe(24);
    expect(bill.total).toBe(504);
    expect(bill.roundOff).toBe(0);
    expect(bill.taxSummary).toEqual([
      { name: 'CGST', rate: 2.5, taxable: 480, amount: 12 },
      { name: 'SGST', rate: 2.5, taxable: 480, amount: 12 },
    ]);
  });

  it('rounds the grand total to the rupee', () => {
    const bill = calculateBill({ lines: [{ key: 'a', unitPrice: 99, quantity: 1, taxes: gst5 }] });
    // 99 + 4.95 = 103.95
    expect(bill.tax).toBe(4.96); // 2.48 + 2.48, each half rounded on its own
    expect(bill.total).toBe(104);
    expect(bill.roundOff).toBeCloseTo(0.04, 2);
  });

  it('applies the discount before tax and spreads it across lines', () => {
    const bill = calculateBill({
      lines: [
        { key: 'a', unitPrice: 300, quantity: 1, taxes: gst5 },
        { key: 'b', unitPrice: 100, quantity: 1, taxes: [] },
      ],
      discount: { type: 'PERCENT', value: 10 },
    });

    expect(bill.discount).toBe(40);
    expect(bill.lines[0].discount).toBe(30);
    expect(bill.lines[1].discount).toBe(10);
    expect(bill.tax).toBe(13.5); // 5% of 270
    // 270 + 90 + 13.50 = 373.50, rounded up
    expect(bill.total).toBe(374);
    expect(bill.roundOff).toBe(0.5);
  });

  it('never discounts more than the bill', () => {
    const bill = calculateBill({
      lines: [{ key: 'a', unitPrice: 50, quantity: 1, taxes: [] }],
      discount: { type: 'FLAT', value: 500 },
    });
    expect(bill.discount).toBe(50);
    expect(bill.total).toBe(0);
  });

  it('backs tax out of tax-inclusive prices', () => {
    const bill = calculateBill({
      lines: [{ key: 'a', unitPrice: 105, quantity: 1, taxes: gst5 }],
      priceIncludesTax: true,
    });
    expect(bill.lines[0].taxable).toBe(100);
    expect(bill.tax).toBe(5);
    expect(bill.total).toBe(105);
  });

  it('charges service on the pre-tax amount', () => {
    const bill = calculateBill({
      lines: [{ key: 'a', unitPrice: 1000, quantity: 1, taxes: gst5 }],
      serviceChargePercent: 10,
    });
    expect(bill.serviceCharge).toBe(100);
    expect(bill.total).toBe(1150);
  });

  it('handles fractional quantities', () => {
    const bill = calculateBill({
      lines: [{ key: 'a', unitPrice: 400, quantity: 0.25, taxes: [] }],
    });
    expect(bill.subtotal).toBe(100);
  });
});

describe('dates', () => {
  it('counts late night sales towards the previous day', () => {
    // 01:30 IST on 8 Oct is 20:00 UTC on 7 Oct
    expect(businessDate(new Date('2026-10-07T20:00:00Z'))).toBe('2026-10-07');
    // 06:00 IST on 8 Oct
    expect(businessDate(new Date('2026-10-08T00:30:00Z'))).toBe('2026-10-08');
  });

  it('works out the Indian financial year', () => {
    expect(financialYear('2026-10-07')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2027-04-01')).toBe('2027-28');
  });
});
