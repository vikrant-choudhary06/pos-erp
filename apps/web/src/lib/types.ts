import type { BusinessType, FoodType, OutletSettings } from '@pos/shared';

export type Me = {
  offlineExpiresAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    employeeCode: string;
    isOwner: boolean;
    role: { id: string; name: string };
  };
  permissions: string[];
  business: {
    id: string;
    name: string;
    businessCode: string;
    businessType: BusinessType;
    status: string;
  };
  outlets: { id: string; name: string; code: string; city: string | null }[];
};

export type Business = {
  id: string;
  name: string;
  legalName: string | null;
  businessCode: string;
  businessType: BusinessType;
  email: string;
  phone: string;
  gstin: string | null;
};

export type Outlet = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  gstin: string | null;
  fssaiNo: string | null;
  priceIncludesTax: boolean;
  isActive: boolean;
  settings: Partial<OutletSettings>;
  _count: { tables: number; devices: number };
};

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { items: number };
};

export type Variant = { id: string; name: string; price: string };

export type MenuItem = {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  foodType: FoodType;
  hsnCode: string | null;
  basePrice: string;
  hasVariants: boolean;
  isActive: boolean;
  category: { id: string; name: string };
  taxGroup: { id: string; name: string } | null;
  variants: Variant[];
  modifierGroups: { modifierGroupId: string }[];
};

export type TaxGroup = {
  id: string;
  name: string;
  components: { id: string; name: string; rate: string }[];
};

export type Role = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  _count: { users: number };
};

export type Staff = {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  isOwner: boolean;
  allOutlets: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt: string | null;
  hasPassword: boolean;
  hasPin: boolean;
  role: { id: string; name: string };
  outlets: { id: string; name: string }[];
};

export type Area = { id: string; name: string; sortOrder: number };

export type DiningTable = {
  id: string;
  name: string;
  capacity: number;
  areaId: string | null;
  status: string;
  isActive: boolean;
};
