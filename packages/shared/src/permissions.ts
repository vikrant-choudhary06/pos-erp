export const PERMISSIONS = {
  'hotel.view': 'View hotel reservations and guest accounts',
  'hotel.manage': 'Configure hotel rooms and rates',
  'hotel.frontdesk': 'Manage reservations and check-in/out',
  'hotel.billing': 'Collect hotel payments and post charges',
  'hotel.housekeeping': 'Update room cleaning status',
  'hotel.close_day': 'Close the hotel business day',
  'outlet.manage': 'Manage outlets and business settings',
  'staff.manage': 'Add staff and edit roles',
  'menu.manage': 'Edit menu, prices and taxes',
  'tables.manage': 'Edit floor plan and tables',
  'reports.view': 'View sales reports',
  'order.take': 'Take orders and send KOTs',
  'order.cancel_item': 'Cancel items after KOT',
  'bill.settle': 'Print bills and accept payments',
  'bill.discount': 'Give discounts',
  'bill.void': 'Void bills',
  'shift.manage': 'Open and close cash shifts',
  'kitchen.view': 'Use the kitchen display',
  'inventory.manage': 'Manage stock and recipes',
  'purchase.manage': 'Manage vendors and purchases',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: 'Hotel',
    permissions: [
      'hotel.view',
      'hotel.manage',
      'hotel.frontdesk',
      'hotel.billing',
      'hotel.housekeeping',
      'hotel.close_day',
    ],
  },
  { label: 'Admin', permissions: ['outlet.manage', 'staff.manage', 'reports.view'] },
  { label: 'Menu & floor', permissions: ['menu.manage', 'tables.manage'] },
  {
    label: 'Billing',
    permissions: [
      'order.take',
      'order.cancel_item',
      'bill.settle',
      'bill.discount',
      'bill.void',
      'shift.manage',
    ],
  },
  {
    label: 'Kitchen & stock',
    permissions: ['kitchen.view', 'inventory.manage', 'purchase.manage'],
  },
];

// Roles every new business starts with. Owners can edit or add more later.
export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  { name: 'Owner', description: 'Full access', permissions: ALL_PERMISSIONS },
  {
    name: 'Manager',
    description: 'Runs the outlet day to day',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'outlet.manage'),
  },
  {
    name: 'Cashier',
    description: 'Billing and payments',
    permissions: ['order.take', 'bill.settle', 'bill.discount', 'shift.manage'],
  },
  { name: 'Waiter', description: 'Takes orders at tables', permissions: ['order.take'] },
  { name: 'Chef', description: 'Kitchen display only', permissions: ['kitchen.view'] },
  {
    name: 'Receptionist',
    description: 'Hotel reservations and guest payments',
    permissions: ['hotel.view', 'hotel.frontdesk', 'hotel.billing'],
  },
  {
    name: 'Housekeeping',
    description: 'Room cleaning status only',
    permissions: ['hotel.housekeeping'],
  },
];
