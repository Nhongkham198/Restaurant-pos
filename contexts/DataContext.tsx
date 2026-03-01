import React, { createContext, useContext, useMemo, ReactNode, useState, useEffect } from 'react';
import { useFirestoreSync, useFirestoreCollection, CollectionActions } from '../hooks/useFirestoreSync';
import { 
    MenuItem, Table, ActiveOrder, CompletedOrder, CancelledOrder, 
    StockItem, PrintHistoryEntry, MaintenanceItem, MaintenanceLog, 
    OrderCounter, StaffCall, LeaveRequest, PrinterConfig, DeliveryProvider,
    User, Branch, JobApplication, EmploymentContract, TimeRecord, PayrollRecord
} from '../types';
import { 
    DEFAULT_MENU_ITEMS, DEFAULT_CATEGORIES, DEFAULT_TABLES, DEFAULT_FLOORS,
    DEFAULT_STOCK_ITEMS, DEFAULT_STOCK_CATEGORIES, DEFAULT_STOCK_UNITS,
    DEFAULT_MAINTENANCE_ITEMS, DEFAULT_DELIVERY_PROVIDERS,
    DEFAULT_USERS, DEFAULT_BRANCHES,
    DEFAULT_JOB_APPLICATIONS, DEFAULT_EMPLOYMENT_CONTRACTS
} from '../constants';

interface DataContextType {
    // Auth & Branch
    currentUser: User | null;
    setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
    users: User[];
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    branches: Branch[];
    setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
    selectedBranch: Branch | null;
    setSelectedBranch: React.Dispatch<React.SetStateAction<Branch | null>>;
    isCustomerMode: boolean;
    setIsCustomerMode: React.Dispatch<React.SetStateAction<boolean>>;
    customerTableId: number | null;
    setCustomerTableId: React.Dispatch<React.SetStateAction<number | null>>;
    branchId: string | null;
    heavyDataBranchId: string | null;
    shouldLoadHeavyData: boolean;

    // Core Data
    menuItems: MenuItem[];
    setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
    categories: string[];
    setCategories: React.Dispatch<React.SetStateAction<string[]>>;
    tables: Table[];
    setTables: React.Dispatch<React.SetStateAction<Table[]>>;
    floors: string[];
    setFloors: React.Dispatch<React.SetStateAction<string[]>>;
    recommendedMenuItemIds: number[];
    setRecommendedMenuItemIds: React.Dispatch<React.SetStateAction<number[]>>;
    
    activeOrders: ActiveOrder[];
    rawActiveOrders: ActiveOrder[];
    activeOrdersActions: CollectionActions<ActiveOrder>;

    // Heavy Data
    legacyCompletedOrders: CompletedOrder[];
    setLegacyCompletedOrders: React.Dispatch<React.SetStateAction<CompletedOrder[]>>;
    legacyCancelledOrders: CancelledOrder[];
    setLegacyCancelledOrders: React.Dispatch<React.SetStateAction<CancelledOrder[]>>;
    newCompletedOrders: CompletedOrder[];
    newCompletedOrdersActions: CollectionActions<CompletedOrder>;
    newCancelledOrders: CancelledOrder[];
    newCancelledOrdersActions: CollectionActions<CancelledOrder>;
    completedOrders: CompletedOrder[];
    cancelledOrders: CancelledOrder[];

    stockItems: StockItem[];
    setStockItems: React.Dispatch<React.SetStateAction<StockItem[]>>;
    stockTags: StockTag[];
    setStockTags: React.Dispatch<React.SetStateAction<StockTag[]>>;
    stockCategories: string[];
    setStockCategories: React.Dispatch<React.SetStateAction<string[]>>;
    stockUnits: string[];
    setStockUnits: React.Dispatch<React.SetStateAction<string[]>>;
    
    printHistory: PrintHistoryEntry[];
    setPrintHistory: React.Dispatch<React.SetStateAction<PrintHistoryEntry[]>>;
    maintenanceItems: MaintenanceItem[];
    setMaintenanceItems: React.Dispatch<React.SetStateAction<MaintenanceItem[]>>;
    maintenanceLogs: MaintenanceLog[];
    setMaintenanceLogs: React.Dispatch<React.SetStateAction<MaintenanceLog[]>>;
    orderCounter: OrderCounter;
    setOrderCounter: React.Dispatch<React.SetStateAction<OrderCounter>>;
    
