
import React, { useMemo, useState } from 'react';
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

    // Filter orders based on the selected local date/month AND role visibility
    const filteredCompletedOrders = useMemo(() => {
        let orders = completedOrders;
        
        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.completionTime);
            
            if (viewMode === 'monthly') {
                return orderDate.getMonth() === selectedDate.getMonth() &&
                       orderDate.getFullYear() === selectedDate.getFullYear();
            }

            return orderDate.getDate() === selectedDate.getDate() &&
                   orderDate.getMonth() === selectedDate.getMonth() &&
                   orderDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [completedOrders, selectedDate, currentUser, viewMode]);

    const filteredCancelledOrders = useMemo(() => {
        let orders = cancelledOrders;

        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.cancellationTime);
            
            if (viewMode === 'monthly') {
                return orderDate.getMonth() === selectedDate.getMonth() &&
                       orderDate.getFullYear() === selectedDate.getFullYear();
            }

            return orderDate.getDate() === selectedDate.getDate() &&
                   orderDate.getMonth() === selectedDate.getMonth() &&
                   orderDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [cancelledOrders, selectedDate, currentUser, viewMode]);

    const dailyStats = useMemo(() => {
        const totalSales = filteredCompletedOrders.reduce((sum, order) => {
            const subtotal = order.items.reduce((itemSum, item) => itemSum + item.finalPrice * item.quantity, 0);
            return sum + subtotal + order.taxAmount;
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
    }, [filteredCompletedOrders, filteredCancelledOrders]);

    const chartData = useMemo(() => {
        if (viewMode === 'monthly') {
            // --- Monthly View: Sales per Day ---
            const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
            const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
            const salesByDay = new Array(days.length).fill(0);

            filteredCompletedOrders.forEach(order => {
                const day = new Date(order.completionTime).getDate();
                if (day >= 1 && day <= daysInMonth) {
                    const orderTotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0) + order.taxAmount;
                    salesByDay[day - 1] += orderTotal;
                }
            });

            return {
                title: 'ยอดขายรายวัน (ตลอดเดือน)',
                labels: days.map(d => `${d}`),
                data: salesByDay,
                maxValue: Math.max(...salesByDay, 1000)
            };

        } else {
            // --- Daily View: Sales per Hour ---
            const openHour = parseInt(String(openingTime).split(':')[0], 10);
            const closeHour = parseInt(String(closingTime).split(':')[0], 10);
            // Handle cross-midnight or invalid times gracefully
            const startH = isNaN(openHour) ? 0 : openHour;
            const endH = isNaN(closeHour) ? 23 : closeHour;
            
            const hoursLength = endH >= startH ? endH - startH + 1 : (24 - startH) + endH + 1;
            const hours = Array.from({ length: hoursLength }, (_, i) => (startH + i) % 24);
            
            const salesByHour = new Array(hours.length).fill(0);
            
            filteredCompletedOrders.forEach(order => {
                const orderHour = new Date(order.completionTime).getHours();
                const hourIndex = hours.indexOf(orderHour);
                if (hourIndex > -1) {
                    const orderTotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0) + order.taxAmount;
                    salesByHour[hourIndex] += orderTotal;
                }
            });

            return {
                title: 'ยอดขายรายชั่วโมง',
                labels: hours.map(h => `${h}:00`),
                data: salesByHour,
                maxValue: Math.max(...salesByHour, 1000)
            };
        }
    }, [filteredCompletedOrders, openingTime, closingTime, viewMode, selectedDate]);

    const orderItemTypeData = useMemo(() => {
        let dineInItems = 0;
        let takeawayItems = 0;
        filteredCompletedOrders.forEach(order => {
            order.items.forEach(item => {
                if (item.isTakeaway) {
                    takeawayItems += item.quantity;
                } else {
                    dineInItems += item.quantity;
                }
            });
        });

        return {
            labels: ['ทานที่ร้าน', 'กลับบ้าน'],
            data: [dineInItems, takeawayItems],
            colors: ['#3b82f6', '#8b5cf6']
        };
    }, [filteredCompletedOrders]);

    const categorySalesData = useMemo(() => {
        const salesByCategory: Record<string, number> = {};
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
                        <input 
                            type={viewMode === 'monthly' ? 'month' : 'date'}
                            value={dateInputValue}
                            onChange={handleDateChange}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-800 font-medium text-sm"
                        />
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="ยอดขายรวม" value={`${dailyStats.totalSales.toLocaleString('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })}`} icon={<span>💰</span>} color="border-green-500" />
                <StatCard title="ออเดอร์สำเร็จ" value={dailyStats.completedCount.toLocaleString()} icon={<span>✅</span>} color="border-blue-500" />
                <StatCard title="ลูกค้าทั้งหมด" value={dailyStats.totalCustomers.toLocaleString()} icon={<span>👥</span>} color="border-purple-500" />
                <StatCard title="ยกเลิกออเดอร์" value={dailyStats.cancelledCount.toLocaleString()} icon={<span>❌</span>} color="border-red-500" />
            </div>

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
                    />
                     <PieChart
                        title="ประเภทรายการ (ทานที่ร้าน / กลับบ้าน)"
                        data={orderItemTypeData.data}
                        labels={orderItemTypeData.labels}
                        colors={orderItemTypeData.colors}
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
