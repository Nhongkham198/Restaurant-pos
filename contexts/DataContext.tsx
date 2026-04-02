import React, { useState, useEffect, useMemo, createContext, useContext, ReactNode } from 'react';
import { useFirestoreSync, useFirestoreCollection, CollectionActions } from '../hooks/useFirestoreSync';
import { 
    MenuItem, Table, ActiveOrder, CompletedOrder, CancelledOrder, 
    StockItem, StockTag, StockLog, PrintHistoryEntry, MaintenanceItem, MaintenanceLog, 
    OrderCounter, StaffCall, LeaveRequest, PrinterConfig, DeliveryProvider,
    User, Branch, JobApplication, EmploymentContract, TimeRecord, PayrollRecord,
    Recipe
} from '../types';
import { 
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
    recipes: Recipe[];
    setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
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
    
    stockLogs: StockLog[];
    stockLogsActions: CollectionActions<StockLog>;
    
    staffCalls: StaffCall[];
    setStaffCalls: React.Dispatch<React.SetStateAction<StaffCall[]>>;
    leaveRequests: LeaveRequest[];
    setLeaveRequests: React.Dispatch<React.SetStateAction<LeaveRequest[]>>;
    lastSalesCleanupDate: string;
    setLastSalesCleanupDate: React.Dispatch<React.SetStateAction<string>>;

    // HR Management
    jobApplications: JobApplication[];
    jobApplicationsActions: CollectionActions<JobApplication>;
    employmentContracts: EmploymentContract[];
    employmentContractsActions: CollectionActions<EmploymentContract>;
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
    facebookAppId: string;
    setFacebookAppId: React.Dispatch<React.SetStateAction<string>>;
    facebookAppSecret: string;
    setFacebookAppSecret: React.Dispatch<React.SetStateAction<string>>;
    lineOaUrl: string;
    setLineOaUrl: React.Dispatch<React.SetStateAction<string>>;
    facebookPageUrl: string;
    setFacebookPageUrl: React.Dispatch<React.SetStateAction<string>>;
    lineNotifyToken: string; // Deprecated
    setLineNotifyToken: React.Dispatch<React.SetStateAction<string>>;
    lineMessagingToken: string;
    setLineMessagingToken: React.Dispatch<React.SetStateAction<string>>;
    lineUserId: string;
    setLineUserId: React.Dispatch<React.SetStateAction<string>>;
    telegramBotToken: string;
    setTelegramBotToken: React.Dispatch<React.SetStateAction<string>>;
    telegramChatId: string;
    setTelegramChatId: React.Dispatch<React.SetStateAction<string>>;
    isDataLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    // --- AUTH & BRANCH STATE ---
    const [users, setUsers] = useFirestoreSync<User[]>(null, 'users', []);
    const [branches, setBranches] = useFirestoreSync<Branch[]>(null, 'branches', []);
    
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

    // Security: Auto-logout if user is removed from database
    useEffect(() => {
        if (users.length > 0 && currentUser && !isCustomerMode) {
            const userExists = users.find(u => u.username === currentUser.username);
            if (!userExists) {
                console.warn('Current user no longer exists in database. Logging out.');
                setCurrentUser(null);
                localStorage.removeItem('currentUser');
                localStorage.removeItem('selectedBranch');
                window.location.href = '/'; // Force reload to clear state
            } else {
                // Optional: Update current user details if they changed in DB (e.g. role change)
                if (JSON.stringify(userExists) !== JSON.stringify(currentUser)) {
                     setCurrentUser(userExists);
                     localStorage.setItem('currentUser', JSON.stringify(userExists));
                }
            }
        }
    }, [users, currentUser, isCustomerMode]);

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

    // Reactive URL Branch ID
    const [urlBranchId, setUrlBranchId] = useState(() => new URLSearchParams(window.location.search).get('branchId'));

    // Listen for URL changes (e.g. from history.replaceState)
    useEffect(() => {
        const handleUrlChange = () => {
            const newId = new URLSearchParams(window.location.search).get('branchId');
            setUrlBranchId(newId);
        };
        window.addEventListener('popstate', handleUrlChange);
        // We also need to manually trigger this when we use replaceState in our own code
        const originalReplaceState = window.history.replaceState;
        window.history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            handleUrlChange();
        };
        return () => {
            window.removeEventListener('popstate', handleUrlChange);
            window.history.replaceState = originalReplaceState;
        };
    }, []);

    const branchId = urlBranchId ? urlBranchId : (selectedBranch ? selectedBranch.id.toString() : null);

    const shouldLoadHeavyData = useMemo(() => {
        return currentUser && currentUser.role !== 'table' && !isCustomerMode;
    }, [currentUser, isCustomerMode]);

    const heavyDataBranchId = shouldLoadHeavyData ? branchId : null;

    useEffect(() => {
        if (branches.length > 0 && selectedBranch) {
            // Validate that the selected branch actually exists in the loaded branches
            const isValid = branches.some(b => b.id === selectedBranch.id);
            if (!isValid) {
                console.warn('[DataContext] Selected branch ID ' + selectedBranch.id + ' not found in valid branches list. Resetting to trigger auto-recovery.');
                setSelectedBranch(null);
                localStorage.removeItem('selectedBranch');
            }
        }
    }, [branches, selectedBranch]);

    // PERSISTENCE: Sync selectedBranch to URL to prevent loss on refresh
    useEffect(() => {
        if (isCustomerMode || !currentUser) return;

        const url = new URL(window.location.href);
        const currentUrlBranchId = url.searchParams.get('branchId');

        if (selectedBranch) {
            // If we have a branch, ensure URL matches
            if (currentUrlBranchId !== selectedBranch.id.toString()) {
                url.searchParams.set('branchId', selectedBranch.id.toString());
                window.history.replaceState(null, '', url.toString());
                console.log('[DataContext] Persisted branch ID to URL:', selectedBranch.id);
            }
        } else {
            // If no branch selected (and user is logged in), clear param to avoid confusion
            // But only if it exists, to avoid unnecessary history writes
            if (currentUrlBranchId) {
                url.searchParams.delete('branchId');
                window.history.replaceState(null, '', url.toString());
            }
        }
    }, [selectedBranch, isCustomerMode, currentUser]);

    useEffect(() => {
        // Skip if user is explicitly trying to change branch
        if (localStorage.getItem('intentToChangeBranch')) {
            console.log('[DataContext] Pause Lock: Skipping URL sync because intentToChangeBranch is set.');
            return;
        }

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
        } else if (branches.length > 0 && !selectedBranch && isCustomerMode && !urlBranchId) {
            // FALLBACK: If customer mode, no branch selected (cleared history), and no URL param
            // Auto-select the first branch to ensure menu loads
            const defaultBranch = branches[0];
            setSelectedBranch(defaultBranch);
            localStorage.setItem('customerSelectedBranch', JSON.stringify(defaultBranch));
        } else if (branches.length > 0 && !selectedBranch && !isCustomerMode && currentUser) {
            // Check if user explicitly requested to change branch
            if (localStorage.getItem('intentToChangeBranch')) {
                return;
            }

            // FALLBACK: For Staff/Admin users who lost their branch selection
            let targetBranch: Branch | undefined;
            
            // 1. Strict Permission Check: Only select from allowedBranchIds
            if (currentUser.allowedBranchIds && currentUser.allowedBranchIds.length > 0) {
                // NEW LOGIC: If user has access to MULTIPLE branches, do NOT auto-select.
                // Let them choose from the selection screen.
                if (currentUser.allowedBranchIds.length > 1) {
                    console.log('[DataContext] User has multiple branches. Skipping auto-selection.');
                    return; 
                }

                // Find the first branch that is BOTH allowed AND exists in the loaded list
                targetBranch = branches.find(b => currentUser.allowedBranchIds!.includes(b.id));
            }
            
            // 2. Admin Override: REMOVED auto-selection for Admin to allow them to choose a branch on login.
            // If an Admin refreshes, the URL persistence logic (above) will handle the recovery.
            // If an Admin logs in fresh, they should see the selection screen.

            // 3. Apply ONLY if a valid target was found
            if (targetBranch) {
                console.log('[DataContext] Auto-recovering selected branch:', targetBranch.name);
                setSelectedBranch(targetBranch);
                localStorage.setItem('selectedBranch', JSON.stringify(targetBranch));
            }
        }
    }, [isCustomerMode, selectedBranch, branches, urlBranchId, currentUser]);

    // --- AUTO-CLEANUP STOCK LOGS (Aug 10 & Feb 10) ---
    // Moved to after stockLogs definition


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
    const [menuItems, setMenuItems, isMenuItemsLoading] = useFirestoreSync<MenuItem[]>(branchId, 'menuItems', []);
    const [recipes, setRecipes, isRecipesLoading] = useFirestoreSync<Recipe[]>(heavyDataBranchId, 'recipes', []);
    const [categories, setCategories, isCategoriesLoading] = useFirestoreSync<string[]>(branchId, 'categories', []);
    const [tables, setTables, isTablesLoading] = useFirestoreSync<Table[]>(branchId, 'tables', []);
    const [floors, setFloors, isFloorsLoading] = useFirestoreSync<string[]>(heavyDataBranchId, 'floors', []);
    const [recommendedMenuItemIds, setRecommendedMenuItemIds, isRecommendedLoading] = useFirestoreSync<number[]>(branchId, 'recommendedMenuItemIds', []);
    
    // Active Orders
    const activeOrdersQueryFn = useMemo(() => {
        if (isCustomerMode && customerTableId && customerTableId > 0) {
            return (ref: any) => ref.where('tableId', '==', customerTableId);
        }
        return undefined;
    }, [isCustomerMode, customerTableId]);

    const [rawActiveOrders, activeOrdersActions] = useFirestoreCollection<ActiveOrder>(branchId, 'activeOrders', activeOrdersQueryFn);
    
    const activeOrders = useMemo(() => {
        return rawActiveOrders.filter(o => o.status !== 'completed' && o.status !== 'cancelled');
    }, [rawActiveOrders]);

    // --- HEAVY DATA ---
    const [legacyCompletedOrders, setLegacyCompletedOrders, isLegacyCompletedLoading] = useFirestoreSync<CompletedOrder[]>(heavyDataBranchId, 'completedOrders', []);
    const [legacyCancelledOrders, setLegacyCancelledOrders, isLegacyCancelledLoading] = useFirestoreSync<CancelledOrder[]>(heavyDataBranchId, 'cancelledOrders', []);
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

    const [stockItems, setStockItems, isStockItemsLoading] = useFirestoreSync<StockItem[]>(heavyDataBranchId, 'stockItems', []);
    const [stockTags, setStockTags, isStockTagsLoading] = useFirestoreSync<StockTag[]>(heavyDataBranchId, 'stockTags', []);
    const [stockCategories, setStockCategories, isStockCategoriesLoading] = useFirestoreSync<string[]>(heavyDataBranchId, 'stockCategories', []);
    const [stockUnits, setStockUnits, isStockUnitsLoading] = useFirestoreSync<string[]>(heavyDataBranchId, 'stockUnits', []);
    
    const [printHistory, setPrintHistory, isPrintHistoryLoading] = useFirestoreSync<PrintHistoryEntry[]>(heavyDataBranchId, 'printHistory', []);
    const [maintenanceItems, setMaintenanceItems, isMaintenanceItemsLoading] = useFirestoreSync<MaintenanceItem[]>(heavyDataBranchId, 'maintenanceItems', []);
    const [maintenanceLogs, setMaintenanceLogs, isMaintenanceLogsLoading] = useFirestoreSync<MaintenanceLog[]>(heavyDataBranchId, 'maintenanceLogs', []);
    const [orderCounter, setOrderCounter, isOrderCounterLoading] = useFirestoreSync<OrderCounter>(heavyDataBranchId, 'orderCounter', { count: 0, lastResetDate: new Date().toISOString().split('T')[0] });
    
    const [stockLogs, stockLogsActions] = useFirestoreCollection<StockLog>(heavyDataBranchId, 'stockLogs');

    // --- AUTO-CLEANUP STOCK LOGS (Aug 10 & Feb 10) ---
    useEffect(() => {
        if (!stockLogs || stockLogs.length === 0) return;

        const performCleanup = async () => {
            const now = new Date();
            const currentYear = now.getFullYear();
            
            // Define potential cutoffs (Current Year and Previous Year to handle Jan/early Feb cases)
            // Month is 0-indexed: 1 = Feb, 7 = Aug
            const cutoffs = [
                new Date(currentYear, 7, 10, 0, 0, 0), // Aug 10 Current
                new Date(currentYear, 1, 10, 0, 0, 0), // Feb 10 Current
                new Date(currentYear - 1, 7, 10, 0, 0, 0), // Aug 10 Prev
                new Date(currentYear - 1, 1, 10, 0, 0, 0)  // Feb 10 Prev
            ];

            // Find the latest cutoff that has passed
            const targetCutoff = cutoffs.find(date => now >= date);

            if (!targetCutoff) return;

            const lastCleanupStr = localStorage.getItem('lastStockCleanupDate');
            const lastCleanupDate = lastCleanupStr ? new Date(lastCleanupStr) : new Date(0);

            // If we haven't cleaned up since the target cutoff
            if (lastCleanupDate < targetCutoff) {
                console.log(`[AutoCleanup] Checking for old stock logs. Cutoff: ${targetCutoff.toLocaleDateString()}`);
                
                const cutoffTime = targetCutoff.getTime();
                // Filter logs OLDER than the cutoff
                const logsToDelete = stockLogs.filter(log => log.timestamp < cutoffTime);

                if (logsToDelete.length > 0) {
                    console.log(`[AutoCleanup] Deleting ${logsToDelete.length} logs older than ${targetCutoff.toLocaleDateString()}...`);
                    
                    // Execute deletion (in batches if necessary, but Promise.all is fine for reasonable sizes)
                    try {
                        await Promise.all(logsToDelete.map(log => stockLogsActions.remove(log.id)));
                        console.log('[AutoCleanup] Cleanup complete.');
                    } catch (error) {
                        console.error('[AutoCleanup] Error deleting logs:', error);
                    }
                } else {
                    console.log('[AutoCleanup] No old logs found to delete.');
                }

                // Mark cleanup as done for this period
                localStorage.setItem('lastStockCleanupDate', now.toISOString());
            }
        };

        performCleanup();
    }, [stockLogs, stockLogsActions]);
    
    const [staffCalls, setStaffCalls] = useFirestoreSync<StaffCall[]>(branchId, 'staffCalls', []);
    const [leaveRequests, setLeaveRequests] = useFirestoreSync<LeaveRequest[]>(shouldLoadHeavyData ? null : 'SKIP', 'leaveRequests', []);
    const [lastSalesCleanupDate, setLastSalesCleanupDate] = useFirestoreSync<string>(heavyDataBranchId, 'lastSalesCleanupDate', '');

    // --- HR MANAGEMENT ---
    const [jobApplications, jobApplicationsActions] = useFirestoreCollection<JobApplication>(branchId, 'jobApplications');
    const [employmentContracts, employmentContractsActions] = useFirestoreCollection<EmploymentContract>(branchId, 'employmentContracts');
    const [timeRecords, setTimeRecords] = useFirestoreSync<TimeRecord[]>(branchId, 'timeRecords', []);
    const [payrollRecords, setPayrollRecords] = useFirestoreSync<PayrollRecord[]>(branchId, 'payrollRecords', []);
    const [jobPositions, setJobPositions] = useFirestoreSync<string[]>(branchId, 'jobPositions', []);

    // --- SETTINGS ---
    const [logoUrl, setLogoUrl] = useFirestoreSync<string | null>(branchId, 'logoUrl', null);
    const [appLogoUrl, setAppLogoUrl] = useFirestoreSync<string | null>(branchId, 'appLogoUrl', null);
    const [restaurantName, setRestaurantName] = useFirestoreSync<string>(branchId, 'restaurantName', '');
    const [restaurantAddress, setRestaurantAddress] = useFirestoreSync<string>(branchId, 'restaurantAddress', '');
    const [restaurantPhone, setRestaurantPhone] = useFirestoreSync<string>(branchId, 'restaurantPhone', '');
    const [taxId, setTaxId] = useFirestoreSync<string>(branchId, 'taxId', '');
    const [signatureUrl, setSignatureUrl] = useFirestoreSync<string | null>(branchId, 'signatureUrl', null);

    const [qrCodeUrl, setQrCodeUrl] = useFirestoreSync<string | null>(branchId, 'qrCodeUrl', null);
    const [notificationSoundUrl, setNotificationSoundUrl] = useFirestoreSync<string | null>(branchId, 'notificationSoundUrl', null);
    const [staffCallSoundUrl, setStaffCallSoundUrl] = useFirestoreSync<string | null>(branchId, 'staffCallSoundUrl', null);
    const [printerConfig, setPrinterConfig] = useFirestoreSync<PrinterConfig | null>(branchId, 'printerConfig', null);
    const [openingTime, setOpeningTime] = useFirestoreSync<string | null>(branchId, 'openingTime', '');
    const [closingTime, setClosingTime] = useFirestoreSync<string | null>(branchId, 'closingTime', '');
    const [isTaxEnabled, setIsTaxEnabled] = useFirestoreSync<boolean>(branchId, 'isTaxEnabled', false);
    const [taxRate, setTaxRate] = useFirestoreSync<number>(branchId, 'taxRate', 7);
    const [sendToKitchen, setSendToKitchen] = useFirestoreSync<boolean>(branchId, 'sendToKitchen', true);
    const [deliveryProviders, setDeliveryProviders, isDeliveryProvidersLoading] = useFirestoreSync<DeliveryProvider[]>(branchId, 'deliveryProviders', []);
    const [facebookAppId, setFacebookAppId] = useFirestoreSync<string>(branchId, 'facebookAppId', '');
    const [facebookAppSecret, setFacebookAppSecret] = useFirestoreSync<string>(branchId, 'facebookAppSecret', '');
    const [lineOaUrl, setLineOaUrl] = useFirestoreSync<string>(branchId, 'lineOaUrl', '');
    const [facebookPageUrl, setFacebookPageUrl] = useFirestoreSync<string>(branchId, 'facebookPageUrl', '');
    const [lineNotifyToken, setLineNotifyToken] = useFirestoreSync<string>(branchId, 'lineNotifyToken', '');
    const [lineMessagingToken, setLineMessagingToken] = useFirestoreSync<string>(branchId, 'lineMessagingToken', '');
    const [lineUserId, setLineUserId] = useFirestoreSync<string>(branchId, 'lineUserId', '');
    const [telegramBotToken, setTelegramBotToken] = useFirestoreSync<string>(branchId, 'telegramBotToken', '');
    const [telegramChatId, setTelegramChatId] = useFirestoreSync<string>(branchId, 'telegramChatId', '');

    const isDataLoading = isMenuItemsLoading || isCategoriesLoading || isTablesLoading || isFloorsLoading || isDeliveryProvidersLoading;

    return (
        <DataContext.Provider value={{
            currentUser, setCurrentUser, users, setUsers, branches, setBranches,
            selectedBranch, setSelectedBranch, isCustomerMode, setIsCustomerMode,
            customerTableId, setCustomerTableId, branchId, heavyDataBranchId, shouldLoadHeavyData,
            
            menuItems, setMenuItems, recipes, setRecipes, categories, setCategories, tables, setTables, floors, setFloors,
            recommendedMenuItemIds, setRecommendedMenuItemIds, activeOrders, rawActiveOrders, activeOrdersActions,
            
            legacyCompletedOrders, setLegacyCompletedOrders, legacyCancelledOrders, setLegacyCancelledOrders,
            newCompletedOrders, newCompletedOrdersActions, newCancelledOrders, newCancelledOrdersActions,
            completedOrders, cancelledOrders,
            
            stockItems, setStockItems, stockTags, setStockTags, stockCategories, setStockCategories, stockUnits, setStockUnits,
            stockLogs, stockLogsActions,
            printHistory, setPrintHistory, maintenanceItems, setMaintenanceItems, maintenanceLogs, setMaintenanceLogs,
            orderCounter, setOrderCounter, staffCalls, setStaffCalls, leaveRequests, setLeaveRequests,
            lastSalesCleanupDate, setLastSalesCleanupDate,
            
            jobApplications, jobApplicationsActions, employmentContracts, employmentContractsActions,
            timeRecords, setTimeRecords, payrollRecords, setPayrollRecords, jobPositions, setJobPositions,

            logoUrl, setLogoUrl, appLogoUrl, setAppLogoUrl, restaurantName, setRestaurantName,
            restaurantAddress, setRestaurantAddress, restaurantPhone, setRestaurantPhone, taxId, setTaxId,
            signatureUrl, setSignatureUrl, qrCodeUrl, setQrCodeUrl, notificationSoundUrl, setNotificationSoundUrl,
            staffCallSoundUrl, setStaffCallSoundUrl, printerConfig, setPrinterConfig, openingTime, setOpeningTime,
            closingTime, setClosingTime, isTaxEnabled, setIsTaxEnabled, taxRate, setTaxRate, sendToKitchen, setSendToKitchen,
            deliveryProviders, setDeliveryProviders, facebookAppId, setFacebookAppId, facebookAppSecret, setFacebookAppSecret,
            lineOaUrl, setLineOaUrl, facebookPageUrl, setFacebookPageUrl,
            lineNotifyToken, setLineNotifyToken,
            lineMessagingToken, setLineMessagingToken,
            lineUserId, setLineUserId,
            telegramBotToken, setTelegramBotToken,
            telegramChatId, setTelegramChatId,
            isDataLoading
        }}>
            {isDataLoading ? (
                <div className="fixed inset-0 bg-white z-[9999] flex flex-col items-center justify-center">
                    <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-500 font-medium animate-pulse">กำลังโหลดข้อมูลร้านค้า...</p>
                </div>
            ) : children}
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
