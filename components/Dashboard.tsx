import React, { useMemo, useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { useData } from '../contexts/DataContext';
import { CompletedOrder, CancelledOrder, User, Recipe, DeliveryProvider } from '../types';
import { SalesChart } from './SalesChart';
import PieChart from './PieChart';
import { NumpadModal } from './NumpadModal';
import { calculateSmartUnitPrice } from '../utils/recipeUtils';

interface DashboardProps {
    completedOrders: CompletedOrder[];
    cancelledOrders: CancelledOrder[];
    openingTime: string;
    closingTime: string;
    currentUser: User | null;
    recipes: Recipe[];
    deliveryProviders: DeliveryProvider[];
    taxRate: number;
}

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className={`p-6 bg-white rounded-xl shadow-md flex items-center gap-6 border-l-4 ${color}`}>
        <div className="text-4xl">{icon}</div>
        <div>
            <p className="text-base text-gray-500 font-medium">{title}</p>
            <p className="text-3xl font-bold text-gray-800">{value}</p>
        </div>
    </div>
);

const getProviderColor = (name: string, deliveryProviders: DeliveryProvider[]) => {
    const provider = deliveryProviders.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (provider?.color) return provider.color;
    
    const lowerName = name.toLowerCase();
    if (lowerName.includes('shopeefood') || lowerName.includes('shopee')) return '#FF5722';
    if (lowerName.includes('lineman')) return '#00B14F';
    if (lowerName.includes('grab')) return '#00B14F';
    if (lowerName.includes('foodpanda')) return '#D70F64';
    if (lowerName.includes('robinhood')) return '#802D8C';
    return '#f97316';
};

