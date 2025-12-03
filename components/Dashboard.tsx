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

    // Helper to format date as YYYY-MM-DD for input value (using local time)
    const dateInputValue = useMemo(() => {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, [selectedDate]);

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) {
            const [year, month, day] = e.target.value.split('-').map(Number);
            // Create date at local midnight
            setSelectedDate(new Date(year, month - 1, day));
        }
    };

    // Filter orders based on the selected local date AND role visibility
    const filteredCompletedOrders = useMemo(() => {
        let orders = completedOrders;
        
        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.completionTime);
            return orderDate.getDate() === selectedDate.getDate() &&
                   orderDate.getMonth() === selectedDate.getMonth() &&
                   orderDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [completedOrders, selectedDate, currentUser]);

    const filteredCancelledOrders = useMemo(() => {
        let orders = cancelledOrders;

        // Soft delete logic: hide deleted items for non-admins
        if (currentUser?.role !== 'admin') {
            orders = orders.filter(o => !o.isDeleted);
        }

        return orders.filter(order => {
            const orderDate = new Date(order.cancellationTime);
            return orderDate.getDate() === selectedDate.getDate() &&
                   orderDate.getMonth() === selectedDate.getMonth() &&
                   orderDate.getFullYear() === selectedDate.getFullYear();
        });
    }, [cancelledOrders, selectedDate, currentUser]);

    const dailyStats = useMemo(() => {
        const totalSales = filteredCompletedOrders.reduce((sum, order) => {
            const subtotal = order.items.reduce((itemSum, item) => itemSum + item.price * item.quantity, 0);
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

    const hourlySalesData = useMemo(() => {
        const openHour = parseInt(String(openingTime).split(':')[0], 10);
        const closeHour = parseInt(String(closingTime).split(':')[0], 10);
        const hours = Array.from({ length: closeHour - openHour + 1 }, (_, i) => openHour + i);
        
        const salesByHour = new Array(hours.length).fill(0);
        
        filteredCompletedOrders.forEach(order => {
            const orderHour = new Date(order.completionTime).getHours();
            const hourIndex = hours.indexOf(orderHour);
            if (hourIndex > -1) {
                const orderTotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + order.taxAmount;
                salesByHour[hourIndex] += orderTotal;
            }
        });

        return {
            labels: hours.map(h => `${h}:00`),
            data: salesByHour,
            maxValue: Math.max(...salesByHour, 1000) // Ensure a minimum height for the chart
        };
    }, [filteredCompletedOrders, openingTime, closingTime]);

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


    return (
        <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto w-full">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">
                    Dashboard <span className="text-lg font-medium text-gray-500">({selectedDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })})</span>
                </h1>
                <div className="flex items-center gap-2">
                    <label className="text-gray-600 font-medium">เลือกวันที่:</label>
                    <input 
                        type="date" 
                        value={dateInputValue}
                        onChange={handleDateChange}
                        className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm text-gray-700 font-medium"
                    />
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
                        title="ยอดขายรายชั่วโมง"
                        data={hourlySalesData.data}
                        labels={hourlySalesData.labels}
                        maxValue={hourlySalesData.maxValue}
                    />
                </div>
                <div>
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