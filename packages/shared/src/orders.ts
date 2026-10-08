export const ORDER_TYPES = {
  DINE_IN: 'Dine in',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
  COUNTER: 'Counter',
} as const;

export type OrderType = keyof typeof ORDER_TYPES;

export const PAYMENT_METHODS = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  WALLET: 'Wallet',
  CREDIT: 'On credit',
  OTHER: 'Other',
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export type OutletSettings = {
  serviceChargePercent: number;
  billFooter: string;
  /** print the KOT automatically when it is sent */
  printKot: boolean;
};

export const DEFAULT_OUTLET_SETTINGS: OutletSettings = {
  serviceChargePercent: 0,
  billFooter: 'Thank you, visit again',
  printKot: true,
};

export function outletSettings(raw: unknown): OutletSettings {
  const value = raw && typeof raw === 'object' ? (raw as Partial<OutletSettings>) : {};
  return { ...DEFAULT_OUTLET_SETTINGS, ...value };
}
