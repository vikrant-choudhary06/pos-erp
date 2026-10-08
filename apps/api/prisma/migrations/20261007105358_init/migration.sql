-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'CAFE', 'QSR', 'BAR', 'CLOUD_KITCHEN', 'BAKERY', 'HOTEL_RESTAURANT', 'OTHER');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PrinterConnection" AS ENUM ('NETWORK', 'USB', 'BLUETOOTH');

-- CreateEnum
CREATE TYPE "PaperWidth" AS ENUM ('MM_58', 'MM_80');

-- CreateEnum
CREATE TYPE "FoodType" AS ENUM ('VEG', 'NON_VEG', 'EGG');

-- CreateEnum
CREATE TYPE "MenuItemType" AS ENUM ('SINGLE', 'COMBO');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'COUNTER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'BILLED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'SENT', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KotStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'BILLED', 'RESERVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'WALLET', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCESS', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('ORDER', 'ITEM');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('PAY_IN', 'PAY_OUT');

-- CreateEnum
CREATE TYPE "LoyaltyTxnType" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE');

-- CreateEnum
CREATE TYPE "BaseUnit" AS ENUM ('G', 'ML', 'PCS');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_REVERSAL', 'WASTAGE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" DECIMAL(12,2) NOT NULL,
    "priceYearly" DECIMAL(12,2) NOT NULL,
    "maxOutlets" INTEGER NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxDevices" INTEGER NOT NULL,
    "features" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "businessCode" TEXT NOT NULL,
    "businessType" "BusinessType" NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "legalName" TEXT,
    "gstin" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outlet" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "gstin" TEXT,
    "fssaiNo" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "priceIncludesTax" BOOLEAN NOT NULL DEFAULT false,
    "dayStartTime" TEXT NOT NULL DEFAULT '05:00',
    "invoicePrefix" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "allOutlets" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOutlet" (
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "outletId" UUID NOT NULL,

    CONSTRAINT "UserOutlet_pkey" PRIMARY KEY ("userId","outletId")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" UUID,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "signupTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "connection" "PrinterConnection" NOT NULL,
    "address" TEXT,
    "paperWidth" "PaperWidth" NOT NULL DEFAULT 'MM_80',
    "isBillPrinter" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "printerId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxGroup" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxComponent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "taxGroupId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaxComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "type" "MenuItemType" NOT NULL DEFAULT 'SINGLE',
    "name" TEXT NOT NULL,
    "shortCode" TEXT,
    "description" TEXT,
    "foodType" "FoodType" NOT NULL,
    "imageUrl" TEXT,
    "hsnCode" TEXT,
    "taxGroupId" UUID,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemVariant" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuItemVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierGroup" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierOption" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "foodType" "FoodType",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModifierOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemModifierGroup" (
    "tenantId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "modifierGroupId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItemModifierGroup_pkey" PRIMARY KEY ("menuItemId","modifierGroupId")
);

