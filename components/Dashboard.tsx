
import React, { useMemo, useState, useRef } from 'react';
import type { CompletedOrder, CancelledOrder, User } from '../types';
import { SalesChart } from './SalesChart';
import PieChart from './PieChart';

interface DashboardProps {
    completedOrders: CompletedOrder[];
    cancelledOrders: CancelledOrder[];
    openingTime: string;
    closingTime: string;
    currentUser: User | null;
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

export const Dashboard: React.FC<DashboardProps> = ({ completedOrders, cancelledOrders, openingTime, closingTime, currentUser }) => {
    // Initialize with today's date
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
    const dateInputRef = useRef<HTMLInputElement>(null);
    
    // NEW: State for Category Filtering
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
    // NEW: State for Order Type Filtering (LineMan, Dine-in, Takeaway)
    const [selectedOrderTypeFilter, setSelectedOrderTypeFilter] = useState<string | null>(null);

    // Check permissions for monthly view
    const canViewMonthly = useMemo(() => {
        if (!currentUser) return false;
        return ['admin', 'branch-admin', 'auditor'].includes(currentUser.role);
    }, [currentUser]);

    // Helper to format date based on view mode (using local time)
    const dateInputValue = useMemo(() => {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        
        if (viewMode === 'monthly') {
            return `${year}-${month}`;
        }
        
        const day = String(selectedDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, [selectedDate, viewMode]);

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) {
            if (viewMode === 'monthly') {
                const [year, month] = e.target.value.split('-').map(Number);
                // Set to the 1st of the selected month
                setSelectedDate(new Date(year, month - 1, 1));
            } else {
                const [year, month, day] = e.target.value.split('-').map(Number);
                setSelectedDate(new Date(year, month - 1, day));
            }
        }
    };

    const handleViewModeChange = (mode: 'daily' | 'monthly') => {
        setViewMode(mode);
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
    };

    // Filter orders based on the selected local date/month AND role visibility AND filters
    const filteredCompletedOrders = useMemo(() => {
        let orders = completedOrders;
        
        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.completionTime);
            let matchesDate = false;
            
            if (viewMode === 'monthly') {
                matchesDate = orderDate.getMonth() === selectedDate.getMonth() &&
                              orderDate.getFullYear() === selectedDate.getFullYear();
            } else {
                matchesDate = orderDate.getDate() === selectedDate.getDate() &&
                              orderDate.getMonth() === selectedDate.getMonth() &&
                              orderDate.getFullYear() === selectedDate.getFullYear();
            }

            if (!matchesDate) return false;

            // Apply Order Type Filter (LineMan/Takeaway/Dine-in)
            if (selectedOrderTypeFilter) {
                const isLineMan = order.orderType === 'lineman';
                const isTakeawayOrder = order.orderType === 'takeaway';
                // Check if any item is takeaway (hybrid order)
                const hasTakeawayItems = order.items.some(i => i.isTakeaway);

                if (selectedOrderTypeFilter === 'LineMan') {
                    if (!isLineMan) return false;
                } else if (selectedOrderTypeFilter === 'กลับบ้าน') {
                    // Include if order is strictly takeaway OR has takeaway items
                    if (!isTakeawayOrder && !hasTakeawayItems) return false;
                } else if (selectedOrderTypeFilter === 'ทานที่ร้าน') {
                    // Strictly Dine-in order type
                    if (order.orderType !== 'dine-in') return false;
                }
            }

            return true;
        });
    }, [completedOrders, selectedDate, currentUser, viewMode, selectedOrderTypeFilter]);

    const filteredCancelledOrders = useMemo(() => {
        let orders = cancelledOrders;

        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.cancellationTime);
            let matchesDate = false;
            
            if (viewMode === 'monthly') {
                matchesDate = orderDate.getMonth() === selectedDate.getMonth() &&
                              orderDate.getFullYear() === selectedDate.getFullYear();
            } else {
                matchesDate = orderDate.getDate() === selectedDate.getDate() &&
                              orderDate.getMonth() === selectedDate.getMonth() &&
                              orderDate.getFullYear() === selectedDate.getFullYear();
            }

            if (!matchesDate) return false;

            // Apply Order Type Filter
            if (selectedOrderTypeFilter) {
                const isLineMan = order.orderType === 'lineman';
                if (selectedOrderTypeFilter === 'LineMan' && !isLineMan) return false;
                if (selectedOrderTypeFilter === 'ทานที่ร้าน' && (isLineMan || order.orderType === 'takeaway')) return false;
                // Simplified check for cancellation logs
            }

            return true;
        });
    }, [cancelledOrders, selectedDate, currentUser, viewMode, selectedOrderTypeFilter]);

    const dailyStats = useMemo(() => {
        const totalSales = filteredCompletedOrders.reduce((sum, order) => {
            const subtotal = order.items.reduce((itemSum, item) => {
                // Apply Category Filter to Sum if active
                if (selectedCategoryFilter && (item.category || 'ไม่มีหมวดหมู่') !== selectedCategoryFilter) {
                    return itemSum;
                }
                return itemSum + item.finalPrice * item.quantity;
            }, 0);
            
            // If category filter is active, we don't include tax in the stat card usually, 
            // or we approximate it. For now, let's include tax only if no category filter 
            // OR if we assume tax applies proportionally (simplifying to exclude tax when filtering items for clarity)
            return sum + subtotal + (selectedCategoryFilter ? 0 : order.taxAmount);
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

    // UPDATED: Chart Data Logic to support Category Filter
    const chartData = useMemo(() => {
        if (viewMode === 'monthly') {
            // --- Monthly View: Sales per Day ---
            const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
            const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
            const salesByDay = new Array(days.length).fill(0);

            filteredCompletedOrders.forEach(order => {
                const day = new Date(order.completionTime).getDate();
                if (day >= 1 && day <= daysInMonth) {
                    let orderTotal = 0;
                    
                    if (selectedCategoryFilter) {
                        // If filtered, sum only matching items
                        orderTotal = order.items.reduce((sum, item) => {
                            const itemCategory = item.category || 'ไม่มีหมวดหมู่';
                            if (itemCategory === selectedCategoryFilter) {
                                return sum + (item.finalPrice * item.quantity);
                            }
                            return sum;
                        }, 0);
                        // NOTE: Tax is excluded when filtering by category because tax applies to the whole bill
                    } else {
                        // Normal total
                        orderTotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0) + order.taxAmount;
                    }

                    salesByDay[day - 1] += orderTotal;
                }
            });

            return {
                title: selectedCategoryFilter ? `ยอดขายรายวัน: ${selectedCategoryFilter}` : 'ยอดขายรายวัน (ตลอดเดือน)',
                labels: days.map(d => `${d}`),
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
            
            filteredCompletedOrders.forEach(order => {
                const orderHour = new Date(order.completionTime).getHours();
                const hourIndex = hours.indexOf(orderHour);
                if (hourIndex > -1) {
                    let orderTotal = 0;

                    if (selectedCategoryFilter) {
                        // Filter logic
                        orderTotal = order.items.reduce((sum, item) => {
                            const itemCategory = item.category || 'ไม่มีหมวดหมู่';
                            if (itemCategory === selectedCategoryFilter) {
                                return sum + (item.finalPrice * item.quantity);
                            }
                            return sum;
                        }, 0);
                    } else {
                        // Normal logic
                        orderTotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0) + order.taxAmount;
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
    }, [filteredCompletedOrders, openingTime, closingTime, viewMode, selectedDate, selectedCategoryFilter]);

    // UPDATED: Order Item Type Data with Filter Logic - Including LineMan
    const orderItemTypeData = useMemo(() => {
        let dineInItems = 0;
        let takeawayItems = 0;
        let linemanItems = 0;
        
        filteredCompletedOrders.forEach(order => {
            // Count based on order type first, but also check individual items if needed
            const isLineManOrder = order.orderType === 'lineman';
            
            order.items.forEach(item => {
                // Apply filter if selected
                if (selectedCategoryFilter) {
                    const itemCategory = item.category || 'ไม่มีหมวดหมู่';
                    if (itemCategory !== selectedCategoryFilter) return;
                }

                if (isLineManOrder) {
                    linemanItems += item.quantity;
                } else if (item.isTakeaway) {
                    takeawayItems += item.quantity;
                } else {
                    dineInItems += item.quantity;
                }
            });
        });

        return {
            title: selectedCategoryFilter ? `ประเภทรายการ: ${selectedCategoryFilter}` : 'ประเภทรายการ (ทานที่ร้าน / กลับบ้าน / LineMan)',
            labels: ['ทานที่ร้าน', 'กลับบ้าน', 'LineMan'],
            data: [dineInItems, takeawayItems, linemanItems],
            colors: ['#3b82f6', '#8b5cf6', '#10b981'] // Blue, Purple, Green (LineMan)
        };
    }, [filteredCompletedOrders, selectedCategoryFilter]);

    // Category sales data remains independent of the filter (it acts AS the filter control)
    const categorySalesData = useMemo(() => {
        const salesByCategory: Record<string, number> = {};
        // We iterate over filteredCompletedOrders which respects OrderType filter but NOT Category filter yet (for this chart)
        // Wait, filteredCompletedOrders DOES NOT respect category filter. Category filter is applied IN the reduce functions above.
        // So this chart shows the distribution of the CURRENT filtered orders (by date & order type).
        
        filteredCompletedOrders.forEach(order => {
            order.items.forEach(item => {
                const category = item.category || 'ไม่มีหมวดหมู่';
                const itemTotal = item.finalPrice * item.quantity;
                salesByCategory[category] = (salesByCategory[category] || 0) + itemTotal;
            });
        });

        const sortedCategories = Object.entries(salesByCategory).sort(([, a], [, b]) => b - a);

        return {
            labels: sortedCategories.map(([label]) => label),
            data: sortedCategories.map(([, data]) => data),
            colors: ['#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6', '#ef4444', '#6b7280']
        };
    }, [filteredCompletedOrders]);

    const formattedDateDisplay = useMemo(() => {
        if (viewMode === 'monthly') {
            return selectedDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
        }
        return selectedDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    }, [selectedDate, viewMode]);


    return (
        <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto w-full">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">
                    Dashboard <span className="text-lg font-medium text-gray-500">({formattedDateDisplay})</span>
                </h1>
                
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
                            {viewMode === 'monthly' ? 'เลือกเดือน:' : 'เลือกวันที่:'}
                        </label>
                        <div className="relative">
                            <input 
                                ref={dateInputRef}
                                type={viewMode === 'monthly' ? 'month' : 'date'}
                                value={dateInputValue}
                                onChange={handleDateChange}
                                onClick={() => { try { dateInputRef.current?.showPicker(); } catch(e) {} }}
                                className="border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-800 font-medium text-sm cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="ยอดขายรวม" value={`${dailyStats.totalSales.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })}`} icon={<span>💰</span>} color="border-green-500" />
                <StatCard title="ออเดอร์สำเร็จ" value={dailyStats.completedCount.toLocaleString()} icon={<span>✅</span>} color="border-blue-500" />
                <StatCard title="ลูกค้าทั้งหมด" value={dailyStats.totalCustomers.toLocaleString()} icon={<span>👥</span>} color="border-purple-500" />
                <StatCard title="ยกเลิกออเดอร์" value={dailyStats.cancelledCount.toLocaleString()} icon={<span>❌</span>} color="border-red-500" />
            </div>

            {/* Filter Indicator */}
            {(selectedCategoryFilter || selectedOrderTypeFilter) && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex items-center justify-between animate-fade-in-up">
                    <div className="flex items-center gap-2 flex-wrap">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                        </svg>
                        <span>กำลังแสดงข้อมูล:</span>
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
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md">
                    <SalesChart
                        title={chartData.title}
                        data={chartData.data}
                        labels={chartData.labels}
                        maxValue={chartData.maxValue}
                    />
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
                     <PieChart
                        title={orderItemTypeData.title}
                        data={orderItemTypeData.data}
                        labels={orderItemTypeData.labels}
                        colors={orderItemTypeData.colors}
                        onSliceClick={handleOrderTypeClick}
                        selectedLabel={selectedOrderTypeFilter}
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
