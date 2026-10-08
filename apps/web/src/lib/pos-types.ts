import type { FoodType, OrderType, OutletSettings, PaymentMethod } from '@pos/shared';

export type PosItem = {
  id: string;
  categoryId: string;
  name: string;
  shortCode: string | null;
  foodType: FoodType;
  basePrice: string;
  hasVariants: boolean;
  variants: { id: string; name: string; price: string }[];
  prices: { variantId: string | null; orderType: OrderType; price: string }[];
  taxes: { name: string; rate: string }[];
  outOfStock: boolean;
  modifierGroups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { id: string; name: string; price: string }[];
  }[];
};

export type PosMenu = {
  outlet: {
    id: string;
    name: string;
    code: string;
    priceIncludesTax: boolean;
    settings: OutletSettings;
  };
  categories: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  tables: { id: string; name: string; capacity: number; areaId: string | null }[];
  items: PosItem[];
};

export type OrderItem = {
  id: string;
  menuItemId: string;
  variantId: string | null;
  itemName: string;
  variantName: string | null;
  foodType: FoodType;
  unitPrice: string;
  modifiersTotal: string;
  quantity: string;
  lineTotal: string;
  taxBreakup: { name: string; rate: number; amount: number }[];
  status: 'PENDING' | 'SENT' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  notes: string | null;
  cancelReason: string | null;
  kotId: string | null;
  modifiers: { id: string; name: string; price: string }[];
};

export type Order = {
  id: string;
  outletId: string;
  orderNo: string;
  businessDate: string;
  type: OrderType;
  status: 'OPEN' | 'BILLED' | 'PAID' | 'VOID';
  tableId: string | null;
  table: { id: string; name: string } | null;
  covers: number | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customer: { id: string; name: string | null; phone: string; creditBalance: string } | null;
  notes: string | null;
  subtotal: string;
  discountTotal: string;
  serviceCharge: string;
  taxTotal: string;
  roundOff: string;
  grandTotal: string;
  paidTotal: string;
  openedAt: string;
  billedAt: string | null;
  closedAt: string | null;
  voidReason: string | null;
  items: OrderItem[];
  discount: {
    type: 'PERCENT' | 'FLAT';
    value: string;
    amount: string;
    reason: string | null;
  } | null;
  payments: {
    id: string;
    method: PaymentMethod;
    amount: string;
    tipAmount: string;
    reference: string | null;
    paidAt: string;
  }[];
  invoice: {
    id: string;
    invoiceNo: string;
    issuedAt: string;
    customerGstin: string | null;
    taxLines: { taxName: string; rate: string; taxableAmount: string; taxAmount: string }[];
  } | null;
  kots: { id: string; kotNo: string; status: string; createdAt: string }[];
};

export type Kot = {
  id: string;
  kotNo: string;
  status: 'NEW' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  createdAt: string;
  station: { id?: string; name: string } | null;
  order: { id?: string; orderNo: string; type: OrderType; table: { name: string } | null };
  items: {
    id: string;
    itemName: string;
    variantName: string | null;
    quantity: string;
    notes: string | null;
    status: string;
    foodType?: FoodType;
    modifiers: { name: string }[];
  }[];
};

export type Shift = {
  id: string;
  outletId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  closingCash: string | null;
  expectedCash: number | string;
  difference: string | null;
  openedBy: string | null;
  closedBy: string | null;
  payments: { method: PaymentMethod; count: number; amount: number; tips: number }[];
  cashMovements: {
    id: string;
    type: 'PAY_IN' | 'PAY_OUT';
    amount: string;
    reason: string;
    createdAt: string;
  }[];
  cashSales: number;
  payIn: number;
  payOut: number;
};
