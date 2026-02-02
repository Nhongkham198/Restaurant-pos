
import type { ReactNode } from 'react';

// ... (Other interfaces remain unchanged) ...

export interface KitchenPrinterSettings {
    connectionType: PrinterConnectionType;
    ipAddress: string; // The Node.js Server IP
    port?: string;     // The Node.js Server Port
    paperWidth: '58mm' | '80mm';
    targetPrinterIp?: string; // The Actual Printer IP (Hardware)
    targetPrinterPort?: string; // The Actual Printer Port (Hardware, usually 9100)
    // NEW: For USB identification
    usbVid?: string; // e.g. "0x0483"
    usbPid?: string; // e.g. "0x5743"
}

export interface CashierPrinterSettings {
    connectionType: PrinterConnectionType;
    ipAddress: string;
    port?: string;
    paperWidth: '58mm' | '80mm';
    targetPrinterIp?: string;
    targetPrinterPort?: string;
    // NEW: For USB identification
    usbVid?: string;
    usbPid?: string;
    receiptOptions: ReceiptPrintSettings;
}

// ... (Rest of the file remains unchanged) ...
export interface Branch {
    id: number;
    name: string;
    location?: string;
}

export interface LeaveQuotas {
    sick: number;
    personal: number;
    vacation: number;
}

export interface DeliveryProvider {
    id: string;
    name: string;
    iconUrl: string; 
    isEnabled: boolean;
    isDefault?: boolean; 
}

export interface User {
    id: number;
    username: string;
    password: string;
    role: 'admin' | 'branch-admin' | 'pos' | 'kitchen' | 'auditor' | 'table';
    allowedBranchIds?: number[];
    assignedTableId?: number;
    profilePictureUrl?: string;
    leaveQuotas?: LeaveQuotas;
    fcmTokens?: string[];
}

export interface MenuOption {
    id: string;
    name: string;
    nameEn?: string;
    priceModifier: number;
    isDefault?: boolean;
}

export interface MenuOptionGroup {
    id: string;
    name: string;
    nameEn?: string;
    selectionType: 'single' | 'multiple';
    required?: boolean;
    options: MenuOption[];
}

export interface MenuItem {
    id: number;
    name: string;
    nameEn?: string;
    price: number;
    category: string;
    imageUrl: string;
    cookingTime?: number;
    optionGroups?: MenuOptionGroup[];
    isAvailable?: boolean;
    isVisible?: boolean;
}

export type TakeawayCutleryOption = 'spoon-fork' | 'chopsticks' | 'other' | 'none';

export interface OrderItem extends MenuItem {
    quantity: number;
    isTakeaway: boolean;
    cartItemId: string;
    finalPrice: number;
    selectedOptions: MenuOption[];
    notes?: string;
    takeawayCutlery?: TakeawayCutleryOption[];
    takeawayCutleryNotes?: string;
    originalOrderNumber?: number;
}

export interface PaymentDetails {
    method: 'cash' | 'transfer';
    cashReceived?: number;
    changeGiven?: number;
    slipImage?: string;
}

interface BaseOrder {
    id: number;
    orderNumber: number;
    manualOrderNumber?: string | null;
    tableId: number;
    tableName: string;
    customerName?: string;
    floor: string;
    customerCount: number;
    items: OrderItem[];
    orderType: 'dine-in' | 'takeaway' | 'lineman';
    taxRate: number;
    taxAmount: number;
    placedBy: string;
    parentOrderId?: number | null;
    takeawayCutlery?: TakeawayCutleryOption[];
    takeawayCutleryNotes?: string;
    isDeleted?: boolean;
    deletedBy?: string;
    mergedOrderNumbers?: number[];
    splitCount?: number;
    isSplitChild?: boolean;
    splitIndex?: number;
}

export const CANCELLATION_REASONS = [
    'ลูกค้าขอยกเลิก',
    'ทำรายการผิดพลาด',
    'วัตถุดิบหมด',
    'อื่นๆ',
] as const;

export type CancellationReason = typeof CANCELLATION_REASONS[number];