const Dashboard: React.FC<DashboardProps> = ({ completedOrders, cancelledOrders, openingTime, closingTime, currentUser, recipes, deliveryProviders, taxRate }) => {
    const { manualAdCosts, setManualAdCosts, latestIngredientPrices, stockItems } = useData();
    // Local state for ad cost inputs to allow smooth typing (especially decimals)
    const [localAdCosts, setLocalAdCosts] = useState<Record<string, string>>({});

    // Sync local state with global manualAdCosts
    useEffect(() => {
        setLocalAdCosts(prev => {
            const next = { ...prev };
            let hasChanges = false;
            Object.entries(manualAdCosts).forEach(([key, val]) => {
                // Only update local if the numeric value is different
                if (parseFloat(prev[key] || '0') !== val) {
                    next[key] = val.toString();
                    hasChanges = true;
                }
            });
            return hasChanges ? next : prev;
        });
    }, [manualAdCosts]);

    // Initialize with today's date
    const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
    const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([new Date(), new Date()]);
    const [startDate, endDate] = dateRange;
    
    // NEW: State for Category Filtering
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
    // NEW: State for Order Type Filtering (LineMan, Dine-in, Takeaway)
    const [selectedOrderTypeFilter, setSelectedOrderTypeFilter] = useState<string | null>(null);
    // NEW: State for Hourly Traffic Drill-down
    const [selectedHourFilter, setSelectedHourFilter] = useState<number | null>(null);
    // NEW: State for Menu Ranking Sort Mode
    const [menuSortMode, setMenuSortMode] = useState<'quantity' | 'profit-desc' | 'profit-asc'>('quantity');
    const [isMenuSortOpen, setIsMenuSortOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'profit'>('overview');
    const [isNumpadOpen, setIsNumpadOpen] = useState(false);
    const [numpadTargetDate, setNumpadTargetDate] = useState<string | null>(null);
    const [numpadTargetProvider, setNumpadTargetProvider] = useState<string | null>(null);
    const [numpadInitialValue, setNumpadInitialValue] = useState<number>(0);

    // Check permissions for monthly view
    const canViewMonthly = useMemo(() => {
        if (!currentUser) return false;
        return ['admin', 'branch-admin', 'auditor'].includes(currentUser.role);
    }, [currentUser]);

    // --- DYNAMIC RECIPE COSTING (LIVE CALCULATION) ---
    const liveRecipeCosts = useMemo(() => {
        const costMap = new Map<number, { manual: number, smart: number }>();
        
        recipes.forEach(r => {
            // Calculate manual ingredients sum to find misc cost
            let ingManualSum = 0;
            r.ingredients.forEach(ing => {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                ingManualSum += ing.quantity * (ing.unitPrice ?? stockItem?.unitPrice ?? 0);
            });
            
            let addManualSum = 0;
            (r.additionalIngredients || []).forEach(ing => {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                addManualSum += ing.quantity * (ing.unitPrice ?? stockItem?.unitPrice ?? 0);
            });

            // Recalculate smart based on CURRENT latestIngredientPrices or saved smartUnitPrice
            let ingSmartSum = 0;
            r.ingredients.forEach(ing => {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                const latestPrice = latestIngredientPrices.find(p => (p.name || '').trim() === (stockItem?.name || '').trim());
                const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                
                let jsonUnitPrice = ing.smartUnitPrice;
                if (jsonUnitPrice === undefined) {
                    jsonUnitPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);
                }
                ingSmartSum += ing.quantity * jsonUnitPrice;
            });

            let addSmartSum = 0;
            (r.additionalIngredients || []).forEach(ing => {
                const stockItem = stockItems.find(s => s.id === ing.stockItemId);
                const latestPrice = latestIngredientPrices.find(p => (p.name || '').trim() === (stockItem?.name || '').trim());
                const manualPrice = ing.unitPrice ?? stockItem?.unitPrice ?? 0;
                
                let jsonUnitPrice = ing.smartUnitPrice;
                if (jsonUnitPrice === undefined) {
                    jsonUnitPrice = calculateSmartUnitPrice(ing, latestPrice, manualPrice);
                }
                addSmartSum += ing.quantity * jsonUnitPrice;
            });

            const miscCost = Math.max(0, r.additionalCost - addManualSum);
            const manualTotal = ingManualSum + addManualSum + miscCost;
            const smartSubtotal = ingSmartSum + addSmartSum + miscCost;
            
            const hiddenCostPercentage = r.hiddenCostPercentage || 0;
            const manualTotalWithHidden = manualTotal + (manualTotal * (hiddenCostPercentage / 100));
            const smartTotalWithHidden = smartSubtotal + (smartSubtotal * (hiddenCostPercentage / 100));

            costMap.set(r.menuItemId, { 
                manual: r.manualTotalCost || manualTotalWithHidden,
                smart: smartTotalWithHidden 
            });
        });
        
        return costMap;
    }, [recipes, stockItems, latestIngredientPrices]);



    // Helper to extract provider name from delivery orders
    const getDeliveryProviderName = (order: { orderType: string, customerName?: string, tableName?: string }) => {
        if (order.orderType !== 'lineman') return null;
        
        // 1. Try to get provider name from tableName (most reliable for recent orders)
        if (order.tableName && order.tableName !== 'Delivery' && order.tableName !== 'Unknown') {
            return order.tableName;
        }
        
        // 2. Try to parse from customerName (e.g. "LineMan #4703")
        if (order.customerName && order.customerName.includes('#')) {
            return order.customerName.split('#')[0].trim();
        }
        
        // 3. Fallback to customerName if it's not just a number
        if (order.customerName && isNaN(Number(order.customerName))) {
            return order.customerName;
        }
        
        return 'Delivery'; // Final fallback
    };

    const dailyProfitData = useMemo(() => {
        if (!startDate || !endDate) return [];

        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
        const days = Array.from({ length: daysDiff }, (_, i) => {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            d.setHours(0, 0, 0, 0);
            return d;
        });

        return days.map(day => {
            const dayStart = day.getTime();
            const dayEnd = dayStart + (24 * 3600 * 1000);
            
            // Use local date string (YYYY-MM-DD) to avoid timezone shifts
            const year = day.getFullYear();
            const month = String(day.getMonth() + 1).padStart(2, '0');
            const dateStr = String(day.getDate()).padStart(2, '0');
            const dayKey = `${year}-${month}-${dateStr}`;
            
            const manualAdCost = manualAdCosts[dayKey] || 0;

            const dayOrders = completedOrders.filter(order => 
                order.completionTime >= dayStart && order.completionTime < dayEnd
            );

            let totalRevenue = 0;
            let totalAdRevenue = 0;
            let totalManualCost = 0;
            let totalSmartCost = 0;
            let totalGP = 0;
            let totalTaxOnGP = 0;
            const adOrderCounts: Record<string, number> = {};
            const gpByProvider: Record<string, number> = {};
            const adRevenueByProvider: Record<string, number> = {};

            dayOrders.forEach(order => {
                const isDelivery = order.orderType === 'lineman' || order.tableName === 'Delivery' || order.customerName?.includes('#');
                
                // Identify provider name consistently using the helper
                const providerName = getDeliveryProviderName(order) || 'LineMan';

                const provider = deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase());
                
                order.items.forEach(item => {
                    const sellingPrice = item.finalPrice;
                    const itemQty = item.quantity;
                    totalRevenue += sellingPrice * itemQty;

                    if (order.isFromAd) {
                        totalAdRevenue += sellingPrice * itemQty;
                        adRevenueByProvider[providerName] = (adRevenueByProvider[providerName] || 0) + (sellingPrice * itemQty);
                    }

                    // Find recipe for cost - Dynamically calculated from latest JSON prices
                    const costs = liveRecipeCosts.get(Number(item.id));
                    const manualIngredientCost = costs?.manual || 0;
                    const smartIngredientCost = costs?.smart || 0;

                    totalManualCost += manualIngredientCost * itemQty;
                    totalSmartCost += smartIngredientCost * itemQty;

                    if (isDelivery) {
                        const gp = item.deliveryGPs?.[provider?.id || ''] || 0;
                        const tax = item.deliveryTaxes?.[provider?.id || ''] ?? taxRate;
                        
                        const gpAmount = sellingPrice * (gp / 100);
                        const taxOnGP = gpAmount * (tax / 100);
                        
                        const totalGPForItem = (gpAmount + taxOnGP) * itemQty;
                        totalGP += gpAmount * itemQty;
                        totalTaxOnGP += taxOnGP * itemQty;
                        
                        gpByProvider[providerName] = (gpByProvider[providerName] || 0) + totalGPForItem;
                    }
                });

                if (isDelivery && order.isFromAd) {
                    if (providerName) {
                        adOrderCounts[providerName] = (adOrderCounts[providerName] || 0) + 1;
                    }
                }

                // Add order-level tax to revenue
                totalRevenue += order.taxAmount;
                if (order.isFromAd) {
                    totalAdRevenue += order.taxAmount;
                    adRevenueByProvider[providerName] = (adRevenueByProvider[providerName] || 0) + order.taxAmount;
                }
            });

            // Calculate manual ad costs per provider
            const manualAdCostsByProvider: Record<string, number> = {};
            let totalManualAdCostWithTax = 0;
            
            Object.entries(manualAdCosts).forEach(([key, cost]) => {
                // ONLY include keys that match the current day AND have the new composite format "date|provider"
                // This ignores legacy keys that were just "date" which caused incorrect totals.
                if (key.startsWith(dayKey) && key.includes('|')) {
                    const provider = key.split('|')[1];
                    manualAdCostsByProvider[provider] = (manualAdCostsByProvider[provider] || 0) + cost;
                    totalManualAdCostWithTax += cost * 1.07;
                }
            });

            const roasByProvider: Record<string, number> = {};
            const providersWithAds = new Set([...Object.keys(adRevenueByProvider), ...Object.keys(manualAdCostsByProvider)]);
            
            providersWithAds.forEach(p => {
                const rev = adRevenueByProvider[p] || 0;
                const cost = manualAdCostsByProvider[p] || 0;
                roasByProvider[p] = cost > 0 ? rev / cost : 0;
            });

            const netProfitManual = totalRevenue - totalManualCost - totalGP - totalTaxOnGP - totalManualAdCostWithTax;
            const netProfitSmart = totalRevenue - totalSmartCost - totalGP - totalTaxOnGP - totalManualAdCostWithTax;

            return {
                date: day.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
                fullDate: dayKey,
                revenue: totalRevenue,
                adRevenue: totalAdRevenue,
                adRevenueByProvider,
                manualCost: totalManualCost,
                smartCost: totalSmartCost,
                gp: totalGP + totalTaxOnGP,
                gpByProvider,
                adCost: totalManualAdCostWithTax,
                manualAdCostsByProvider,
                adOrderCounts,
                roasByProvider,
                netProfitManual,
                netProfitSmart
            };
        });
    }, [completedOrders, startDate, endDate, recipes, deliveryProviders, taxRate, manualAdCosts]);
    
    const roasSummary = useMemo(() => {
        let high = 0;   // Green: >= 7.1
        let medium = 0; // Yellow: 4.1 - 7.0
        let low = 0;    // Red: 0.1 - 4.0
        
        dailyProfitData.forEach(day => {
            Object.values(day.roasByProvider).forEach(roas => {
                if (roas >= 7.1) high++;
                else if (roas >= 4.1) medium++;
                else if (roas > 0) low++;
            });
        });

        return { high, medium, low };
    }, [dailyProfitData]);

    const handleViewModeChange = (mode: 'daily' | 'monthly') => {
        setViewMode(mode);
        const today = new Date();
        if (mode === 'daily') {
            setDateRange([today, today]);
        } else {
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            setDateRange([startOfMonth, endOfMonth]);
        }
        setSelectedHourFilter(null);
    };



    const handleCategoryClick = (category: string) => {
        // Toggle: Click again to clear
        if (selectedCategoryFilter === category) {
            setSelectedCategoryFilter(null);
        } else {
            setSelectedCategoryFilter(category);
        }
    };

    const handleOrderTypeClick = (typeLabel: string) => {
        // Toggle
        if (selectedOrderTypeFilter === typeLabel) {
            setSelectedOrderTypeFilter(null);
        } else {
            setSelectedOrderTypeFilter(typeLabel);
        }
    };

    const handleClearFilter = () => {
        setSelectedCategoryFilter(null);
        setSelectedOrderTypeFilter(null);
        setSelectedHourFilter(null);
    };

    // Filter orders based on the selected local date/month AND role visibility AND filters (Type/Category logic moved to charts mostly)
    const filteredCompletedOrders = useMemo(() => {
        let orders = completedOrders;
        
        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.completionTime);
            let matchesDate = false;
            
            if (startDate && endDate) {
                const startOfDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
                const endOfDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
                matchesDate = orderDate >= startOfDay && orderDate <= endOfDay;
            } else if (startDate) {
                matchesDate = orderDate.getDate() === startDate.getDate() &&
                              orderDate.getMonth() === startDate.getMonth() &&
                              orderDate.getFullYear() === startDate.getFullYear();
            } else {
                // If no date is selected, show all
                matchesDate = true;
            }

            if (!matchesDate) return false;

            // Apply Order Type Filter (LineMan/Takeaway/Dine-in) with Provider Support
            if (selectedOrderTypeFilter) {
                const isDelivery = order.orderType === 'lineman';
                const isTakeawayOrder = order.orderType === 'takeaway';
                // Check if any item is takeaway (hybrid order)
                const hasTakeawayItems = order.items.some(i => i.isTakeaway);

                if (selectedOrderTypeFilter === 'กลับบ้าน') {
                    // Include if order is strictly takeaway OR has takeaway items
                    if (!isTakeawayOrder && !hasTakeawayItems) return false;
                } else if (selectedOrderTypeFilter === 'ทานที่ร้าน') {
                    // Strictly Dine-in order type
                    if (order.orderType !== 'dine-in') return false;
                } else {
                    // Delivery Provider Filter
                    if (!isDelivery) return false;
                    const provider = getDeliveryProviderName(order);
                    // Match provider name (case-sensitive as charts use exact labels)
                    if (provider !== selectedOrderTypeFilter) return false;
                }
            }

            return true;
        });
    }, [completedOrders, startDate, endDate, currentUser, selectedOrderTypeFilter]);

    // NEW: Active Orders for Charts (Apply Hour Filter if selected)
    const ordersForCharts = useMemo(() => {
        if (selectedHourFilter === null) return filteredCompletedOrders;

        return filteredCompletedOrders.filter(order => {
            // NOTE: Filter based on Order Start Time (Behavior)
            const orderStartHour = new Date(order.orderTime).getHours();
            return orderStartHour === selectedHourFilter;
        });
    }, [filteredCompletedOrders, selectedHourFilter]);

    const filteredCancelledOrders = useMemo(() => {
        let orders = cancelledOrders;

        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.cancellationTime);
            let matchesDate = false;
            
            if (startDate && endDate) {
                const startOfDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
                const endOfDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
                matchesDate = orderDate >= startOfDay && orderDate <= endOfDay;
            } else if (startDate) {
                matchesDate = orderDate.getDate() === startDate.getDate() &&
                              orderDate.getMonth() === startDate.getMonth() &&
                              orderDate.getFullYear() === startDate.getFullYear();
            } else {
                matchesDate = true;
            }

            if (!matchesDate) return false;

            // Apply Order Type Filter with Provider Support
            if (selectedOrderTypeFilter) {
                const isDelivery = order.orderType === 'lineman';
                const isTakeawayOrder = order.orderType === 'takeaway';

                if (selectedOrderTypeFilter === 'กลับบ้าน') {
                    if (!isTakeawayOrder) return false;
                } else if (selectedOrderTypeFilter === 'ทานที่ร้าน') {
                    if (order.orderType !== 'dine-in') return false;
                } else {
                    if (!isDelivery) return false;
                    const provider = getDeliveryProviderName(order);
                    if (provider !== selectedOrderTypeFilter) return false;
                }
            }

            return true;
        });
    }, [cancelledOrders, startDate, endDate, currentUser, selectedOrderTypeFilter]);

    const dailyStats = useMemo(() => {
        // Stats use global filtered orders (not hour filtered) to show daily summary unless we want dynamic stats too.
        // Usually dashboard stats remain for the day. Let's keep them day-based.
        const totalSales = filteredCompletedOrders.reduce((sum, order) => {
            const isDelivery = order.orderType === 'lineman';
            const providerName = isDelivery ? getDeliveryProviderName(order) : null;
            const provider = providerName ? deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase()) : null;

            const subtotal = order.items.reduce((itemSum, item) => {
                // Apply Category Filter to Sum if active
                if (selectedCategoryFilter && (item.category || 'ไม่มีหมวดหมู่') !== selectedCategoryFilter) {
                    return itemSum;
                }
                
                const sellingPrice = item.finalPrice;
                
                return itemSum + sellingPrice * item.quantity;
            }, 0);
            
            return sum + subtotal + (selectedCategoryFilter || order.isFromAd ? 0 : order.taxAmount);
        }, 0);
        
        const totalCustomers = filteredCompletedOrders.reduce((sum, order) => sum + order.customerCount, 0);
        const averagePerCustomer = totalCustomers > 0 ? totalSales / totalCustomers : 0;
        
        return {
            totalSales,
            completedCount: filteredCompletedOrders.length,
            cancelledCount: filteredCancelledOrders.length,
            totalCustomers,
            averagePerCustomer
        };
    }, [filteredCompletedOrders, filteredCancelledOrders, selectedCategoryFilter]);

    // UPDATED: Chart Data Logic to support Category Filter AND Hourly Filter (via ordersForCharts)
    const chartData = useMemo(() => {
        if (viewMode === 'monthly' && startDate && endDate) {
            // --- Monthly View ---
            const daysInMonth = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24) + 1;
            const days = Array.from({ length: daysInMonth }, (_, i) => new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
            const salesByDay = new Array(days.length).fill(0);

            ordersForCharts.forEach(order => {
                const orderDate = new Date(order.completionTime);
                const dayIndex = days.findIndex(d => d.getDate() === orderDate.getDate() && d.getMonth() === orderDate.getMonth() && d.getFullYear() === orderDate.getFullYear());
                if (dayIndex > -1) {
                    let orderTotal = 0;
                    const isDelivery = order.orderType === 'lineman';
                    const providerName = isDelivery ? getDeliveryProviderName(order) : null;
                    const provider = providerName ? deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase()) : null;
                    
                    if (selectedCategoryFilter) {
                        orderTotal = order.items.reduce((sum, item) => {
                            const itemCategory = item.category || 'ไม่มีหมวดหมู่';
                            if (itemCategory === selectedCategoryFilter) {
                                const sellingPrice = item.finalPrice;
                                return sum + (sellingPrice * item.quantity);
                            }
                            return sum;
                        }, 0);
                    } else {
                        orderTotal = order.items.reduce((sum, item) => {
                            const sellingPrice = item.finalPrice;
                            return sum + sellingPrice * item.quantity;
                        }, 0) + (order.isFromAd ? 0 : order.taxAmount);
                    }

                    salesByDay[dayIndex] += orderTotal;
                }
            });

            return {
                title: selectedCategoryFilter ? `ยอดขายรายวัน: ${selectedCategoryFilter}` : 'ยอดขายรายวัน',
                labels: days.map(d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })),
                data: salesByDay,
                maxValue: Math.max(...salesByDay, 1000)
            };

        } else {
            // --- Daily View: Sales per Hour ---
            const openHour = parseInt(String(openingTime).split(':')[0], 10);
            const closeHour = parseInt(String(closingTime).split(':')[0], 10);
            const startH = isNaN(openHour) ? 0 : openHour;
            const endH = isNaN(closeHour) ? 23 : closeHour;
            
            const hoursLength = endH >= startH ? endH - startH + 1 : (24 - startH) + endH + 1;
            const hours = Array.from({ length: hoursLength }, (_, i) => (startH + i) % 24);
            
            const salesByHour = new Array(hours.length).fill(0);
            
            ordersForCharts.forEach(order => {
                const orderHour = new Date(order.completionTime).getHours();
                const hourIndex = hours.indexOf(orderHour);
                if (hourIndex > -1) {
                    let orderTotal = 0;
                    const isDelivery = order.orderType === 'lineman';
                    const providerName = isDelivery ? getDeliveryProviderName(order) : null;
                    const provider = providerName ? deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase()) : null;

                    if (selectedCategoryFilter) {
                        orderTotal = order.items.reduce((sum, item) => {
                            const itemCategory = item.category || 'ไม่มีหมวดหมู่';
                            if (itemCategory === selectedCategoryFilter) {
                                const sellingPrice = item.finalPrice;
                                return sum + (sellingPrice * item.quantity);
                            }
                            return sum;
                        }, 0);
                    } else {
                        orderTotal = order.items.reduce((sum, item) => {
                            const sellingPrice = item.finalPrice;
                            return sum + sellingPrice * item.quantity;
                        }, 0) + (order.isFromAd ? 0 : order.taxAmount);
                    }

                    salesByHour[hourIndex] += orderTotal;
                }
            });

            return {
                title: selectedCategoryFilter ? `ยอดขายรายชั่วโมง: ${selectedCategoryFilter}` : 'ยอดขายรายชั่วโมง',
                labels: hours.map(h => `${h}:00`),
                data: salesByHour,
                maxValue: Math.max(...salesByHour, 1000)
            };
        }
    }, [ordersForCharts, openingTime, closingTime, viewMode, startDate, endDate, selectedCategoryFilter]);

    // UPDATED: Order Item Type Data - Breaks down delivery providers
    const orderItemTypeData = useMemo(() => {
        let dineInItems = 0;
        let takeawayItems = 0;
        const deliveryItemsMap: Record<string, number> = {};
        
        // Detailed breakdown tracking for the drill-down view
        const providerItemsBreakdown: Record<string, Record<string, number>> = {};
        const takeawayItemsBreakdown: Record<string, number> = {};
        const dineInItemsBreakdown: Record<string, number> = {};
        
        ordersForCharts.forEach(order => {
            const isDelivery = order.orderType === 'lineman';
            const providerName = isDelivery ? getDeliveryProviderName(order) : null;
            
            order.items.forEach(item => {
                if (selectedCategoryFilter) {
                    const itemCategory = item.category || 'ไม่มีหมวดหมู่';
                    if (itemCategory !== selectedCategoryFilter) return;
                }

                if (isDelivery && providerName) {
                    deliveryItemsMap[providerName] = (deliveryItemsMap[providerName] || 0) + item.quantity;
                    
                    if (!providerItemsBreakdown[providerName]) providerItemsBreakdown[providerName] = {};
                    providerItemsBreakdown[providerName][item.name] = (providerItemsBreakdown[providerName][item.name] || 0) + item.quantity;

                } else if (item.isTakeaway) {
                    takeawayItems += item.quantity;
                    takeawayItemsBreakdown[item.name] = (takeawayItemsBreakdown[item.name] || 0) + item.quantity;
                } else {
                    dineInItems += item.quantity;
                    dineInItemsBreakdown[item.name] = (dineInItemsBreakdown[item.name] || 0) + item.quantity;
                }
            });
        });

        const labels = ['ทานที่ร้าน', 'กลับบ้าน'];
        const data = [dineInItems, takeawayItems];
        const colors = ['#3b82f6', '#8b5cf6']; // Blue, Purple

        // Sort delivery providers by volume
        const sortedProviders = Object.entries(deliveryItemsMap).sort((a, b) => b[1] - a[1]);

        sortedProviders.forEach(([name, count]) => {
            labels.push(name);
            data.push(count);
            
            // Assign distinct colors based on name
            const lowerName = name.toLowerCase();
            if (lowerName.includes('lineman')) colors.push('#10b981'); // Emerald Green
            else if (lowerName.includes('shopee')) colors.push('#f97316'); // Orange
            else if (lowerName.includes('grab')) colors.push('#22c55e'); // Green
            else if (lowerName.includes('robin')) colors.push('#a855f7'); // Purple
            else if (lowerName.includes('panda')) colors.push('#ec4899'); // Pink
            else colors.push('#64748b'); // Slate for unknown
        });

        return {
            title: selectedCategoryFilter ? `ประเภทรายการ: ${selectedCategoryFilter}` : 'ประเภทรายการ (แยกตามผู้ให้บริการ)',
            labels,
            data,
            colors,
            providerItemsBreakdown,
            takeawayItemsBreakdown,
            dineInItemsBreakdown
        };
    }, [ordersForCharts, selectedCategoryFilter]);

    // UPDATED: Category sales data - Uses ordersForCharts (Filtered by Hour)
    const categorySalesData = useMemo(() => {
        const salesByCategory: Record<string, number> = {};
        
        ordersForCharts.forEach(order => {
            const isDelivery = order.orderType === 'lineman';
            const providerName = isDelivery ? getDeliveryProviderName(order) : null;
            const provider = providerName ? deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase()) : null;
            
            order.items.forEach(item => {
                const category = item.category || 'ไม่มีหมวดหมู่';
                const sellingPrice = item.finalPrice;
                const itemTotal = sellingPrice * item.quantity;
                salesByCategory[category] = (salesByCategory[category] || 0) + itemTotal;
            });
        });

        const sortedCategories = Object.entries(salesByCategory).sort(([, a], [, b]) => b - a);

        return {
            labels: sortedCategories.map(([label]) => label),
            data: sortedCategories.map(([, data]) => data),
            colors: ['#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6', '#ef4444', '#6b7280']
        };
    }, [ordersForCharts]);

    // --- Hourly Traffic Analytics (Behavior Analysis) ---
    const hourlyInsights = useMemo(() => {
        // ALWAYS use filteredCompletedOrders (full day) for this chart, 
        // because it acts as the navigator/filter controller.
        const hourlyDistribution = new Array(24).fill(0);
        
        filteredCompletedOrders.forEach(order => {
            // Use orderTime (when they started ordering) to analyze behavior
            const hour = new Date(order.orderTime).getHours();
            if (hour >= 0 && hour < 24) {
                hourlyDistribution[hour]++;
            }
        });

        const maxOrders = Math.max(...hourlyDistribution, 1);
        const peakHourIndex = hourlyDistribution.indexOf(maxOrders);
        const peakHourStr = maxOrders > 0 
            ? `${String(peakHourIndex).padStart(2, '0')}:00 - ${String(peakHourIndex + 1).padStart(2, '0')}:00` 
            : 'ไม่มีข้อมูล';

        const openHour = parseInt(String(openingTime).split(':')[0], 10);
        const closeHour = parseInt(String(closingTime).split(':')[0], 10);
        const startH = isNaN(openHour) ? 0 : openHour;
        const endH = isNaN(closeHour) ? 23 : closeHour;
        
        const displayStart = Math.max(0, startH - 1);
        const displayEnd = Math.min(23, endH + 1);
        
        const displayLabels = [];
        const displayData = [];
        const displayHours = []; // To map index back to actual hour
        
        for(let i = displayStart; i <= displayEnd; i++) {
            displayLabels.push(`${String(i).padStart(2, '0')}:00`);
            displayData.push(hourlyDistribution[i]);
            displayHours.push(i);
        }

        // --- NEW: Calculate Actual Average ---
        // Count active hours (hours with > 0 orders)
        const activeHoursCount = hourlyDistribution.filter(count => count > 0).length;
        const totalOrders = filteredCompletedOrders.length;
        const averageOrders = activeHoursCount > 0 ? Math.round(totalOrders / activeHoursCount) : 0;

        return {
            data: displayData,
            labels: displayLabels,
            displayHours,
            peakHourStr,
            maxOrders,
            averageOrders, // Pass the correct average
            totalOrders: filteredCompletedOrders.length
        };
    }, [filteredCompletedOrders, openingTime, closingTime]);

    // --- NEW: Monthly & Menu Insights Calculation ---
    // This runs on completedOrders but filtered to the MONTH of the selectedDate
    // This allows seeing "Highest Day of Month" even if viewing Daily mode
    const monthlyInsights = useMemo(() => {
        // 1. Filter all orders for the SELECTED MONTH
        const ordersInMonth = completedOrders.filter(o => {
            if (currentUser?.role !== 'admin' && o.isDeleted) return false;
            const d = new Date(o.completionTime);
            if (startDate && endDate) {
                const startOfDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
                const endOfDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
                return d >= startOfDay && d <= endOfDay;
            } else if (startDate) {
                return d.getDate() === startDate.getDate() && d.getMonth() === startDate.getMonth() && d.getFullYear() === startDate.getFullYear();
            } 
            return true;
        });

        // 2. Financial Stats (Avg, Max, Min)
        const salesByDate = new Map<string, number>();
        const itemSales = new Map<string, number>();

        ordersInMonth.forEach(o => {
            // Aggregate Sales by Date
            const dateKey = new Date(o.completionTime).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
            const isDelivery = o.orderType === 'lineman';
            const providerName = isDelivery ? getDeliveryProviderName(o) : null;
            const provider = providerName ? deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase()) : null;

            const total = o.items.reduce((s, i) => {
                const sellingPrice = i.finalPrice;
                return s + (sellingPrice * i.quantity);
            }, 0) + (o.isFromAd ? 0 : o.taxAmount);
            salesByDate.set(dateKey, (salesByDate.get(dateKey) || 0) + total);

            // Aggregate Menu Items
            o.items.forEach(i => {
                itemSales.set(i.name, (itemSales.get(i.name) || 0) + i.quantity);
            });
        });

        // Calculate Revenue Stats
        const salesValues = Array.from(salesByDate.entries());
        
        // Average
        const totalRevenue = salesValues.reduce((sum, [, val]) => sum + val, 0);
        const daysWithSales = salesValues.length;
        const averageDailyRevenue = daysWithSales > 0 ? totalRevenue / daysWithSales : 0;

        // Max & Min
        salesValues.sort((a, b) => b[1] - a[1]); // Descending
        const highestDay = salesValues.length > 0 ? salesValues[0] : null; // [DateStr, Amount]
        const lowestDay = salesValues.length > 0 ? salesValues[salesValues.length - 1] : null;

        // Menu Analysis
        const menuRanking = Array.from(itemSales.entries()).map(([name, qty]) => {
            let totalItemProfit = 0;
            let totalItemRevenue = 0;
            let totalItemQty = 0;

            // Calculate profit for each occurrence of this item
            ordersInMonth.forEach(order => {
                const itemsInOrder = order.items.filter(i => i.name === name);
                if (itemsInOrder.length === 0) return;

                const isDelivery = order.orderType === 'lineman';
                const providerName = isDelivery ? getDeliveryProviderName(order) : null;
                const provider = providerName ? deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase()) : null;

                itemsInOrder.forEach(item => {
                    const sellingPrice = item.finalPrice;
                    const itemQty = item.quantity;
                    totalItemRevenue += sellingPrice * itemQty;
                    totalItemQty += itemQty;

                    // Find recipe - Use Dynamic Smart Cost (JSON) for analytics
                    const costs = liveRecipeCosts.get(Number(item.id));
                    const costPerUnit = costs?.smart || (sellingPrice * 0.6);

                    if (isDelivery) {
                        // Delivery Profit Formula
                        let adCostWithTax = 0;
                        if (order.isFromAd) {
                            if (order.recordedAdCost !== undefined) {
                                adCostWithTax = order.recordedAdCost + (order.recordedAdCostTax || 0);
                            } else if (provider) {
                                const fixedAdCost = provider.fixedAdCost || 0;
                                adCostWithTax = fixedAdCost + (fixedAdCost * (taxRate / 100));
                            }
                        }
                        
                        const gp = item.deliveryGPs?.[provider?.id || ''] || 0;
                        const tax = item.deliveryTaxes?.[provider?.id || ''] ?? taxRate;
                        
                        const gpAmount = sellingPrice * (gp / 100);
                        const taxOnGP = gpAmount * (tax / 100);
                        
                        // Distribute fixed ad cost across all items in the order to get per-item profit
                        // Total items in order
                        const totalItemsInOrder = order.items.reduce((sum, i) => sum + i.quantity, 0);
                        const adCostPerUnit = totalItemsInOrder > 0 ? adCostWithTax / totalItemsInOrder : 0;

                        const netProfitPerUnit = (sellingPrice - gpAmount - taxOnGP) - costPerUnit - adCostPerUnit;
                        totalItemProfit += netProfitPerUnit * itemQty;
                    } else {
                        // Dine-in / Takeaway Profit (Simplified)
                        // Assuming sellingPrice already includes tax or tax is handled separately
                        const netProfitPerUnit = sellingPrice - costPerUnit;
                        totalItemProfit += netProfitPerUnit * itemQty;
                    }
                });
            });

            const avgPrice = totalItemQty > 0 ? totalItemRevenue / totalItemQty : 0;
            const profitPerUnit = totalItemQty > 0 ? totalItemProfit / totalItemQty : 0;

            return {
                name,
                quantity: qty,
                totalProfit: totalItemProfit,
                profitPerUnit
            };
        });

        if (menuSortMode === 'quantity') {
            menuRanking.sort((a, b) => b.quantity - a.quantity);
        } else if (menuSortMode === 'profit-desc') {
            menuRanking.sort((a, b) => b.totalProfit - a.totalProfit);
        } else if (menuSortMode === 'profit-asc') {
            menuRanking.sort((a, b) => a.totalProfit - b.totalProfit);
        }

        const top5 = menuRanking.slice(0, 5).map(item => [item.name, item.quantity, item.totalProfit] as [string, number, number]);
        const bottom5 = menuRanking.length > 5 ? menuRanking.slice(-5).reverse().map(item => [item.name, item.quantity, item.totalProfit] as [string, number, number]) : [];

        return {
            averageDailyRevenue,
            highestDay,
            lowestDay,
            top5,
            bottom5,
            hasData: ordersInMonth.length > 0
        };
    }, [completedOrders, startDate, endDate, currentUser, recipes, menuSortMode, deliveryProviders]);


    const handleHourlyTrafficClick = (index: number) => {
        const clickedHour = hourlyInsights.displayHours[index];
        if (selectedHourFilter === clickedHour) {
            setSelectedHourFilter(null);
        } else {
            setSelectedHourFilter(clickedHour);
        }
    };

    const handleManualAdCostChange = (dateKey: string, providerName: string, value: string) => {
        // Allow only numbers and one decimal point
        if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;

        const compositeKey = `${dateKey}|${providerName}`;
        // Update local string state immediately for smooth typing
        setLocalAdCosts(prev => ({ ...prev, [compositeKey]: value }));

        const amount = parseFloat(value) || 0;
        setManualAdCosts(prev => ({
            ...prev,
            [compositeKey]: amount
        }));
    };

    const openNumpad = (dateKey: string, providerName: string, currentValue: number) => {
        setNumpadTargetDate(dateKey);
        setNumpadTargetProvider(providerName);
        setNumpadInitialValue(currentValue);
        setIsNumpadOpen(true);
    };

    const formattedDateDisplay = useMemo(() => {
        if (startDate && endDate) {
            if (startDate.getTime() === endDate.getTime()) {
                return startDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
            }
            return `${startDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        } else if (startDate) {
            return startDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        return 'เลือกช่วงวันที่';
    }, [startDate, endDate]);

    // Calculate selected index for chart highlighting
    const selectedTrafficIndex = selectedHourFilter !== null 
        ? hourlyInsights.displayHours.indexOf(selectedHourFilter)
        : null;

    return (
        <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto overflow-x-auto w-full pb-24 custom-scrollbar">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold text-gray-800">
                        Dashboard <span className="text-lg font-medium text-gray-500">({formattedDateDisplay})</span>
                    </h1>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            ภาพรวมยอดขาย
                        </button>
                        <button 
                            onClick={() => setActiveTab('profit')}
                            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${activeTab === 'profit' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            รายงานกำไรรายวัน
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-gray-200">
                    {canViewMonthly && (
                        <div className="flex bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => handleViewModeChange('daily')}
                                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                                    viewMode === 'daily' 
                                        ? 'bg-white text-blue-600 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                รายวัน
                            </button>
                            <button
                                onClick={() => handleViewModeChange('monthly')}
                                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                                    viewMode === 'monthly' 
                                        ? 'bg-white text-blue-600 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                รายเดือน
                            </button>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <label className="text-gray-600 font-medium text-sm hidden sm:inline">
                            เลือกช่วงวันที่:
                        </label>
                        <div className="relative">
                            <DatePicker
                                selectsRange={true}
                                startDate={startDate}
                                endDate={endDate}
                                onChange={(update) => {
                                    setDateRange(update);
                                }}
                                isClearable={true}
                                dateFormat="dd/MM/yyyy"
                                className="border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-800 font-medium text-sm cursor-pointer w-48"
                            />
                        </div>
                    </div>
                </div>
            </div>
            
            {activeTab === 'overview' ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="ยอดขายรวม" value={`${dailyStats.totalSales.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })}`} icon={<span>💰</span>} color="border-green-500" />
                <StatCard title="ออเดอร์สำเร็จ" value={dailyStats.completedCount.toLocaleString()} icon={<span>✅</span>} color="border-blue-500" />
                <StatCard title="ลูกค้าทั้งหมด" value={dailyStats.totalCustomers.toLocaleString()} icon={<span>👥</span>} color="border-purple-500" />
                <StatCard title="ยกเลิกออเดอร์" value={dailyStats.cancelledCount.toLocaleString()} icon={<span>❌</span>} color="border-red-500" />
            </div>

            {/* Filter Indicator */}
            {(selectedCategoryFilter || selectedOrderTypeFilter || selectedHourFilter !== null) && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex items-center justify-between animate-fade-in-up">
                    <div className="flex items-center gap-2 flex-wrap">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                        </svg>
                        <span className="font-semibold">กำลังแสดงข้อมูล:</span>
                        {selectedHourFilter !== null && <span className="bg-orange-200 text-orange-900 px-2 py-0.5 rounded text-sm font-bold">เวลา {String(selectedHourFilter).padStart(2, '0')}:00 - {String(selectedHourFilter+1).padStart(2, '0')}:00</span>}
                        {selectedOrderTypeFilter && <span className="bg-blue-200 text-blue-900 px-2 py-0.5 rounded text-sm font-bold">{selectedOrderTypeFilter}</span>}
                        {selectedCategoryFilter && <span className="bg-blue-200 text-blue-900 px-2 py-0.5 rounded text-sm font-bold">{selectedCategoryFilter}</span>}
                    </div>
                    <button 
                        onClick={handleClearFilter}
                        className="text-sm font-semibold hover:underline text-blue-600 whitespace-nowrap ml-2"
                    >
                        ล้างตัวกรอง
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <SalesChart
                            title={chartData.title}
                            data={chartData.data}
                            labels={chartData.labels}
                            maxValue={chartData.maxValue}
                        />
                    </div>
                    
                    {/* Hourly Traffic Analytics Section */}
                    <div className={`bg-white p-6 rounded-xl shadow-md border-t-4 border-orange-400 transition-colors ${selectedHourFilter !== null ? 'ring-2 ring-orange-300' : ''}`}>
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                    </svg>
                                    วิเคราะห์พฤติกรรมช่วงเวลาสั่งอาหาร (Customer Traffic)
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    คลิกที่กราฟเพื่อดูรายละเอียดยอดขายของช่วงเวลานั้นๆ
                                </p>
                            </div>
                            <div className="mt-4 sm:mt-0 bg-orange-50 px-4 py-3 rounded-lg border border-orange-200 text-right">
                                <p className="text-xs text-orange-800 font-semibold uppercase tracking-wider">ช่วงเวลาขายดีที่สุด (PEAK HOUR)</p>
                                <p className="text-2xl font-black text-orange-600">{hourlyInsights.peakHourStr}</p>
                                <div className="flex flex-col items-end gap-0.5 mt-1">
                                    {hourlyInsights.maxOrders > 0 && (
                                        <p className="text-sm text-orange-800 font-bold">
                                            {hourlyInsights.maxOrders} ออเดอร์ <span className="text-xs font-normal opacity-80">(สูงสุด)</span>
                                        </p>
                                    )}
                                    {hourlyInsights.averageOrders > 0 && (
                                        <p className="text-xs text-orange-700 font-medium">
                                            เฉลี่ยทั้งวัน {hourlyInsights.averageOrders} ออเดอร์/ชม.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="w-full overflow-x-auto">
                            <SalesChart
                                title=""
                                data={hourlyInsights.data}
                                labels={hourlyInsights.labels}
                                maxValue={hourlyInsights.maxOrders > 0 ? hourlyInsights.maxOrders : 10}
                                formatValue={(val) => val + ' ครั้ง'}
                                onBarClick={handleHourlyTrafficClick}
                                selectedIndex={selectedTrafficIndex !== -1 ? selectedTrafficIndex : null}
                            />
                        </div>
                    </div>

                    {/* --- MOVED: Monthly Insights Section --- */}
                    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                        <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <h3 className="text-xl font-bold text-indigo-900">สรุปภาพรวมและวิเคราะห์เมนูประจำเดือน {formattedDateDisplay}</h3>
                        </div>
                        
                        <div className="p-6 grid grid-cols-1 xl:grid-cols-5 gap-8">
                            {/* Left: Financial Stats */}
                            <div className="xl:col-span-2 space-y-4">
                                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                                    <div>
                                        <p className="text-gray-500 font-medium">รายได้เฉลี่ย / วัน</p>
                                        <p className="text-3xl font-bold text-indigo-600 mt-1">
                                            {monthlyInsights.averageDailyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ฿
                                        </p>
                                    </div>
                                    <div className="p-3 bg-indigo-50 rounded-full text-indigo-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-lg border border-green-200 shadow-sm flex items-center justify-between bg-green-50/30">
                                    <div>
                                        <p className="text-green-700 font-medium flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12 7a1 1 0 110-2 1 1 0 010 2zm1 2a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /><path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" /></svg>
                                            วันยอดขายสูงสุด
                                        </p>
                                        <p className="text-2xl font-bold text-gray-800 mt-1">
                                            {monthlyInsights.highestDay ? monthlyInsights.highestDay[1].toLocaleString() : 0} ฿
                                        </p>
                                        <p className="text-sm text-green-600 mt-1 font-semibold">
                                            วันที่: {monthlyInsights.highestDay ? monthlyInsights.highestDay[0] : '-'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-green-100 rounded-full text-green-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                    </div>
                                </div>

                                <div className="bg-white p-5 rounded-lg border border-red-200 shadow-sm flex items-center justify-between bg-red-50/30">
                                    <div>
                                        <p className="text-red-700 font-medium flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12 13a1 1 0 100 2 1 1 0 000-2zm1-8a1 1 0 100-2 1 1 0 000 2zM5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" /></svg>
                                            วันยอดขายต่ำสุด
                                        </p>
                                        <p className="text-2xl font-bold text-gray-800 mt-1">
                                            {monthlyInsights.lowestDay ? monthlyInsights.lowestDay[1].toLocaleString() : 0} ฿
                                        </p>
                                        <p className="text-sm text-red-600 mt-1 font-semibold">
                                            วันที่: {monthlyInsights.lowestDay ? monthlyInsights.lowestDay[0] : '-'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-red-100 rounded-full text-red-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Menu Analysis */}
                            <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Top Selling */}
                                <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-full">
                                    <div className="p-4 border-b bg-green-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                        <h4 className="font-bold text-green-800 flex items-center gap-2">
                                            <span className="text-lg">🏆</span> 5 อันดับเมนู
                                        </h4>
                                        <div className="relative">
                                            <button 
                                                onClick={() => setIsMenuSortOpen(!isMenuSortOpen)}
                                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:border-green-300 hover:bg-green-50 transition-all group"
                                            >
                                                <span className="text-gray-500 group-hover:text-green-600">เรียงตาม:</span>
                                                <span className={`font-bold ${
                                                    menuSortMode === 'quantity' ? 'text-green-600' : 
                                                    menuSortMode === 'profit-desc' ? 'text-blue-600' : 'text-red-600'
                                                }`}>
                                                    {menuSortMode === 'quantity' ? 'จำนวนขาย' : menuSortMode === 'profit-desc' ? 'กำไรมาก' : 'กำไรน้อย'}
                                                </span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isMenuSortOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            
                                            {isMenuSortOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={() => setIsMenuSortOpen(false)}></div>
                                                    <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in duration-200 origin-top-right">
                                                        <button 
                                                            onClick={() => { setMenuSortMode('quantity'); setIsMenuSortOpen(false); }}
                                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors ${menuSortMode === 'quantity' ? 'bg-green-50 text-green-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                                                        >
                                                            <div className={`w-2 h-2 rounded-full ${menuSortMode === 'quantity' ? 'bg-green-500' : 'bg-transparent border border-gray-200'}`}></div>
                                                            ตามจำนวนขาย
                                                        </button>
                                                        <button 
                                                            onClick={() => { setMenuSortMode('profit-desc'); setIsMenuSortOpen(false); }}
                                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors ${menuSortMode === 'profit-desc' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                                                        >
                                                            <div className={`w-2 h-2 rounded-full ${menuSortMode === 'profit-desc' ? 'bg-blue-500' : 'bg-transparent border border-gray-200'}`}></div>
                                                            กำไรมากไปน้อย
                                                        </button>
                                                        <button 
                                                            onClick={() => { setMenuSortMode('profit-asc'); setIsMenuSortOpen(false); }}
                                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors ${menuSortMode === 'profit-asc' ? 'bg-red-50 text-red-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                                                        >
                                                            <div className={`w-2 h-2 rounded-full ${menuSortMode === 'profit-asc' ? 'bg-red-500' : 'bg-transparent border border-gray-200'}`}></div>
                                                            กำไรน้อยไปมาก
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-2 flex-1">
                                        {monthlyInsights.top5.length > 0 ? (
                                            <ul className="space-y-1">
                                                {monthlyInsights.top5.map(([name, qty, profit], idx) => (
                                                    <li key={idx} className="flex justify-between items-center p-2 hover:bg-green-50/50 rounded-lg transition-colors">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold text-white flex-shrink-0 ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-400' : 'bg-green-200 text-green-800'}`}>
                                                                {idx + 1}
                                                            </span>
                                                            <span className="font-medium text-gray-700 truncate">{name}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-bold text-green-600 whitespace-nowrap">{qty} จาน</div>
                                                            <div className="text-[10px] text-gray-400">กำไร: {Math.round(profit).toLocaleString()} ฿</div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-gray-400 text-sm">ไม่มีข้อมูล</div>
                                        )}
                                    </div>
                                </div>

                                {/* Least Selling */}
                                <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col h-full">
                                    <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                                        <h4 className="font-bold text-gray-600 flex items-center gap-2">
                                            <span className="text-lg">📉</span> อันดับท้ายตาราง
                                        </h4>
                                    </div>
                                    <div className="p-2 flex-1">
                                        {monthlyInsights.bottom5.length > 0 ? (
                                            <ul className="space-y-1">
                                                {monthlyInsights.bottom5.map(([name, qty, profit], idx) => (
                                                    <li key={idx} className="flex justify-between items-center p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <span className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold bg-gray-200 text-gray-500 flex-shrink-0">
                                                                {monthlyInsights.top5.length + idx + 1}
                                                            </span>
                                                            <span className="font-medium text-gray-600 truncate">{name}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-bold text-gray-500 whitespace-nowrap">{qty} จาน</div>
                                                            <div className="text-[10px] text-gray-400">กำไร: {Math.round(profit).toLocaleString()} ฿</div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-gray-400 text-sm">ไม่มีข้อมูล</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex flex-col gap-6">
                    <PieChart
                        title="สัดส่วนยอดขายตามหมวดหมู่"
                        data={categorySalesData.data}
                        labels={categorySalesData.labels}
                        colors={categorySalesData.colors}
                        onSliceClick={handleCategoryClick}
                        selectedLabel={selectedCategoryFilter}
                    />
                    
                    {selectedOrderTypeFilter && selectedOrderTypeFilter !== 'ทานที่ร้าน' && selectedOrderTypeFilter !== 'กลับบ้าน' && orderItemTypeData.providerItemsBreakdown[selectedOrderTypeFilter] ? (
                        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-md h-full flex flex-col animate-in fade-in zoom-in duration-300">
                            <div className="flex items-center justify-between mb-4 border-b pb-3">
                                <h3 className="text-lg font-bold text-gray-800">
                                    เมนูยอดฮิต: <span className="text-indigo-600">{selectedOrderTypeFilter}</span>
                                </h3>
                                <button 
                                    onClick={() => handleOrderTypeClick(selectedOrderTypeFilter)}
                                    className="p-1 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    ย้อนกลับ
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2">
                                <ul className="space-y-2">
                                    {Object.entries(orderItemTypeData.providerItemsBreakdown[selectedOrderTypeFilter])
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([itemName, count], idx) => (
                                            <li key={idx} className="flex justify-between items-center p-2 rounded text-sm hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors">
                                                <span className="flex items-center gap-2">
                                                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="font-medium text-gray-700">{itemName}</span>
                                                </span>
                                                <span className="font-bold text-gray-900">{count} จาน</span>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        </div>
                    ) : (
                         <PieChart
                            title={orderItemTypeData.title}
                            data={orderItemTypeData.data}
                            labels={orderItemTypeData.labels}
                            colors={orderItemTypeData.colors}
                            onSliceClick={handleOrderTypeClick}
                            selectedLabel={selectedOrderTypeFilter}
                        />
                    )}
                </div>
            </div>
                </>
            ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-6 rounded-xl shadow-md">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">สรุปกำไรสุทธิรายวัน (Daily Net Profit)</h3>
                                <p className="text-sm text-gray-500 mt-1">วิเคราะห์ผลกระทบจากค่าโฆษณาและค่า GP ต่อกำไรสุทธิ</p>
                            </div>
                            <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-100">
                                <p className="text-xs text-green-700 font-bold uppercase tracking-wider">กำไรสุทธิรวมช่วงนี้</p>
                                <div className="flex flex-col items-end">
                                    <p className="text-2xl font-black text-green-600">
                                        {dailyProfitData.reduce((sum, d) => sum + d.netProfitManual, 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })}
                                    </p>
                                    <p className="text-sm font-bold text-green-500">
                                        {dailyProfitData.reduce((sum, d) => sum + d.netProfitSmart, 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })}
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="h-80 w-full">
                            <SalesChart
                                title="แนวโน้มกำไรสุทธิรายวัน"
                                data={[
                                    dailyProfitData.map(d => d.netProfitManual),
                                    dailyProfitData.map(d => d.netProfitSmart)
                                ]}
                                seriesLabels={['กำไรเดิม', 'กำไรล่าสุด JSON']}
                                labels={dailyProfitData.map(d => d.date)}
                                maxValue={Math.max(
                                    ...dailyProfitData.map(d => Math.abs(d.netProfitManual)),
                                    ...dailyProfitData.map(d => Math.abs(d.netProfitSmart)),
                                    1000
                                )}
                            />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-6">
                        <div className="text-sm font-bold text-gray-500 uppercase tracking-wider">สรุปประสิทธิภาพ RoAS:</div>
                        <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 shadow-sm">
                                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                                <span className="text-sm font-bold text-green-700">ประสิทธิภาพสูง (7.1x+): <span className="text-lg ml-1">{roasSummary.high}</span></span>
                            </div>
                            <div className="flex items-center gap-2 bg-yellow-50 px-3 py-1.5 rounded-lg border border-yellow-200 shadow-sm">
                                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                                <span className="text-sm font-bold text-yellow-700">ปานกลาง (4.1-7.0x): <span className="text-lg ml-1">{roasSummary.medium}</span></span>
                            </div>
                            <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 shadow-sm">
                                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                                <span className="text-sm font-bold text-red-700">ควรปรับปรุง (0-4.0x): <span className="text-lg ml-1">{roasSummary.low}</span></span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-md">
                        <div className="">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-30 px-6 py-4 text-sm font-bold text-gray-600 bg-gray-50 border-b border-gray-100 first:rounded-tl-xl last:rounded-tr-xl">วันที่</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-30 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">รายรับรวม</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-30 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">ยอดขายจากโฆษณา</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-30 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">ต้นทุนวัตถุดิบ</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-20 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">ค่า GP + ภาษี</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-20 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">ค่าโฆษณา (รวมที่กรอก)</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-20 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">RoAS</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-20 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">กำไรสุทธิ</th>
                                        <th className="sticky top-[-16px] md:top-[-24px] z-20 px-6 py-4 text-sm font-bold text-gray-600 text-right bg-gray-50 border-b border-gray-100">Margin %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyProfitData.slice().reverse().map((day, idx) => {
                                        const marginManual = day.revenue > 0 ? (day.netProfitManual / day.revenue) * 100 : 0;
                                        const marginSmart = day.revenue > 0 ? (day.netProfitSmart / day.revenue) * 100 : 0;
                                        return (
                                            <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-bold text-gray-800">{day.date}</td>
                                                <td className="px-6 py-4 text-sm text-gray-700 text-right">{day.revenue.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-blue-600 font-bold text-right">{day.adRevenue.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-gray-800 font-medium">{day.manualCost.toLocaleString()}</span>
                                                        <div className="flex items-center gap-1 justify-end">
                                                            <span className="text-red-500 text-xs font-bold">{day.smartCost.toLocaleString()}</span>
                                                            <span className="text-[9px] text-red-300 font-bold uppercase">(JSON)</span>
                                                        </div>
                                                        <span className={`text-[10px] font-bold border-t border-gray-100 mt-1 pt-0.5 ${day.smartCost > day.manualCost ? 'text-red-600' : 'text-green-600'}`}>
                                                            {day.smartCost - day.manualCost > 0 ? '+' : ''}{(day.smartCost - day.manualCost).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-red-400 text-right">
                                                    {day.gp > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                            <span>-{day.gp.toLocaleString()}</span>
                                                            <div className="flex flex-wrap justify-end gap-1 mt-1">
                                                                {Object.entries(day.gpByProvider).map(([name, amount]) => (
                                                                    <span 
                                                                        key={name} 
                                                                        className="text-[10px] px-1 rounded-sm text-white font-bold"
                                                                        style={{ backgroundColor: getProviderColor(name, deliveryProviders) }}
                                                                    >
                                                                        {name}: {amount.toLocaleString()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : '0'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-orange-400 text-right align-top">
                                                    <div className="flex flex-col items-end gap-3">
                                                        {deliveryProviders.filter(p => p.isEnabled).map(provider => {
                                                            const cost = day.manualAdCostsByProvider[provider.name] || 0;
                                                            const costWithTax = cost * 1.07;
                                                            return (
                                                                <div key={provider.id} className="flex flex-col items-end border-b border-orange-100 pb-2 last:border-0 last:pb-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: getProviderColor(provider.name, deliveryProviders) }}>
                                                                            {provider.name}
                                                                        </span>
                                                                        <div className="relative flex items-center">
                                                                            <input 
                                                                                type="text"
                                                                                inputMode="decimal"
                                                                                value={localAdCosts[`${day.fullDate}|${provider.name}`] ?? (cost || '')}
                                                                                onChange={(e) => handleManualAdCostChange(day.fullDate, provider.name, e.target.value)}
                                                                                className="w-24 px-2 py-1.5 text-right border border-orange-200 rounded bg-orange-50 hover:bg-orange-100 transition-colors focus:outline-none focus:ring-1 focus:ring-orange-400 text-orange-700 font-bold pr-8"
                                                                                placeholder="0"
                                                                            />
                                                                            <button 
                                                                                onClick={() => openNumpad(day.fullDate, provider.name, cost)}
                                                                                className="absolute right-1 p-1 text-orange-400 hover:text-orange-600 transition-colors"
                                                                                title="เปิดแป้นพิมพ์ตัวเลข"
                                                                            >
                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    {cost > 0 && (
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-xs text-gray-400">ภาษี 7%: +{(cost * 0.07).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                            <span className="text-sm font-bold text-orange-600">รวม: -{costWithTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                            {day.adOrderCounts[provider.name] > 0 && (
                                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
                                                                                    {provider.name}: {day.adOrderCounts[provider.name]}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right align-top">
                                                    <div className="flex flex-col items-end gap-3">
                                                        {Object.entries(day.roasByProvider).map(([providerName, roas]) => {
                                                            const adRev = day.adRevenueByProvider[providerName] || 0;
                                                            const adCost = day.manualAdCostsByProvider[providerName] || 0;
                                                            const adOrderCount = day.adOrderCounts[providerName] || 0;
                                                            const avgAdCostPerBill = adOrderCount > 0 ? adCost / adOrderCount : 0;

                                                            if (adRev === 0 && adCost === 0) return null;
                                                            return (
                                                                <div key={providerName} className="flex flex-col items-end border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                                                    <span className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: getProviderColor(providerName, deliveryProviders) }}>{providerName}</span>
                                                                    <span className="text-sm font-bold text-blue-600 mb-1">
                                                                        {adRev.toLocaleString()} ฿
                                                                    </span>
                                                                    <span className={`px-2 py-1 rounded text-xs font-black ${roas >= 7.1 ? 'bg-green-100 text-green-700' : roas >= 4.1 ? 'bg-yellow-100 text-yellow-700' : roas > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                                                                        {roas.toFixed(2)}x
                                                                    </span>
                                                                    {adCost > 0 && (
                                                                        <span className="text-xs text-gray-500 mt-1 font-medium">
                                                                            เฉลี่ยบิลละ {avgAdCostPerBill.toLocaleString(undefined, { maximumFractionDigits: 2 })} ฿
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className={`text-sm font-black ${day.netProfitManual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {day.netProfitManual.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                        </span>
                                                        <span className={`text-xs font-bold ${day.netProfitSmart >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {day.netProfitSmart.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                        </span>
                                                        <span className={`text-[10px] font-bold border-t border-gray-100 mt-1 pt-0.5 ${day.netProfitSmart < day.netProfitManual ? 'text-red-600' : 'text-green-600'}`}>
                                                            {day.netProfitSmart - day.netProfitManual > 0 ? '+' : ''}{(day.netProfitSmart - day.netProfitManual).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${marginManual >= 30 ? 'bg-green-100 text-green-700' : marginManual >= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                            {marginManual.toFixed(1)}%
                                                        </span>
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold mt-1 ${marginSmart >= 30 ? 'bg-green-50 text-green-600' : marginSmart >= 15 ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
                                                            {marginSmart.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            
            <NumpadModal
                isOpen={isNumpadOpen}
                onClose={() => setIsNumpadOpen(false)}
                initialValue={numpadInitialValue}
                onSubmit={(val) => {
                    if (numpadTargetDate && numpadTargetProvider) {
                        handleManualAdCostChange(numpadTargetDate, numpadTargetProvider, val);
                    }
                }}
                title={`กรอกค่าโฆษณา (${numpadTargetProvider})`}
            />
        </div>
    );
};

export default Dashboard;
