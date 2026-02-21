import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { db } from '../firebaseConfig';
import firebase from 'firebase/compat/app';
import Swal from 'sweetalert2';
import { printerService } from '../services/printerService';
import { ActiveOrder, CompletedOrder, PaymentDetails, OrderItem, CancelledOrder, CancellationReason } from '../types';

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
    
    const { setModalState, setOrderForModal, orderForModal, closeAllModals } = useUI();

    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

    const handleShowBill = (orderId: number) => { 
        const order = activeOrders.find(o => o.id === orderId); 
        if (order) { 
            setOrderForModal(order); 
            setModalState(prev => ({ ...prev, isTableBill: true })); 
        } 
    };

    const handleConfirmPayment = async (orderId: number, paymentDetails: PaymentDetails) => { 
        if (!navigator.onLine) { 
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
            const completed: CompletedOrder = { 
                ...orderToComplete, 
                status: 'completed', 
                completionTime: Date.now(), 
                paymentDetails: paymentDetails, 
                completedBy: currentUser?.username || 'Unknown' 
            }; 
            await activeOrdersActions.update(orderId, { status: 'completed', completionTime: completed.completionTime, paymentDetails: paymentDetails }); 
            await db.collection(`branches/${branchId}/completedOrders_v2`).doc(orderId.toString()).set(completed); 
        } catch (error) { 
            console.error("Payment failed", error); 
            Swal.fire('Error', 'Payment processing failed', 'error'); 
        } finally { 
            setIsConfirmingPayment(false); 
            setModalState(prev => ({ ...prev, isPayment: false, isPaymentSuccess: true })); 
            setOrderForModal(orderToComplete); 
        } 
    };

    const handlePaymentSuccessClose = async (shouldPrint: boolean) => { 
        const order = orderForModal as CompletedOrder; 
        closeAllModals();
        setOrderForModal(null);
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
        const originalOrder = orderForModal as ActiveOrder; 
        const newSplitCount = (originalOrder.splitCount || 0) + 1; 
        const splitOrderId = Date.now(); 
        try { 
            const updatedOriginalItems: OrderItem[] = []; 
            const itemsToRemoveMap = new Map<string, number>(); 
            itemsToSplit.forEach(item => { 
                itemsToRemoveMap.set(item.cartItemId, (itemsToRemoveMap.get(item.cartItemId) || 0) + item.quantity); 
            }); 
            originalOrder.items.forEach(origItem => { 
                const qtyToRemove = itemsToRemoveMap.get(origItem.cartItemId); 
                if (qtyToRemove && qtyToRemove > 0) { 
                    const remainingQty = origItem.quantity - qtyToRemove; 
                    if (remainingQty > 0) { 
                        updatedOriginalItems.push({ ...origItem, quantity: remainingQty }); 
                        itemsToRemoveMap.set(origItem.cartItemId, 0); 
                    } else { 
                        itemsToRemoveMap.set(origItem.cartItemId, 0); 
                    } 
                } else { 
                    updatedOriginalItems.push(origItem); 
                } 
            }); 
            const newTotalPrice = updatedOriginalItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const newTotalQuantity = updatedOriginalItems.reduce((sum, item) => sum + item.quantity, 0);
            const newSplitOrder: ActiveOrder = { 
                ...originalOrder, 
                id: splitOrderId, 
                items: itemsToSplit, 
                parentOrderId: originalOrder.orderNumber, 
                isSplitChild: true, 
                splitIndex: newSplitCount, 
                mergedOrderNumbers: [], 
                status: originalOrder.status 
            }; 
            const batch = db.batch(); 
            const originalRef = db.collection(`branches/${branchId}/activeOrders`).doc(originalOrder.id.toString()); 
            const newRef = db.collection(`branches/${branchId}/activeOrders`).doc(splitOrderId.toString()); 
            batch.update(originalRef, { items: updatedOriginalItems, splitCount: newSplitCount, totalPrice: newTotalPrice, totalQuantity: newTotalQuantity, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() }); 
            batch.set(newRef, { ...newSplitOrder, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() }); 
            await batch.commit(); 
            closeAllModals();
            setOrderForModal(null);
        } catch (error) { 
            console.error("Split failed", error); 
            Swal.fire('Error', 'Failed to split bill', 'error'); 
        } 
    };

    const handleConfirmMerge = async (sourceOrderIds: number[], targetOrderId: number) => { 
        if (!navigator.onLine) return; 
        const sourceOrders = activeOrders.filter(o => sourceOrderIds.includes(o.id)); 
        const targetOrder = activeOrders.find(o => o.id === targetOrderId); 
        if (!targetOrder || sourceOrders.length === 0) return; 
        const allItemsToMerge = sourceOrders.flatMap(o => o.items.map(item => ({ ...item, originalOrderNumber: item.originalOrderNumber ?? o.orderNumber, cartItemId: `${item.cartItemId}_m_${o.orderNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` }))); 
        const sourceNumbers = sourceOrders.map(o => o.orderNumber); 
        const newItems = [...targetOrder.items, ...allItemsToMerge]; 
        const newMergedNumbers = Array.from(new Set([...(targetOrder.mergedOrderNumbers || []), ...sourceNumbers])).sort((a, b) => a - b); 
        const batch = db.batch(); 
        const targetRef = db.collection(`branches/${branchId}/activeOrders`).doc(targetOrderId.toString()); 
        batch.update(targetRef, { items: newItems, mergedOrderNumbers: newMergedNumbers, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() }); 
        for (const sourceId of sourceOrderIds) { 
            const sourceRef = db.collection(`branches/${branchId}/activeOrders`).doc(sourceId.toString()); 
            const cancellationData = {
                status: 'cancelled' as const,
                cancellationReason: 'อื่นๆ' as CancellationReason,
                cancellationNotes: `Merged into Order #${targetOrder.orderNumber}`,
                cancellationTime: firebase.firestore.FieldValue.serverTimestamp(),
                cancelledBy: currentUser?.username || 'System',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.update(sourceRef, cancellationData); 
        } 
        try { 
            await batch.commit(); 
            closeAllModals();
            setOrderForModal(null);
        } catch (error) { 
            console.error("Merge failed", error); 
            Swal.fire('Error', 'Failed to merge bills. Please try again.', 'error'); 
        } 
    };

    const handleMergeAndPay = async (sourceOrderIds: number[], targetOrderId: number) => { 
        if (!navigator.onLine) return; 
        const sourceOrders = activeOrders.filter(o => sourceOrderIds.includes(o.id)); 
        const targetOrder = activeOrders.find(o => o.id === targetOrderId); 
        if (!targetOrder || sourceOrders.length === 0) return; 
        const allItemsToMerge = sourceOrders.flatMap(o => o.items.map(item => ({ ...item, originalOrderNumber: item.originalOrderNumber ?? o.orderNumber, cartItemId: `${item.cartItemId}_m_${o.orderNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` }))); 
        const sourceNumbers = sourceOrders.map(o => o.orderNumber); 
        const newItems = [...targetOrder.items, ...allItemsToMerge]; 
        const newMergedNumbers = Array.from(new Set([...(targetOrder.mergedOrderNumbers || []), ...sourceNumbers])).sort((a, b) => a - b); 
        const batch = db.batch(); 
        const targetRef = db.collection(`branches/${branchId}/activeOrders`).doc(targetOrderId.toString()); 
        batch.update(targetRef, { items: newItems, mergedOrderNumbers: newMergedNumbers, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() }); 
        for (const sourceId of sourceOrderIds) { 
            const sourceRef = db.collection(`branches/${branchId}/activeOrders`).doc(sourceId.toString()); 
            const cancellationData = {
                status: 'cancelled' as const,
                cancellationReason: 'อื่นๆ' as CancellationReason,
                cancellationNotes: `Merged into Order #${targetOrder.orderNumber}`,
                cancellationTime: firebase.firestore.FieldValue.serverTimestamp(),
                cancelledBy: currentUser?.username || 'System',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.update(sourceRef, cancellationData); 
        } 
        try { 
            await batch.commit(); 
            const updatedTargetOrder: ActiveOrder = { ...targetOrder, items: newItems, mergedOrderNumbers: newMergedNumbers }; 
            setOrderForModal(updatedTargetOrder); 
            setModalState(prev => ({ ...prev, isPayment: true, isTableBill: false })); 
        } catch (error) { 
            console.error("Merge and Pay failed", error); 
            Swal.fire('Error', 'Failed to merge bills. Please try again.', 'error'); 
        } 
    };

    const handleConfirmCancelOrder = async (orderToCancel: ActiveOrder, reason: CancellationReason, notes?: string) => { 
        if (!navigator.onLine) return; 
        const cancelledOrder: CancelledOrder = { 
            ...orderToCancel, 
            status: 'cancelled', 
            cancellationTime: Date.now(), 
            cancelledBy: currentUser!.username, 
            cancellationReason: reason, 
            cancellationNotes: notes, 
        }; 
        await activeOrdersActions.update(orderToCancel.id, { status: 'cancelled', cancellationReason: reason, cancellationNotes: notes }); 
        await db.collection(`branches/${branchId}/cancelledOrders_v2`).doc(cancelledOrder.id.toString()).set(cancelledOrder); 
        closeAllModals();
        setOrderForModal(null);
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