-- CreateTable
CREATE TABLE "ComboComponent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "comboItemId" UUID NOT NULL,
    "componentItemId" UUID NOT NULL,
    "variantId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ComboComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletMenuItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "stationId" UUID,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OutletMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemPrice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "variantId" UUID,
    "orderType" "OrderType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "MenuItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorArea" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FloorArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "areaId" UUID,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "posX" INTEGER,
    "posY" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "birthday" DATE,
    "anniversary" DATE,
    "gstin" TEXT,
    "address" TEXT,
    "loyaltyPoints" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "orderId" UUID,
    "type" "LoyaltyTxnType" NOT NULL,
    "points" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "deviceId" UUID,
    "businessDate" DATE NOT NULL,
    "orderNo" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'POS',
    "tableId" UUID,
    "customerId" UUID,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "covers" INTEGER,
    "waiterId" UUID,
    "createdById" UUID NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "serviceCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "variantId" UUID,
    "kotId" UUID,
    "stationId" UUID,
    "itemName" TEXT NOT NULL,
    "variantName" TEXT,
    "foodType" "FoodType" NOT NULL,
    "hsnCode" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxBreakup" JSONB NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "modifiersTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemModifier" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "modifierOptionId" UUID,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrderItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kot" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "stationId" UUID,
    "kotNo" TEXT NOT NULL,
    "status" "KotStatus" NOT NULL DEFAULT 'NEW',
    "createdById" UUID NOT NULL,
    "printedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "maxAmount" DECIMAL(12,2),
    "minOrderAmount" DECIMAL(12,2),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDiscount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID,
    "discountId" UUID,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "appliedById" UUID NOT NULL,
    "approvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "series" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerGstin" TEXT,
    "placeOfSupply" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "serviceCharge" DECIMAL(12,2) NOT NULL,
    "taxTotal" DECIMAL(12,2) NOT NULL,
    "roundOff" DECIMAL(12,2) NOT NULL,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelReason" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTaxLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "taxName" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "taxableAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InvoiceTaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "invoiceId" UUID,
    "shiftId" UUID,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tipAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCESS',
    "receivedById" UUID NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "deviceId" UUID,
    "businessDate" DATE NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedById" UUID NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingCash" DECIMAL(12,2) NOT NULL,
    "closedById" UUID,
    "closedAt" TIMESTAMP(3),
    "expectedCash" DECIMAL(12,2),
    "closingCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayClose" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "closedById" UUID NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "DayClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "baseUnit" "BaseUnit" NOT NULL,
    "purchaseUnit" TEXT,
    "purchaseUnitFactor" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "reorderLevel" DECIMAL(14,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletStock" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(14,3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutletStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4),
    "balanceAfter" DECIMAL(14,3),
    "referenceType" TEXT,
    "referenceId" UUID,
    "reason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "variantId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recipeId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "countedById" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "systemQty" DECIMAL(14,3) NOT NULL,
    "countedQty" DECIMAL(14,3) NOT NULL,
    "variance" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fromOutletId" UUID NOT NULL,
    "toOutletId" UUID NOT NULL,
    "transferNo" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedById" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "receivedQty" DECIMAL(14,3),
    "unitCost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "balanceDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "poNo" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "receivedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "grnNo" TEXT NOT NULL,
    "vendorInvoiceNo" TEXT,
    "vendorInvoiceDate" DATE,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxTotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "receivedById" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "expiryDate" DATE,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPayment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID NOT NULL,

    CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "outletId" UUID,
    "userId" UUID,
    "deviceId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_businessCode_key" ON "Tenant"("businessCode");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Outlet_tenantId_code_key" ON "Outlet"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_employeeCode_key" ON "User"("tenantId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserOutlet_tenantId_idx" ON "UserOutlet"("tenantId");

-- CreateIndex
CREATE INDEX "Device_tenantId_idx" ON "Device"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_outletId_code_key" ON "Device"("outletId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OtpCode_signupTokenHash_key" ON "OtpCode"("signupTokenHash");

-- CreateIndex
CREATE INDEX "OtpCode_email_createdAt_idx" ON "OtpCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX "Printer_tenantId_idx" ON "Printer"("tenantId");

-- CreateIndex
CREATE INDEX "KitchenStation_tenantId_idx" ON "KitchenStation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_outletId_name_key" ON "KitchenStation"("outletId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TaxGroup_tenantId_name_key" ON "TaxGroup"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TaxComponent_tenantId_idx" ON "TaxComponent"("tenantId");

-- CreateIndex
CREATE INDEX "MenuCategory_tenantId_idx" ON "MenuCategory"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_categoryId_idx" ON "MenuItem"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_tenantId_shortCode_key" ON "MenuItem"("tenantId", "shortCode");

-- CreateIndex
CREATE INDEX "MenuItemVariant_tenantId_idx" ON "MenuItemVariant"("tenantId");

-- CreateIndex
CREATE INDEX "ModifierGroup_tenantId_idx" ON "ModifierGroup"("tenantId");

-- CreateIndex
CREATE INDEX "ModifierOption_tenantId_idx" ON "ModifierOption"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItemModifierGroup_tenantId_idx" ON "MenuItemModifierGroup"("tenantId");

-- CreateIndex
CREATE INDEX "ComboComponent_tenantId_idx" ON "ComboComponent"("tenantId");

-- CreateIndex
CREATE INDEX "OutletMenuItem_tenantId_idx" ON "OutletMenuItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OutletMenuItem_outletId_menuItemId_key" ON "OutletMenuItem"("outletId", "menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemPrice_outletId_menuItemId_idx" ON "MenuItemPrice"("outletId", "menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemPrice_tenantId_idx" ON "MenuItemPrice"("tenantId");

-- CreateIndex
CREATE INDEX "FloorArea_tenantId_idx" ON "FloorArea"("tenantId");

-- CreateIndex
CREATE INDEX "DiningTable_tenantId_idx" ON "DiningTable"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_outletId_name_key" ON "DiningTable"("outletId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_tenantId_customerId_idx" ON "LoyaltyTransaction"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Order_tenantId_outletId_businessDate_idx" ON "Order"("tenantId", "outletId", "businessDate");

-- CreateIndex
CREATE INDEX "Order_outletId_status_idx" ON "Order"("outletId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_outletId_businessDate_orderNo_key" ON "Order"("outletId", "businessDate", "orderNo");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_menuItemId_idx" ON "OrderItem"("tenantId", "menuItemId");

-- CreateIndex
CREATE INDEX "OrderItemModifier_tenantId_idx" ON "OrderItemModifier"("tenantId");

-- CreateIndex
CREATE INDEX "Kot_outletId_status_idx" ON "Kot"("outletId", "status");

-- CreateIndex
CREATE INDEX "Kot_tenantId_idx" ON "Kot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Discount_tenantId_code_key" ON "Discount"("tenantId", "code");

-- CreateIndex
CREATE INDEX "OrderDiscount_tenantId_createdAt_idx" ON "OrderDiscount"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_outletId_series_financialYear_key" ON "InvoiceSequence"("outletId", "series", "financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_outletId_businessDate_idx" ON "Invoice"("tenantId", "outletId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_outletId_invoiceNo_key" ON "Invoice"("outletId", "invoiceNo");

-- CreateIndex
CREATE INDEX "InvoiceTaxLine_tenantId_idx" ON "InvoiceTaxLine"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_outletId_paidAt_idx" ON "Payment"("tenantId", "outletId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Shift_tenantId_outletId_businessDate_idx" ON "Shift"("tenantId", "outletId", "businessDate");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_idx" ON "CashMovement"("tenantId");

-- CreateIndex
CREATE INDEX "DayClose_tenantId_idx" ON "DayClose"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DayClose_outletId_businessDate_key" ON "DayClose"("outletId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_name_key" ON "InventoryItem"("tenantId", "name");

-- CreateIndex
CREATE INDEX "OutletStock_tenantId_idx" ON "OutletStock"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OutletStock_outletId_inventoryItemId_key" ON "OutletStock"("outletId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_outletId_inventoryItemId_createdAt_idx" ON "StockMovement"("tenantId", "outletId", "inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "Recipe_tenantId_idx" ON "Recipe"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_menuItemId_variantId_key" ON "Recipe"("menuItemId", "variantId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_tenantId_idx" ON "RecipeIngredient"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_inventoryItemId_key" ON "RecipeIngredient"("recipeId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "StockCount_tenantId_outletId_idx" ON "StockCount"("tenantId", "outletId");

-- CreateIndex
CREATE INDEX "StockCountLine_tenantId_idx" ON "StockCountLine"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_stockCountId_inventoryItemId_key" ON "StockCountLine"("stockCountId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_tenantId_transferNo_key" ON "StockTransfer"("tenantId", "transferNo");

-- CreateIndex
CREATE INDEX "StockTransferLine_tenantId_idx" ON "StockTransferLine"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_tenantId_name_key" ON "Vendor"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_poNo_key" ON "PurchaseOrder"("tenantId", "poNo");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_tenantId_idx" ON "PurchaseOrderLine"("tenantId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_tenantId_outletId_receivedAt_idx" ON "GoodsReceipt"("tenantId", "outletId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_tenantId_grnNo_key" ON "GoodsReceipt"("tenantId", "grnNo");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_tenantId_idx" ON "GoodsReceiptLine"("tenantId");

-- CreateIndex
CREATE INDEX "VendorPayment_tenantId_vendorId_idx" ON "VendorPayment"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutlet" ADD CONSTRAINT "UserOutlet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutlet" ADD CONSTRAINT "UserOutlet_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStation" ADD CONSTRAINT "KitchenStation_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStation" ADD CONSTRAINT "KitchenStation_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxComponent" ADD CONSTRAINT "TaxComponent_taxGroupId_fkey" FOREIGN KEY ("taxGroupId") REFERENCES "TaxGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_taxGroupId_fkey" FOREIGN KEY ("taxGroupId") REFERENCES "TaxGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemVariant" ADD CONSTRAINT "MenuItemVariant_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemModifierGroup" ADD CONSTRAINT "MenuItemModifierGroup_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemModifierGroup" ADD CONSTRAINT "MenuItemModifierGroup_modifierGroupId_fkey" FOREIGN KEY ("modifierGroupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_comboItemId_fkey" FOREIGN KEY ("comboItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponent" ADD CONSTRAINT "ComboComponent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MenuItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletMenuItem" ADD CONSTRAINT "OutletMenuItem_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletMenuItem" ADD CONSTRAINT "OutletMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletMenuItem" ADD CONSTRAINT "OutletMenuItem_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "KitchenStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPrice" ADD CONSTRAINT "MenuItemPrice_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPrice" ADD CONSTRAINT "MenuItemPrice_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPrice" ADD CONSTRAINT "MenuItemPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MenuItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorArea" ADD CONSTRAINT "FloorArea_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FloorArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MenuItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_kotId_fkey" FOREIGN KEY ("kotId") REFERENCES "Kot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_modifierOptionId_fkey" FOREIGN KEY ("modifierOptionId") REFERENCES "ModifierOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kot" ADD CONSTRAINT "Kot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kot" ADD CONSTRAINT "Kot_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "KitchenStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTaxLine" ADD CONSTRAINT "InvoiceTaxLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletStock" ADD CONSTRAINT "OutletStock_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletStock" ADD CONSTRAINT "OutletStock_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MenuItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
