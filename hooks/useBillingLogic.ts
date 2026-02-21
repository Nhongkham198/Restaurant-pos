import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { db } from '../firebaseConfig';
import firebase from 'firebase/compat/app';
import Swal from 'sweetalert2';
import { printerService } from '../services/printerService';
import { ActiveOrder, CompletedOrder, PaymentDetails, OrderItem, CancelledOrder, CancellationReason } from '../types';
import { orderService } from '../services/orderService';

export const useBillingLogic = () => {
    const { 
        branchId, 
        currentUser, 
        activeOrders, 
        activeOrdersActions, 
        printerConfig, 
        restaurantName, 
        logoUrl, 
        qrCodeUrl,
        tables
    } = useData();
    
    const { setModalState, setOrderForModal, orderForModal, handleModalClose } = useUI();

    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

    const handleShowBill = (orderId: number) => { 
        const order = activeOrders.find(o => o.id === orderId); 
        if (order) { 
            setOrderForModal(order); 
            setModalState(prev => ({ ...prev, isTableBill: true })); 
        } 
    };

    const handleConfirmPayment = async (orderId: number, paymentDetails: PaymentDetails) => {
        if (!navigator.onLine || !currentUser) {
            Swal.fire('Offline', 'ไม่สามารถชำระเงินได้ขณะ Offline', 'warning');
            return;
        }
        setIsConfirmingPayment(true);
        const orderToComplete = activeOrders.find(o => o.id === orderId);
        if (!orderToComplete) {
            setIsConfirmingPayment(false);
            return;
        }

        try {
            const completedOrder = await orderService.completeOrder(branchId, orderToComplete, paymentDetails, currentUser);
            // The real-time listener will automatically remove the order from the active list.
            // No need for activeOrdersActions.update here.
            setOrderForModal(completedOrder);
            setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true }));
        } catch (error: any) {
            console.error("Payment failed", error);
            Swal.fire('Error', error.message || 'Payment processing failed', 'error');
        } finally {
            setIsConfirmingPayment(false);
        }
    };

    const handlePaymentSuccessClose = async (shouldPrint: boolean) => { 
        const order = orderForModal as CompletedOrder; 
        handleModalClose(); 
        if (shouldPrint && order && printerConfig?.cashier) { 
            try { 
                await printerService.printReceipt(order, printerConfig.cashier, restaurantName, logoUrl, qrCodeUrl); 
            } catch (printError: any) { 
                console.error("Receipt print failed:", printError); 
                Swal.fire('พิมพ์ไม่สำเร็จ', 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ใบเสร็จได้', 'error'); 
            } 
        } 
    };

    const handleReprintReceipt = async (order: CompletedOrder) => { 
        if (!printerConfig?.cashier) { 
            Swal.fire({ 
                icon: 'warning', 
                title: 'ไม่พบการตั้งค่าเครื่องพิมพ์', 
                text: 'กรุณาตั้งค่าเครื่องพิมพ์ใบเสร็จก่อนใช้งาน', 
                confirmButtonText: 'ไปที่ตั้งค่า' 
            }).then((result) => { 
                if (result.isConfirmed) { 
                    setModalState(prev => ({ ...prev, isSettings: true })); 
                } 
            }); 
            return; 
        } 
        try { 
            Swal.fire({ 
                title: 'กำลังส่งคำสั่งพิมพ์...', 
                allowOutsideClick: false, 
                didOpen: () => { Swal.showLoading(); } 
            }); 
            await printerService.printReceipt(order, printerConfig.cashier, restaurantName, logoUrl, qrCodeUrl); 
            Swal.close(); 
            Swal.fire({ icon: 'success', title: 'ส่งคำสั่งพิมพ์แล้ว', timer: 1500, showConfirmButton: false }); 
        } catch (error: any) { 
            console.error("Reprint failed:", error); 
            Swal.close(); 
            Swal.fire('พิมพ์ไม่สำเร็จ', error.message || 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ได้', 'error'); 
        } 
    };

    const handleConfirmSplit = async (itemsToSplit: OrderItem[]) => {
        if (!orderForModal || !navigator.onLine) return;
        try {
            await orderService.splitOrder(branchId, orderForModal as ActiveOrder, itemsToSplit);
            handleModalClose();
        } catch (error: any) {
            console.error("Split failed", error);
            Swal.fire('Error', error.message || 'Failed to split bill', 'error');
        }
    };

    const handleConfirmMerge = async (sourceOrderIds: number[], targetOrderId: number) => {
        try {
            const sourceOrders = activeOrders.filter(o => sourceOrderIds.includes(o.id));
            const targetOrder = activeOrders.find(o => o.id === targetOrderId);
            if (!targetOrder) throw new Error('Target order not found');
            await orderService.mergeOrders(branchId, currentUser, sourceOrders, targetOrder);
            handleModalClose();
        } catch (error: any) {
            console.error("Merge failed", error);
            Swal.fire('Error', error.message || 'Failed to merge bills. Please try again.', 'error');
        }
    };

    const handleMergeAndPay = async (sourceOrderIds: number[], targetOrderId: number) => {
        try {
            const sourceOrders = activeOrders.filter(o => sourceOrderIds.includes(o.id));
            const targetOrder = activeOrders.find(o => o.id === targetOrderId);
            if (!targetOrder) throw new Error('Target order not found');
            const updatedOrder = await orderService.mergeOrders(branchId, currentUser, sourceOrders, targetOrder);
            setOrderForModal(updatedOrder);
            setModalState(prev => ({ ...prev, isPayment: true, isTableBill: false }));
        } catch (error: any) {
            console.error("Merge and Pay failed", error);
            Swal.fire('Error', error.message || 'Failed to merge bills. Please try again.', 'error');
        }
    };

    const handleConfirmCancelOrder = async (orderToCancel: ActiveOrder, reason: CancellationReason, notes?: string) => {
        if (!navigator.onLine || !currentUser) return;
        try {
            await orderService.cancelOrder(branchId, orderToCancel, currentUser, reason, notes);
            // Note: activeOrdersActions.update is removed because the batch in service now handles the active order update.
            handleModalClose();
        } catch (error: any) {
            console.error("Cancel order failed", error);
            Swal.fire('Error', error.message || 'Failed to cancel order', 'error');
        }
    };

    return {
        isConfirmingPayment,
        handleShowBill,
        handleConfirmPayment,
        handlePaymentSuccessClose,
        handleReprintReceipt,
        handleConfirmSplit,
        handleConfirmMerge,
        handleMergeAndPay,
        handleConfirmCancelOrder
    };
};
