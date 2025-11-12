

import type { ReactNode } from 'react';

export interface Branch {
    id: number;
    name: string;
    location?: string;
}

export interface User {
    id: number;
    username: string;
    password: string;
    role: 'admin' | 'branch-admin' | 'pos' | 'kitchen';
    allowedBranchIds?: number[];
    profilePictureUrl?: string;
}

export interface MenuOption {
    id: string;
    name: string;
    priceModifier: number;
    isDefault?: boolean;
}

export interface MenuOptionGroup {
    id: string;
    name: string;
    selectionType: 'single' | 'multiple';
    required?: boolean;
    options: MenuOption[];
}

export interface MenuItem {
    id: number;
    name: string;
    price: number;
    category: string;
    imageUrl: string;
    cookingTime?: number; // in minutes
    optionGroups?: MenuOptionGroup[];
}

export interface OrderItem extends MenuItem {
    quantity: number;
    isTakeaway: boolean;
    cartItemId: string;
    finalPrice: number;
    selectedOptions: MenuOption[];
}

export interface PaymentDetails {
    method: 'cash' | 'transfer';
    cashReceived?: number;
    changeGiven?: number;
}

interface BaseOrder {
    id: number;
    orderNumber: number;
    tableName: string;
    floor: 'lower' | 'upper';
    customerCount: number;
    items: OrderItem[];
    orderType: 'dine-in' | 'takeaway';
    taxRate: number;
    taxAmount: number;
    placedBy: string;
    parentOrderId?: number | null;
}

export interface ActiveOrder extends BaseOrder {
    status: 'waiting' | 'cooking' | 'served';
    orderTime: number; // timestamp
    cookingStartTime?: number; // timestamp
    isOverdue?: boolean;
}

export interface CompletedOrder extends BaseOrder {
    status: 'completed';
    orderTime: number;
    completionTime: number; // timestamp
    paymentDetails: PaymentDetails;
}

export const CANCELLATION_REASONS = [
    'ลูกค้าขอยกเลิก',
    'ทำรายการผิดพลาด',
    'วัตถุดิบหมด',
    'อื่นๆ',
] as const;

export type CancellationReason = typeof CANCELLATION_REASONS[number];

export interface CancelledOrder extends BaseOrder {
    status: 'cancelled';
    orderTime: number;
    cancellationTime: number;
    cancelledBy: string;
    cancellationReason: CancellationReason;
    cancellationNotes?: string;
}

export interface Table {
    id: number;
    name: string;
    floor: 'lower' | 'upper';
}

export interface ReceiptPrintSettings {
    printRestaurantName: boolean;
    printOrderId: boolean;
    printTableInfo: boolean;
    printDateTime: boolean;
    printPlacedBy: boolean;
    printItems: boolean;
    printSubtotal: boolean;
    printTax: boolean;
    printTotal: boolean;
    printPaymentDetails: boolean;
    printThankYouMessage: boolean;
}

export interface KitchenPrinterSettings {
    ipAddress: string;
    port?: string;
    paperWidth: '58mm' | '80mm';
}

export interface CashierPrinterSettings {
    ipAddress: string;
    port?: string;
    paperWidth: '58mm' | '80mm';
    receiptOptions: ReceiptPrintSettings;
}

export interface PrinterConfig {
    kitchen: KitchenPrinterSettings | null;
    cashier: CashierPrinterSettings | null;
}

export interface StockItem {
    id: number;
    name: string;
    category: string;
    quantity: number;
    unit: string;
    reorderPoint: number;
    lastUpdated: number; // timestamp
}

export type View = 'pos' | 'kitchen' | 'tables' | 'dashboard' | 'history' | 'stock';

export interface NavItem {
    id: string;
    label: string;
    icon: ReactNode;
    view?: View;
    onClick?: () => void;
    disabled?: boolean;
    badge?: number;
    subItems?: NavItem[];
}