    staffCalls: StaffCall[];
    setStaffCalls: React.Dispatch<React.SetStateAction<StaffCall[]>>;
    leaveRequests: LeaveRequest[];
    setLeaveRequests: React.Dispatch<React.SetStateAction<LeaveRequest[]>>;

    // HR Management
    jobApplications: JobApplication[];
    setJobApplications: React.Dispatch<React.SetStateAction<JobApplication[]>>;
    employmentContracts: EmploymentContract[];
    setEmploymentContracts: React.Dispatch<React.SetStateAction<EmploymentContract[]>>;
    timeRecords: TimeRecord[];
    setTimeRecords: React.Dispatch<React.SetStateAction<TimeRecord[]>>;
    payrollRecords: PayrollRecord[];
    setPayrollRecords: React.Dispatch<React.SetStateAction<PayrollRecord[]>>;
    jobPositions: string[];
    setJobPositions: React.Dispatch<React.SetStateAction<string[]>>;

    // Settings
    logoUrl: string | null;
    setLogoUrl: React.Dispatch<React.SetStateAction<string | null>>;
    appLogoUrl: string | null;
    setAppLogoUrl: React.Dispatch<React.SetStateAction<string | null>>;
    restaurantName: string;
    setRestaurantName: React.Dispatch<React.SetStateAction<string>>;
    restaurantAddress: string;
    setRestaurantAddress: React.Dispatch<React.SetStateAction<string>>;
    restaurantPhone: string;
    setRestaurantPhone: React.Dispatch<React.SetStateAction<string>>;
    taxId: string;
    setTaxId: React.Dispatch<React.SetStateAction<string>>;
    signatureUrl: string | null;
    setSignatureUrl: React.Dispatch<React.SetStateAction<string | null>>;
    qrCodeUrl: string | null;
    setQrCodeUrl: React.Dispatch<React.SetStateAction<string | null>>;
    notificationSoundUrl: string | null;
    setNotificationSoundUrl: React.Dispatch<React.SetStateAction<string | null>>;
    staffCallSoundUrl: string | null;
    setStaffCallSoundUrl: React.Dispatch<React.SetStateAction<string | null>>;
    printerConfig: PrinterConfig | null;
    setPrinterConfig: React.Dispatch<React.SetStateAction<PrinterConfig | null>>;
    openingTime: string | null;
    setOpeningTime: React.Dispatch<React.SetStateAction<string | null>>;
    closingTime: string | null;
    setClosingTime: React.Dispatch<React.SetStateAction<string | null>>;
    isTaxEnabled: boolean;
    setIsTaxEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    taxRate: number;
    setTaxRate: React.Dispatch<React.SetStateAction<number>>;
    sendToKitchen: boolean;
    setSendToKitchen: React.Dispatch<React.SetStateAction<boolean>>;
    deliveryProviders: DeliveryProvider[];
    setDeliveryProviders: React.Dispatch<React.SetStateAction<DeliveryProvider[]>>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // --- AUTH & BRANCH STATE ---
    const [users, setUsers] = useFirestoreSync<User[]>(null, 'users', [], DEFAULT_USERS);
    const [branches, setBranches] = useFirestoreSync<Branch[]>(null, 'branches', [], DEFAULT_BRANCHES);
    
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                return JSON.parse(storedUser);
            } catch (e) {
                console.error('Error parsing stored user', e);
                localStorage.removeItem('currentUser');
                return null;
            }
        }
        return null;
    });

    const [isCustomerMode, setIsCustomerMode] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'customer' || params.get('orderType') === 'takeaway' || params.get('orderType') === 'delivery') return true;
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                const u = JSON.parse(storedUser);
                return u.role === 'table';
            } catch (e) {
                return false;
            }
        }
        return false;
    });

    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(() => {
        const params = new URLSearchParams(window.location.search);
        const isCustomer = params.get('mode') === 'customer';
        const urlBranchId = params.get('branchId');

        if (isCustomer) {
            if (urlBranchId) return null;
            const customerBranch = localStorage.getItem('customerSelectedBranch');
            if (customerBranch) {
                try { return JSON.parse(customerBranch); } catch (e) { localStorage.removeItem('customerSelectedBranch'); }
            }
        }
        
        const staffBranch = localStorage.getItem('selectedBranch');
        if (staffBranch) {
            try { return JSON.parse(staffBranch); } catch (e) { localStorage.removeItem('selectedBranch'); }
        }
        return null;
    });

    const [customerTableId, setCustomerTableId] = useState<number | null>(() => {
        const params = new URLSearchParams(window.location.search);
        const orderType = params.get('orderType');
        if (orderType === 'takeaway') return -1;
        if (orderType === 'delivery') return -2;
        const tableIdParam = params.get('tableId');
        if (tableIdParam) return Number(tableIdParam);
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                const u = JSON.parse(storedUser);
                if (u.role === 'table' && u.assignedTableId) return Number(u.assignedTableId);
            } catch (e) { return null; }
        }
        return null;
    });

    const urlBranchId = useMemo(() => new URLSearchParams(window.location.search).get('branchId'), []);
    const branchId = urlBranchId ? urlBranchId : (selectedBranch ? selectedBranch.id.toString() : null);

    const shouldLoadHeavyData = useMemo(() => {
        return currentUser && currentUser.role !== 'table' && !isCustomerMode;
    }, [currentUser, isCustomerMode]);

    const heavyDataBranchId = shouldLoadHeavyData ? branchId : null;

    useEffect(() => {
        if (branches.length > 0 && urlBranchId) {
            if (!selectedBranch || selectedBranch.id.toString() !== urlBranchId) {
                const b = branches.find(br => br.id.toString() === urlBranchId);
                if (b) {
                    setSelectedBranch(b);
                    if (isCustomerMode) {
                        localStorage.setItem('customerSelectedBranch', JSON.stringify(b));
                    }
                }
            }
        }
    }, [isCustomerMode, selectedBranch, branches, urlBranchId]);

    useEffect(() => {
        if (urlBranchId) {
            const stored = localStorage.getItem('customerSelectedBranch');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed.id != urlBranchId) {
                        localStorage.removeItem('customerSelectedBranch');
                    }
                } catch (e) {
                    localStorage.removeItem('customerSelectedBranch');
                }
            }
        }
    }, [urlBranchId]);

    // --- ESSENTIAL DATA ---
    const [menuItems, setMenuItems] = useFirestoreSync<MenuItem[]>(branchId, 'menuItems', [], DEFAULT_MENU_ITEMS);
    const [categories, setCategories] = useFirestoreSync<string[]>(branchId, 'categories', [], DEFAULT_CATEGORIES);
    const [tables, setTables] = useFirestoreSync<Table[]>(branchId, 'tables', [], DEFAULT_TABLES);
    const [floors, setFloors] = useFirestoreSync<string[]>(branchId, 'floors', [], DEFAULT_FLOORS);
    const [recommendedMenuItemIds, setRecommendedMenuItemIds] = useFirestoreSync<number[]>(branchId, 'recommendedMenuItemIds', []);
    
    // Active Orders
    const [rawActiveOrders, activeOrdersActions] = useFirestoreCollection<ActiveOrder>(branchId, 'activeOrders');
    
    const activeOrders = useMemo(() => {
        return rawActiveOrders.filter(o => o.status !== 'completed' && o.status !== 'cancelled');
    }, [rawActiveOrders]);

    // --- HEAVY DATA ---
    const [legacyCompletedOrders, setLegacyCompletedOrders] = useFirestoreSync<CompletedOrder[]>(heavyDataBranchId, 'completedOrders', []);
    const [legacyCancelledOrders, setLegacyCancelledOrders] = useFirestoreSync<CancelledOrder[]>(heavyDataBranchId, 'cancelledOrders', []);
    const [newCompletedOrders, newCompletedOrdersActions] = useFirestoreCollection<CompletedOrder>(heavyDataBranchId, 'completedOrders_v2');
    const [newCancelledOrders, newCancelledOrdersActions] = useFirestoreCollection<CancelledOrder>(heavyDataBranchId, 'cancelledOrders_v2');

    const completedOrders = useMemo(() => {
        const combined = [...newCompletedOrders, ...legacyCompletedOrders];
        const unique = new Map<number, CompletedOrder>();
        combined.forEach(o => unique.set(o.id, o));
        return Array.from(unique.values()).sort((a, b) => b.completionTime - a.completionTime);
    }, [legacyCompletedOrders, newCompletedOrders]);

    const cancelledOrders = useMemo(() => {
        const combined = [...newCancelledOrders, ...legacyCancelledOrders];
        const unique = new Map<number, CancelledOrder>();
        combined.forEach(o => unique.set(o.id, o));
        return Array.from(unique.values()).sort((a, b) => b.cancellationTime - a.cancellationTime);
    }, [legacyCancelledOrders, newCancelledOrders]);

    const [stockItems, setStockItems] = useFirestoreSync<StockItem[]>(heavyDataBranchId, 'stockItems', [], DEFAULT_STOCK_ITEMS);
    const [stockTags, setStockTags] = useFirestoreSync<StockTag[]>(heavyDataBranchId, 'stockTags', []);
    const [stockCategories, setStockCategories] = useFirestoreSync<string[]>(heavyDataBranchId, 'stockCategories', [], DEFAULT_STOCK_CATEGORIES);
    const [stockUnits, setStockUnits] = useFirestoreSync<string[]>(heavyDataBranchId, 'stockUnits', [], DEFAULT_STOCK_UNITS);
    
    const [printHistory, setPrintHistory] = useFirestoreSync<PrintHistoryEntry[]>(heavyDataBranchId, 'printHistory', []);
    const [maintenanceItems, setMaintenanceItems] = useFirestoreSync<MaintenanceItem[]>(heavyDataBranchId, 'maintenanceItems', [], DEFAULT_MAINTENANCE_ITEMS);
    const [maintenanceLogs, setMaintenanceLogs] = useFirestoreSync<MaintenanceLog[]>(heavyDataBranchId, 'maintenanceLogs', []);
    const [orderCounter, setOrderCounter] = useFirestoreSync<OrderCounter>(heavyDataBranchId, 'orderCounter', { count: 0, lastResetDate: new Date().toISOString().split('T')[0] });
    
    const [staffCalls, setStaffCalls] = useFirestoreSync<StaffCall[]>(branchId, 'staffCalls', []);
    const [leaveRequests, setLeaveRequests] = useFirestoreSync<LeaveRequest[]>(shouldLoadHeavyData ? null : 'SKIP', 'leaveRequests', []);

    // --- HR MANAGEMENT ---
    const [jobApplications, setJobApplications] = useFirestoreSync<JobApplication[]>(branchId, 'jobApplications', [], DEFAULT_JOB_APPLICATIONS);
    const [employmentContracts, setEmploymentContracts] = useFirestoreSync<EmploymentContract[]>(branchId, 'employmentContracts', [], DEFAULT_EMPLOYMENT_CONTRACTS);
    const [timeRecords, setTimeRecords] = useFirestoreSync<TimeRecord[]>(branchId, 'timeRecords', []);
    const [payrollRecords, setPayrollRecords] = useFirestoreSync<PayrollRecord[]>(branchId, 'payrollRecords', []);
    const [jobPositions, setJobPositions] = useFirestoreSync<string[]>(branchId, 'jobPositions', [], ['แม่ครัว', 'พนักงานเตรียมครัว', 'พนักงานทั่วไป']);

    // --- SETTINGS ---
    const [logoUrl, setLogoUrl] = useFirestoreSync<string | null>(branchId, 'logoUrl', null);
    const [appLogoUrl, setAppLogoUrl] = useFirestoreSync<string | null>(branchId, 'appLogoUrl', null);
    const [restaurantName, setRestaurantName] = useFirestoreSync<string>(branchId, 'restaurantName', '', 'ชื่อร้านอาหาร');
    const [restaurantAddress, setRestaurantAddress] = useFirestoreSync<string>(branchId, 'restaurantAddress', '');
    const [restaurantPhone, setRestaurantPhone] = useFirestoreSync<string>(branchId, 'restaurantPhone', '');
    const [taxId, setTaxId] = useFirestoreSync<string>(branchId, 'taxId', '');
    const [signatureUrl, setSignatureUrl] = useFirestoreSync<string | null>(branchId, 'signatureUrl', null);

    const [qrCodeUrl, setQrCodeUrl] = useFirestoreSync<string | null>(branchId, 'qrCodeUrl', null);
    const [notificationSoundUrl, setNotificationSoundUrl] = useFirestoreSync<string | null>(branchId, 'notificationSoundUrl', null);
    const [staffCallSoundUrl, setStaffCallSoundUrl] = useFirestoreSync<string | null>(branchId, 'staffCallSoundUrl', null);
    const [printerConfig, setPrinterConfig] = useFirestoreSync<PrinterConfig | null>(branchId, 'printerConfig', null);
    const [openingTime, setOpeningTime] = useFirestoreSync<string | null>(branchId, 'openingTime', '', '10:00');
    const [closingTime, setClosingTime] = useFirestoreSync<string | null>(branchId, 'closingTime', '', '22:00');
    const [isTaxEnabled, setIsTaxEnabled] = useFirestoreSync<boolean>(branchId, 'isTaxEnabled', false);
    const [taxRate, setTaxRate] = useFirestoreSync<number>(branchId, 'taxRate', 7);
    const [sendToKitchen, setSendToKitchen] = useFirestoreSync<boolean>(branchId, 'sendToKitchen', true);
    const [deliveryProviders, setDeliveryProviders] = useFirestoreSync<DeliveryProvider[]>(branchId, 'deliveryProviders', [], DEFAULT_DELIVERY_PROVIDERS);

    return (
        <DataContext.Provider value={{
            currentUser, setCurrentUser, users, setUsers, branches, setBranches,
            selectedBranch, setSelectedBranch, isCustomerMode, setIsCustomerMode,
            customerTableId, setCustomerTableId, branchId, heavyDataBranchId, shouldLoadHeavyData,
            
            menuItems, setMenuItems, categories, setCategories, tables, setTables, floors, setFloors,
            recommendedMenuItemIds, setRecommendedMenuItemIds, activeOrders, rawActiveOrders, activeOrdersActions,
            
            legacyCompletedOrders, setLegacyCompletedOrders, legacyCancelledOrders, setLegacyCancelledOrders,
            newCompletedOrders, newCompletedOrdersActions, newCancelledOrders, newCancelledOrdersActions,
            completedOrders, cancelledOrders,
            
            stockItems, setStockItems, stockTags, setStockTags, stockCategories, setStockCategories, stockUnits, setStockUnits,
            printHistory, setPrintHistory, maintenanceItems, setMaintenanceItems, maintenanceLogs, setMaintenanceLogs,
            orderCounter, setOrderCounter, staffCalls, setStaffCalls, leaveRequests, setLeaveRequests,
            
            jobApplications, setJobApplications, employmentContracts, setEmploymentContracts,
            timeRecords, setTimeRecords, payrollRecords, setPayrollRecords, jobPositions, setJobPositions,

            logoUrl, setLogoUrl, appLogoUrl, setAppLogoUrl, restaurantName, setRestaurantName,
            restaurantAddress, setRestaurantAddress, restaurantPhone, setRestaurantPhone, taxId, setTaxId,
            signatureUrl, setSignatureUrl, qrCodeUrl, setQrCodeUrl, notificationSoundUrl, setNotificationSoundUrl,
            staffCallSoundUrl, setStaffCallSoundUrl, printerConfig, setPrinterConfig, openingTime, setOpeningTime,
            closingTime, setClosingTime, isTaxEnabled, setIsTaxEnabled, taxRate, setTaxRate, sendToKitchen, setSendToKitchen,
            deliveryProviders, setDeliveryProviders
        }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
