
import React, { useMemo, useState } from 'react';
import type { StockItem, MenuItem, CompletedOrder } from '../types';
import { useData } from '../contexts/DataContext';
import PieChart from './PieChart';
import { SalesChart } from './SalesChart'; // Reusing SalesChart for bar display

interface StockAnalyticsProps {
    stockItems?: StockItem[];
}

export const StockAnalytics: React.FC<StockAnalyticsProps> = ({ stockItems: propStockItems }) => {
    // Context data for linked recipes and customer orders
    const { stockItems: dataStockItems = [], recipes = [], menuItems = [], completedOrders = [], stockLogs = [] } = useData();
    const stockItems = propStockItems && propStockItems.length > 0 ? propStockItems : dataStockItems;

    // State for Modal
    const [selectedGroup, setSelectedGroup] = useState<'total' | 'good' | 'low' | 'out' | null>(null);
    const [selectedDetailItem, setSelectedDetailItem] = useState<StockItem | null>(null);
    const [selectedLinkedMenu, setSelectedLinkedMenu] = useState<{
        menuItemId: number;
        name: string;
        imageUrl?: string;
        orderedQty: number;
    } | null>(null);

    // --- Date Filter State for Withdrawals ---
    type DateFilterMode = 'month' | 'today' | 'yesterday' | '7days' | 'custom';
    const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('month');
    const [customStartDate, setCustomStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

    // Calculate time range based on selected filter
    const filterTimeRange = useMemo(() => {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        if (dateFilterMode === 'today') {
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else if (dateFilterMode === 'yesterday') {
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setHours(23, 59, 59, 999);
        } else if (dateFilterMode === '7days') {
            start.setDate(start.getDate() - 6);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else if (dateFilterMode === 'custom') {
            if (customStartDate) {
                start = new Date(customStartDate + 'T00:00:00');
            }
            if (customEndDate) {
                end = new Date(customEndDate + 'T23:59:59.999');
            }
        } else {
            // month
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        const ThaiDateStr = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

        return {
            startTime: start.getTime(),
            endTime: end.getTime(),
            label: dateFilterMode === 'today' ? `วันนี้ (${ThaiDateStr(start)})`
                : dateFilterMode === 'yesterday' ? `เมื่อวาน (${ThaiDateStr(start)})`
                : dateFilterMode === '7days' ? `7 วันล่าสุด (${ThaiDateStr(start)} - ${ThaiDateStr(end)})`
                : dateFilterMode === 'custom' ? `ช่วง ${ThaiDateStr(start)} - ${ThaiDateStr(end)}`
                : `เดือนปัจจุบัน`
        };
    }, [dateFilterMode, customStartDate, customEndDate]);

    // --- Orders Summary for Recipe Linkage based on Selected Filter Period ---
    const menuOrdersSummary = useMemo(() => {
        const counts: Record<number, number> = {};
        const validOrders = Array.isArray(completedOrders) ? completedOrders : [];
        
        validOrders.forEach(order => {
            if (!order || order.isDeleted) return;
            const time = order.completionTime || order.orderTime;
            if (!time) return;
            const orderTimeMs = new Date(time).getTime();
            if (orderTimeMs >= filterTimeRange.startTime && orderTimeMs <= filterTimeRange.endTime) {
                (order.items || []).forEach(item => {
                    if (item && item.id) {
                        counts[item.id] = (counts[item.id] || 0) + (Number(item.quantity) || 1);
                    }
                });
            }
        });
        return counts;
    }, [completedOrders, filterTimeRange]);

    // Fast map for menu items
    const menuItemsMap = useMemo(() => {
        const map = new Map<number, MenuItem>();
        (menuItems || []).forEach(m => {
            if (m && m.id) map.set(m.id, m);
        });
        return map;
    }, [menuItems]);

    // Helper to get linked menu items and customer order count for a stock item
    const getLinkedMenuItemsForStockItem = (stockItemId: number | string) => {
        if (!stockItemId) return [];
        const numericId = Number(stockItemId);
        
        const matchingRecipes = (recipes || []).filter(recipe => {
            if (!recipe) return false;
            const mainMatch = (recipe.ingredients || []).some(
                ing => Number(ing.stockItemId) === numericId
            );
            const addMatch = (recipe.additionalIngredients || []).some(
                ing => Number(ing.stockItemId) === numericId
            );
            return mainMatch || addMatch;
        });

        const linked = matchingRecipes.map(recipe => {
            const menuItem = menuItemsMap.get(recipe.menuItemId);
            const orderedQty = menuOrdersSummary[recipe.menuItemId] || 0;
            return {
                menuItemId: recipe.menuItemId,
                name: menuItem?.name || `เมนู #${recipe.menuItemId}`,
                imageUrl: menuItem?.imageUrl || '',
                orderedQty,
            };
        });

        // Sort by highest ordered count first, then by name
        linked.sort((a, b) => b.orderedQty - a.orderedQty || a.name.localeCompare(b.name));
        return linked;
    };

    // --- 1. Calculate Status Counts & Lists ---
    const stats = useMemo(() => {
        let outOfStock = 0;
        let lowStock = 0;
        let goodStock = 0;
        const outOfStockItems: StockItem[] = [];
        const lowStockItems: StockItem[] = [];
        const goodStockItems: StockItem[] = [];

        const validItems = Array.isArray(stockItems) ? stockItems : [];

        validItems.forEach(item => {
            if (!item) return;
            const qty = Number(item.quantity) || 0;
            const reorder = Number(item.reorderPoint) || 0;

            if (qty <= 0) {
                outOfStock++;
                outOfStockItems.push(item);
            } else if (qty <= reorder) {
                lowStock++;
                lowStockItems.push(item);
            } else {
                goodStock++;
                goodStockItems.push(item);
            }
        });

        // Sort items by name helper that gracefully handles missing strings or undefined objects
        const sortByName = (a: StockItem, b: StockItem) => {
            const nameA = a?.name || '';
            const nameB = b?.name || '';
            return nameA.localeCompare(nameB);
        };
        outOfStockItems.sort(sortByName);
        lowStockItems.sort(sortByName);
        goodStockItems.sort(sortByName);
        
        // Total items sorted
        const allItems = [...validItems].sort(sortByName);

        return {
            total: validItems.length,
            outOfStock,
            lowStock,
            goodStock,
            outOfStockItems,
            lowStockItems,
            goodStockItems,
            allItems
        };
    }, [stockItems]);

    // --- Current Month Key for fallback calculations ---
    const currentMonthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);

    // --- 2. Calculate Withdrawal Counts based on selected Period Filter ---
    const withdrawalCountsMap = useMemo(() => {
        const map: Record<number | string, number> = {};
        const validLogs = Array.isArray(stockLogs) ? stockLogs : [];

        // Filter logs within selected date/time range
        const logsInRange = validLogs.filter(log => {
            if (!log || !log.timestamp) return false;
            if (log.timestamp < filterTimeRange.startTime || log.timestamp > filterTimeRange.endTime) return false;
            // Action check
            const isAdjust = log.action === 'adjust';
            const isWithdraw = (log.changeDetails || '').includes('เบิกออก') || (log.changeDetails || '').includes('ปรับสต็อก (เบิกออก)');
            return isAdjust && isWithdraw;
        });

        logsInRange.forEach(log => {
            if (log.stockItemId) {
                map[log.stockItemId] = (map[log.stockItemId] || 0) + 1;
            }
        });

        // Fallback for current month if stockLogs are sparse or using legacy monthlyWithdrawals count
        if (dateFilterMode === 'month') {
            (stockItems || []).forEach(item => {
                if (!item) return;
                const monthCount = item?.monthlyWithdrawals?.[currentMonthKey] || 0;
                if (!map[item.id] || monthCount > map[item.id]) {
                    map[item.id] = monthCount;
                }
            });
        }

        return map;
    }, [stockLogs, filterTimeRange, stockItems, currentMonthKey, dateFilterMode]);

    // Pie Chart: Stock Health
    const stockHealthData = {
        labels: ['ปกติ', 'ใกล้หมด', 'หมดแล้ว'],
        data: [stats.goodStock, stats.lowStock, stats.outOfStock],
        colors: ['#10b981', '#f59e0b', '#ef4444'] // Green, Amber, Red
    };

    // Bar Chart: High Withdrawal Items (Based on Selected Filter)
    const topRotationItems = useMemo(() => {
        const validItems = Array.isArray(stockItems) ? stockItems : [];
        return [...validItems]
            .filter(Boolean)
            .map(i => {
                const count = withdrawalCountsMap[i.id] || 0;
                return { ...i, withdrawalCountForFilter: count };
            })
            .sort((a, b) => b.withdrawalCountForFilter - a.withdrawalCountForFilter)
            .slice(0, 7); // Top 7
    }, [stockItems, withdrawalCountsMap]);

    const rotationData = {
        labels: topRotationItems.map(i => i?.name || ''),
        data: topRotationItems.map(i => i?.withdrawalCountForFilter || 0),
        images: topRotationItems.map(i => i?.imageUrl || ''), // Extract images
        maxValue: Math.max(...topRotationItems.map(i => i?.withdrawalCountForFilter || 0), 10)
    };

    // --- Filter Stock Logs for Selected Detail Item ---
    const selectedItemLogs = useMemo(() => {
        if (!selectedDetailItem) return [];
        return (stockLogs || [])
            .filter(log => log && Number(log.stockItemId) === Number(selectedDetailItem.id))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }, [selectedDetailItem, stockLogs]);

    // --- Filter Completed Orders for Selected Linked Menu ---
    const selectedLinkedMenuOrders = useMemo(() => {
        if (!selectedLinkedMenu) return [];
        const validOrders = Array.isArray(completedOrders) ? completedOrders : [];

        return validOrders.filter(order => {
            if (!order || order.isDeleted) return false;
            const time = order.completionTime || order.orderTime;
            if (!time) return false;
            const orderTimeMs = new Date(time).getTime();
            if (orderTimeMs < filterTimeRange.startTime || orderTimeMs > filterTimeRange.endTime) return false;

            return (order.items || []).some(item => Number(item.id) === Number(selectedLinkedMenu.menuItemId));
        }).sort((a, b) => {
            const timeA = new Date(a.completionTime || a.orderTime || 0).getTime();
            const timeB = new Date(b.completionTime || b.orderTime || 0).getTime();
            return timeB - timeA;
        });
    }, [selectedLinkedMenu, completedOrders, filterTimeRange]);

    // Helper to format channel/location info
    const getOrderChannelInfo = (order: CompletedOrder) => {
        const orderType = order.orderType || 'dine-in';

        if (orderType === 'dine-in') {
            const tableName = order.tableName || (order.tableId ? `โต๊ะ ${order.tableId}` : 'ทานที่ร้าน');
            const floorText = order.floor ? ` (ชั้น ${order.floor})` : '';
            return {
                label: `ทานที่ร้าน - ${tableName}${floorText}`,
                badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold'
            };
        }

        if (orderType === 'takeaway') {
            const floorText = order.floor ? ` (ชั้น ${order.floor})` : '';
            return {
                label: `สั่งกลับบ้าน${floorText}`,
                badgeBg: 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
            };
        }

        if (orderType === 'lineman') {
            const subName = (order.tableName && order.tableName !== 'Delivery' && order.tableName !== 'Unknown')
                ? order.tableName
                : (order.customerName && !order.customerName.includes('Table') ? order.customerName : '');
            return {
                label: `LineMan${subName ? ` (${subName})` : ''}`,
                badgeBg: 'bg-green-100 text-green-900 border-green-300 font-bold'
            };
        }

        if (orderType === 'shopeefood') {
            return {
                label: 'ShopeeFood',
                badgeBg: 'bg-orange-100 text-orange-900 border-orange-300 font-bold'
            };
        }

        const channelName = order.tableName || order.customerName || orderType;
        return {
            label: channelName,
            badgeBg: 'bg-blue-100 text-blue-900 border-blue-300 font-semibold'
        };
    };

    // --- 3. Usage Rate Analysis (Excluding Mondays) ---
    const operatingDays = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const today = now.getDate();
        let days = 0;
        
        // Loop from day 1 to today
        for (let d = 1; d <= today; d++) {
            const date = new Date(year, month, d);
            // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (date.getDay() !== 1) { 
                days++;
            }
        }
        return days > 0 ? days : 1;
    }, []);

    const usageAnalysisItems = useMemo(() => {
        const validItems = Array.isArray(stockItems) ? stockItems : [];
        return [...validItems]
            .filter(Boolean)
            .map(item => {
                const used = withdrawalCountsMap[item.id] || 0;
                const rate = used / operatingDays;
                return { ...item, used, rate };
            })
            .filter(i => i.used > 0) // Show only items with usage
            .sort((a, b) => b.rate - a.rate) // Sort by highest usage rate
            .slice(0, 10); // Top 10 items
    }, [stockItems, withdrawalCountsMap, operatingDays]);

    // --- Helper to get data for modal ---
    const getModalData = () => {
        switch (selectedGroup) {
            case 'total': return { title: 'รายการสินค้าทั้งหมด', items: stats.allItems, colorClass: 'bg-blue-600' };
            case 'good': return { title: 'สินค้าสถานะปกติ', items: stats.goodStockItems, colorClass: 'bg-green-600' };
            case 'low': return { title: 'สินค้าใกล้หมด (ต้องสั่งเพิ่ม)', items: stats.lowStockItems, colorClass: 'bg-yellow-500' };
            case 'out': return { title: 'สินค้าหมดสต็อก!', items: stats.outOfStockItems, colorClass: 'bg-red-600' };
            default: return null;
        }
    };

    const modalData = getModalData();

    return (
        <div className="flex flex-col h-full w-full bg-gray-50 overflow-y-auto p-6 relative">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                สถิติการเบิกและสถานะสต็อก (รายเดือน)
            </h1>

            {/* KPI Cards (Clickable) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div 
                    onClick={() => setSelectedGroup('total')}
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all transform hover:-translate-y-1"
                >
                    <div>
                        <p className="text-sm text-gray-500 font-medium">สินค้าทั้งหมด</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total} รายการ</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-full text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </div>
                </div>
                <div 
                    onClick={() => setSelectedGroup('good')}
                    className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500 flex items-center justify-between cursor-pointer hover:shadow-lg hover:bg-green-50/20 transition-all transform hover:-translate-y-1"
                >
                    <div>
                        <p className="text-sm text-gray-500 font-medium">สถานะปกติ</p>
                        <p className="text-2xl font-bold text-green-600 mt-1">{stats.goodStock} รายการ</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-full text-green-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                </div>
                <div 
                    onClick={() => setSelectedGroup('low')}
                    className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-yellow-400 flex items-center justify-between cursor-pointer hover:shadow-lg hover:bg-yellow-50/20 transition-all transform hover:-translate-y-1"
                >
                    <div>
                        <p className="text-sm text-gray-500 font-medium">ใกล้หมด (ต้องสั่งเพิ่ม)</p>
                        <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.lowStock} รายการ</p>
                    </div>
                    <div className="p-3 bg-yellow-50 rounded-full text-yellow-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                </div>
                <div 
                    onClick={() => setSelectedGroup('out')}
                    className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500 flex items-center justify-between cursor-pointer hover:shadow-lg hover:bg-red-50/20 transition-all transform hover:-translate-y-1"
                >
                    <div>
                        <p className="text-sm text-gray-500 font-medium">สินค้าหมด!</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{stats.outOfStock} รายการ</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-full text-red-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                </div>
            </div>

            {/* Charts Section - Expanded to 4 columns to fill space */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-white p-6 rounded-xl shadow-sm lg:col-span-1">
                    <PieChart 
                        title="สัดส่วนสถานะสินค้าคงคลัง" 
                        data={stockHealthData.data} 
                        labels={stockHealthData.labels} 
                        colors={stockHealthData.colors} 
                    />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm lg:col-span-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">
                                สินค้าที่มีการเบิกออกสูงสุด ({filterTimeRange.label})
                            </h3>
                            <p className="text-xs text-gray-500">
                                *นับจากประวัติการเบิกสินค้าใน{filterTimeRange.label}เท่านั้น
                            </p>
                        </div>

                        {/* Date / Period Filter Controls */}
                        <div className="flex flex-wrap items-center gap-2 bg-purple-50/70 p-1.5 rounded-xl border border-purple-100 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-800 px-2 py-0.5">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>เลือกช่วงเวลา:</span>
                            </div>
                            <select
                                value={dateFilterMode}
                                onChange={(e) => setDateFilterMode(e.target.value as any)}
                                className="text-xs font-semibold bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-gray-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer hover:border-purple-300"
                            >
                                <option value="month">📅 เดือนปัจจุบัน</option>
                                <option value="today">☀️ วันนี้</option>
                                <option value="yesterday">⏳ เมื่อวาน</option>
                                <option value="7days">📊 7 วันล่าสุด</option>
                                <option value="custom">🗓️ กำหนดวันที่เอง</option>
                            </select>

                            {dateFilterMode === 'custom' && (
                                <div className="flex items-center gap-1 text-xs">
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="border border-purple-200 rounded-lg px-2 py-1 bg-white text-gray-800 text-xs shadow-2xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    />
                                    <span className="text-purple-400 font-bold">-</span>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="border border-purple-200 rounded-lg px-2 py-1 bg-white text-gray-800 text-xs shadow-2xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <SalesChart
                        title=""
                        data={rotationData.data}
                        labels={rotationData.labels}
                        images={rotationData.images} // Pass images to chart
                        maxValue={rotationData.maxValue}
                        formatValue={(val) => val.toLocaleString() + ' ครั้ง'} // Show number with unit
                        onBarClick={(idx) => {
                            const item = topRotationItems[idx];
                            if (item) {
                                setSelectedDetailItem(item);
                            }
                        }}
                    />
                </div>
            </div>

            {/* Usage Rate Analysis Section (NEW) */}
            <div className="bg-white p-6 rounded-xl shadow-sm mb-6 border border-gray-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-2">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            วิเคราะห์อัตราการใช้ (Usage Rate) - Top 10
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            คำนวณจากยอดเบิกเดือนนี้ หารด้วยจำนวนวันทำการ (หักวันจันทร์ออก) (คลิกที่รายการเพื่อดูประวัติการเบิก)
                        </p>
                    </div>
                    <div className="bg-purple-50 text-purple-700 px-3 py-1 rounded-lg text-xs font-semibold border border-purple-100">
                        เปิดทำการแล้ว: {operatingDays} วัน (ในเดือนนี้)
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-gray-500 bg-purple-50 uppercase text-xs rounded-t-lg">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">สินค้า</th>
                                <th className="px-4 py-3">เมนูขายดีที่ใช้วัตถุดิบนี้ (ยอดสั่งซื้อ)</th>
                                <th className="px-4 py-3 text-right">ยอดเบิกรวม</th>
                                <th className="px-4 py-3 text-right">อัตราการใช้ / วัน</th>
                                <th className="px-4 py-3 text-right">คงเหลือปัจจุบัน</th>
                                <th className="px-4 py-3 text-right rounded-tr-lg">ใช้ได้อีก (วัน)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usageAnalysisItems.length > 0 ? (
                                usageAnalysisItems.map((item, idx) => {
                                    const daysLeft = item.rate > 0 ? Number(item.quantity) / item.rate : 999;
                                    const linkedMenus = getLinkedMenuItemsForStockItem(item.id);

                                    return (
                                        <tr 
                                            key={`${item.id || 'usage'}-${idx}`} 
                                            onClick={() => setSelectedDetailItem(item)}
                                            className="border-b hover:bg-purple-50/50 cursor-pointer transition-colors"
                                            title="คลิกเพื่อดูประวัติผู้เบิก และวันเวลาที่เบิก"
                                        >
                                            <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                                                <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                                                    <img src={item.imageUrl || "https://placehold.co/100?text=No+Image"} alt={item.name} className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"} />
                                                </div>
                                                <span className="font-semibold">{item.name}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {linkedMenus.length > 0 ? (
                                                    <div className="flex flex-col gap-1.5 max-w-[280px]">
                                                        {linkedMenus.slice(0, 2).map((m, mIdx) => (
                                                            <div key={mIdx} className="flex items-center justify-between gap-2 bg-purple-50/80 hover:bg-purple-100 border border-purple-200 rounded-lg px-2.5 py-1 text-xs shadow-2xs transition-all">
                                                                <div 
                                                                    className="flex items-center gap-1.5 truncate cursor-pointer"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedLinkedMenu({
                                                                            menuItemId: m.menuItemId,
                                                                            name: m.name,
                                                                            imageUrl: m.imageUrl,
                                                                            orderedQty: m.orderedQty
                                                                        });
                                                                    }}
                                                                >
                                                                    {m.imageUrl ? (
                                                                        <img src={m.imageUrl} alt={m.name} className="w-5 h-5 rounded object-cover flex-shrink-0 border border-purple-200" />
                                                                    ) : (
                                                                        <span className="text-purple-500 text-xs">🍲</span>
                                                                    )}
                                                                    <span className="font-medium text-gray-800 truncate hover:text-purple-700" title={m.name}>{m.name}</span>
                                                                </div>
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedLinkedMenu({
                                                                            menuItemId: m.menuItemId,
                                                                            name: m.name,
                                                                            imageUrl: m.imageUrl,
                                                                            orderedQty: m.orderedQty
                                                                        });
                                                                    }}
                                                                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] whitespace-nowrap cursor-pointer transition-colors ${m.orderedQty > 0 ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-2xs' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                                                    title="คลิกเพื่อดูรายการบิลขายที่เกี่ยวข้อง"
                                                                >
                                                                    สั่ง {m.orderedQty} จาน
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {linkedMenus.length > 2 && (
                                                            <span className="text-[11px] text-purple-600 font-semibold pl-1">
                                                                + อีก {linkedMenus.length - 2} เมนูที่เกี่ยวข้อง
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-xs italic bg-gray-100/80 px-2 py-0.5 rounded">ไม่อยู่ในสูตรอาหาร</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">{item.used.toLocaleString()} {item.unit}</td>
                                            <td className="px-4 py-3 text-right font-bold text-purple-600">
                                                {item.rate.toFixed(2)} {item.unit}/วัน
                                            </td>
                                            <td className="px-4 py-3 text-right">{Number(item.quantity).toLocaleString()} {item.unit}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${daysLeft < 3 ? 'bg-red-100 text-red-700' : daysLeft < 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                                    {daysLeft > 365 ? '> 1 ปี' : `~${daysLeft.toFixed(1)} วัน`}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        ยังไม่มีข้อมูลการเบิกสินค้าในเดือนนี้
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Action List Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        รายการที่ต้องจัดการเร่งด่วน
                    </h3>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-gray-500 bg-gray-50 uppercase text-xs sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 bg-gray-50">สินค้า</th>
                                <th className="px-6 py-3 bg-gray-50">หมวดหมู่</th>
                                <th className="px-6 py-3 bg-gray-50 text-right">คงเหลือ</th>
                                <th className="px-6 py-3 bg-gray-50 text-right">จุดสั่งซื้อ</th>
                                <th className="px-6 py-3 bg-gray-50 text-center">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...stats.outOfStockItems, ...stats.lowStockItems].length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <span className="font-medium text-green-600">สต็อกอยู่ในเกณฑ์ดีเยี่ยม ไม่มีรายการต้องสั่งเพิ่ม</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                [...stats.outOfStockItems, ...stats.lowStockItems].map((item, idx) => (
                                    <tr key={`${item.id || 'low-out'}-${idx}`} className="border-b hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-md bg-gray-100 overflow-hidden border border-gray-200 flex-shrink-0">
                                                <img src={item.imageUrl || "https://placehold.co/100?text=No+Image"} alt={item.name} className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"} />
                                            </div>
                                            {item.name}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">{item.category}</td>
                                        <td className={`px-6 py-4 text-right font-bold ${Number(item.quantity) <= 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                                            {Number(item.quantity).toLocaleString()} {item.unit}
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-500">
                                            {Number(item.reorderPoint).toLocaleString()} {item.unit}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {Number(item.quantity) <= 0 ? (
                                                <span className="px-3 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">สินค้าหมด</span>
                                            ) : (
                                                <span className="px-3 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-700">ใกล้หมด</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* List Detail Modal */}
            {modalData && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedGroup(null)}>
                    <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className={`${modalData.colorClass} px-6 py-4 flex justify-between items-center text-white`}>
                            <div>
                                <h3 className="text-xl font-bold">{modalData.title}</h3>
                                <p className="text-sm opacity-90">จำนวน: {modalData.items.length} รายการ</p>
                            </div>
                            <button onClick={() => setSelectedGroup(null)} className="p-1 rounded-full hover:bg-white/20 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 p-0">
                            {modalData.items.length === 0 ? (
                                <div className="p-10 text-center text-gray-500 flex flex-col items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                    ไม่มีรายการในกลุ่มนี้
                                </div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-100 text-gray-600 font-semibold border-b sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-3">สินค้า</th>
                                            <th className="px-6 py-3">หมวดหมู่</th>
                                            <th className="px-6 py-3 text-right">คงเหลือ / จุดสั่งซื้อ</th>
                                            <th className="px-6 py-3 text-center">หน่วย</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {modalData.items.map((item, idx) => (
                                            <tr key={`${item.id || 'modal'}-${idx}`} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-3 flex items-center gap-3">
                                                    <span className="text-gray-400 text-xs w-4">{idx + 1}.</span>
                                                    <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0">
                                                        <img src={item.imageUrl || "https://placehold.co/100?text=No+Image"} alt={item.name} className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"} />
                                                    </div>
                                                    <span className="font-medium text-gray-800">{item.name}</span>
                                                </td>
                                                <td className="px-6 py-3 text-gray-500">{item.category}</td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className={`font-bold text-lg ${Number(item.quantity) <= 0 ? 'text-red-600' : Number(item.quantity) <= Number(item.reorderPoint) ? 'text-yellow-600' : 'text-green-600'}`}>
                                                        {Number(item.quantity).toLocaleString()}
                                                    </span>
                                                    <span className="text-gray-400 mx-1">/</span>
                                                    <span className="text-gray-500 font-medium">
                                                        {Number(item.reorderPoint).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-center text-gray-500">{item.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        
                        <div className="p-4 border-t bg-gray-50 text-right">
                            <button onClick={() => setSelectedGroup(null)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors">
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Withdrawal History Detail Modal */}
            {selectedDetailItem && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedDetailItem(null)}>
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-white/20 p-1 overflow-hidden border border-white/30 flex-shrink-0">
                                    <img 
                                        src={selectedDetailItem.imageUrl || "https://placehold.co/100?text=No+Image"} 
                                        alt={selectedDetailItem.name} 
                                        className="w-full h-full object-cover rounded-lg"
                                        onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"}
                                    />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">{selectedDetailItem.name}</h3>
                                    <p className="text-xs text-purple-200">
                                        หมวดหมู่: {selectedDetailItem.category} | คงเหลือปัจจุบัน: <span className="font-bold text-white">{selectedDetailItem.quantity} {selectedDetailItem.unit}</span>
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedDetailItem(null)} 
                                className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white"
                                title="ปิดหน้าต่าง"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Summary Banner */}
                        <div className="bg-purple-50 p-4 border-b border-purple-100 flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2 text-purple-900 font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>ยอดเบิกรวมตามตัวกรอง ({filterTimeRange.label}):</span>
                            </div>
                            <span className="text-lg font-bold text-purple-700">
                                {(withdrawalCountsMap[selectedDetailItem.id] || 0).toLocaleString()} {selectedDetailItem.unit}
                            </span>
                        </div>

                        {/* Log Table */}
                        <div className="overflow-y-auto flex-1 p-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                                <span>ประวัติผู้เบิก และวัน-เวลาทำรายการ ({selectedItemLogs.length} รายการ)</span>
                            </h4>

                            {selectedItemLogs.length === 0 ? (
                                <div className="p-10 text-center text-gray-500 flex flex-col items-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <p className="text-sm font-medium">ยังไม่มีประวัติการบันทึกเบิกในระบบสำหรับสินค้าชิ้นนี้</p>
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-2.5">วัน - เวลา</th>
                                                <th className="px-4 py-2.5">ผู้เบิก / ทำรายการ</th>
                                                <th className="px-4 py-2.5">รายละเอียดการเบิก</th>
                                                <th className="px-4 py-2.5">หมายเหตุ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {selectedItemLogs.map((log) => {
                                                const dateObj = new Date(log.timestamp);
                                                const formattedDate = dateObj.toLocaleDateString('th-TH', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                });
                                                const formattedTime = dateObj.toLocaleTimeString('th-TH', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });

                                                return (
                                                    <tr key={log.id} className="hover:bg-purple-50/30 transition-colors">
                                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 font-medium">
                                                            <div>{formattedDate}</div>
                                                            <div className="text-[10px] text-gray-400">{formattedTime} น.</div>
                                                        </td>
                                                        <td className="px-4 py-3 font-semibold text-gray-800">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-bold border border-purple-200">
                                                                    {(log.performedBy || 'A')[0].toUpperCase()}
                                                                </span>
                                                                <span>{log.performedBy || 'ระบบ'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 font-medium text-purple-700">
                                                            {log.changeDetails || 'เบิกสินค้า'}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500 italic">
                                                            {log.incompleteReason || '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t bg-gray-50 text-right">
                            <button 
                                onClick={() => setSelectedDetailItem(null)} 
                                className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-xl text-xs transition-colors shadow-sm"
                            >
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Linked Sales Bills Detail Modal */}
            {selectedLinkedMenu && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedLinkedMenu(null)}>
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-white/20 p-1 overflow-hidden border border-white/30 flex-shrink-0">
                                    {selectedLinkedMenu.imageUrl ? (
                                        <img 
                                            src={selectedLinkedMenu.imageUrl} 
                                            alt={selectedLinkedMenu.name} 
                                            className="w-full h-full object-cover rounded-lg"
                                            onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-2xl">🍲</div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">{selectedLinkedMenu.name}</h3>
                                    <p className="text-xs text-purple-200">
                                        ยอดสั่งซื้อรวมช่วงที่เลือก: <span className="font-bold text-white">{selectedLinkedMenu.orderedQty} จาน</span>
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSelectedLinkedMenu(null)} 
                                className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white"
                                title="ปิดหน้าต่าง"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Summary Banner */}
                        <div className="bg-purple-50 p-4 border-b border-purple-100 flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2 text-purple-900 font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span>รายการบิลขายที่เกี่ยวข้อง ({filterTimeRange.label}):</span>
                            </div>
                            <span className="text-xs font-bold text-purple-700 bg-purple-100 px-3 py-1 rounded-full border border-purple-200">
                                พบ {selectedLinkedMenuOrders.length} บิล
                            </span>
                        </div>

                        {/* Order Table */}
                        <div className="overflow-y-auto flex-1 p-4">
                            {selectedLinkedMenuOrders.length === 0 ? (
                                <div className="p-10 text-center text-gray-500 flex flex-col items-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <p className="text-sm font-medium">ไม่พบบิลการขายสำหรับเมนูนี้ในช่วงเวลาที่เลือก</p>
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3">หมายเลขออเดอร์ / เลขบิล</th>
                                                <th className="px-4 py-3">วัน - เวลาที่สั่งซื้อ</th>
                                                <th className="px-4 py-3">ช่องทางการขาย / สถานที่</th>
                                                <th className="px-4 py-3 text-right">จำนวน</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {selectedLinkedMenuOrders.map((order) => {
                                                const timeMs = order.completionTime || order.orderTime;
                                                const dateObj = new Date(timeMs);
                                                const formattedDate = dateObj.toLocaleDateString('th-TH', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                });
                                                const formattedTime = dateObj.toLocaleTimeString('th-TH', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                });

                                                const orderNoDisplay = order.manualOrderNumber 
                                                    ? order.manualOrderNumber 
                                                    : `#${order.orderNumber || order.id}`;

                                                const channelInfo = getOrderChannelInfo(order);

                                                const itemInOrder = (order.items || []).filter(i => Number(i.id) === Number(selectedLinkedMenu.menuItemId));
                                                const qtyInThisOrder = itemInOrder.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

                                                return (
                                                    <tr key={order.id} className="hover:bg-purple-50/40 transition-colors">
                                                        <td className="px-4 py-3 font-bold text-gray-900">
                                                            <span className="text-purple-700 font-mono text-sm">{orderNoDisplay}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                                                            <div>{formattedDate}</div>
                                                            <div className="text-[10px] text-gray-400">{formattedTime} น.</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs border ${channelInfo.badgeBg}`}>
                                                                {channelInfo.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold">
                                                            <span className="inline-flex items-center bg-purple-100 text-purple-900 px-2.5 py-1 rounded-lg text-xs font-bold border border-purple-200">
                                                                {qtyInThisOrder} จาน
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t bg-gray-50 text-right">
                            <button 
                                onClick={() => setSelectedLinkedMenu(null)} 
                                className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-xl text-xs transition-colors shadow-sm"
                            >
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