export interface ActiveOrder extends BaseOrder {
    status: 'waiting' | 'cooking' | 'served' | 'completed' | 'cancelled';
    orderTime: number; 
    cookingStartTime?: number; 
    isOverdue?: boolean;
    completionTime?: number;
    paymentDetails?: PaymentDetails;
    cancellationTime?: number;
    cancelledBy?: string;
    cancellationReason?: CancellationReason;
    cancellationNotes?: string;
}

export interface CompletedOrder extends BaseOrder {
    status: 'completed';
    orderTime: number;
    completionTime: number;
    paymentDetails: PaymentDetails;
    completedBy?: string; 
}

export interface CancelledOrder extends BaseOrder {
    status: 'cancelled';
    orderTime: number;
    cancellationTime: number;
    cancelledBy: string;
    cancellationReason: CancellationReason;
    cancellationNotes?: string;
}

export interface Reservation {
    name: string;
    time: string;
    contact?: string;
}

export interface Table {
    id: number;
    name: string;
    floor: string;
    activePin?: string | null; 
    reservation?: Reservation | null;
}

export interface ReceiptPrintSettings {
    showLogo: boolean;
    showRestaurantName: boolean;
    showAddress: boolean;
    address: string;
    showPhoneNumber: boolean;
    phoneNumber: string;
    showTable: boolean;
    showStaff: boolean;
    showDateTime: boolean;
    showOrderId: boolean;
    showItems: boolean;
    showSubtotal: boolean;
    showTax: boolean;
    showTotal: boolean;
    showPaymentMethod: boolean;
    showThankYouMessage: boolean;
    thankYouMessage: string;
}

export type PrinterConnectionType = 'network' | 'usb';

export interface PrinterConfig {
    kitchen: KitchenPrinterSettings | null;
    cashier: CashierPrinterSettings | null;
}

export interface StockItem {
    id: number;
    name: string;
    category: string;
    imageUrl?: string; 
    quantity: number;
    unit: string;
    reorderPoint: number;
    withdrawalCount?: number; 
    monthlyWithdrawals?: Record<string, number>; 
    lastUpdated: number; 
    lastUpdatedBy?: string;
    orderDate?: number;
    receivedDate?: number;
}

export interface LeaveRequest {
    id: number;
    userId: number;
    username: string;
    branchId: number; 
    startDate: number;
    endDate: number; 
    type: 'sick' | 'personal' | 'vacation' | 'leave-without-pay' | 'other';
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    isHalfDay?: boolean; 
    acknowledgedBy?: number[]; 
}

export interface StaffCall {
    id: number; 
    tableId: number;
    tableName: string;
    customerName: string;
    branchId: number;
    timestamp: number;
}

export type MaintenanceStatus = 'active' | 'broken' | 'repairing';

export interface MaintenanceItem {
    id: number;
    name: string;
    imageUrl: string;
    description?: string;
    cycleMonths: number; 
    lastMaintenanceDate: number | null; 
    status?: MaintenanceStatus; 
}

export interface MaintenanceLog {
    id: number;
    itemId: number;
    maintenanceDate: number; 
    performedBy: string;
    notes?: string;
    beforeImage?: string; 
    afterImage?: string; 
}

export type View = 'pos' | 'kitchen' | 'tables' | 'dashboard' | 'history' | 'stock' | 'stock-analytics' | 'leave' | 'leave-analytics' | 'maintenance';

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

export interface PrintHistoryEntry {
    id: number; 
    timestamp: number;
    orderNumber: number;
    tableName: string;
    printedBy: string;
    printerType: 'kitchen' | 'receipt';
    status: 'success' | 'failed';
    errorMessage: string | null;
    orderItemsPreview: string[];
    isReprint: boolean;
    isDeleted?: boolean; 
    deletedBy?: string; 
}

export interface OrderCounter {
    count: number;
    lastResetDate: string; 
}

export type PrinterStatus = 'idle' | 'checking' | 'success' | 'error';

export interface SystemPrinterStatus {
    kitchen: PrinterStatus;
    cashier: PrinterStatus;
}
