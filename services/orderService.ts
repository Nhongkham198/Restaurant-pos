import { db } from '../firebaseConfig';
import firebase from 'firebase/compat/app';
import { ActiveOrder, CompletedOrder, PaymentDetails, OrderItem, CancelledOrder, CancellationReason, User } from '../types';

import { offlineService } from './offlineService';

export const orderService = {
    async mergeOrders(
        branchId: string,
        currentUser: User | null,
        sourceOrders: ActiveOrder[],
        targetOrder: ActiveOrder
    ): Promise<ActiveOrder> {
        try {
            let updatedTargetOrder: ActiveOrder | null = null;

            await db.runTransaction(async (transaction) => {
                if (!targetOrder || sourceOrders.length === 0) {
                    throw new Error("Target or source orders not found for merging.");
                }

                const targetRef = db.collection(`branches/${branchId}/activeOrders`).doc(targetOrder.id.toString());
                const targetDoc = await transaction.get(targetRef);
                if (!targetDoc.exists) {
                    throw new Error("Target order does not exist!");
                }
                const currentTargetOrder = targetDoc.data() as ActiveOrder;

                // Verify source orders still exist and are active before merging
                for (const source of sourceOrders) {
                    const sourceRef = db.collection(`branches/${branchId}/activeOrders`).doc(source.id.toString());
                    const sourceDoc = await transaction.get(sourceRef);
                    if (!sourceDoc.exists || (sourceDoc.data() as ActiveOrder).status !== 'active') {
                        throw new Error(`Source order #${source.orderNumber} is no longer available for merging.`);
                    }
                }

                const allItemsToMerge = sourceOrders.flatMap(o => o.items.map(item => ({ ...item, originalOrderNumber: item.originalOrderNumber ?? o.orderNumber, cartItemId: `${item.cartItemId}_m_${o.orderNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` })));
                const sourceNumbers = sourceOrders.map(o => o.orderNumber);
                const newItems = [...currentTargetOrder.items, ...allItemsToMerge];
                const newMergedNumbers = Array.from(new Set([...(currentTargetOrder.mergedOrderNumbers || []), ...sourceNumbers])).sort((a, b) => a - b);

                transaction.update(targetRef, { items: newItems, mergedOrderNumbers: newMergedNumbers, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() });

                for (const source of sourceOrders) {
                    const sourceRef = db.collection(`branches/${branchId}/activeOrders`).doc(source.id.toString());
                    const cancellationData = {
                        status: 'cancelled' as const,
                        cancellationReason: 'อื่นๆ' as CancellationReason,
                        cancellationNotes: `Merged into Order #${currentTargetOrder.orderNumber}`,
                        cancellationTime: firebase.firestore.FieldValue.serverTimestamp(),
                        cancelledBy: currentUser?.username || 'System',
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    transaction.update(sourceRef, cancellationData);
                }
                
                updatedTargetOrder = { ...currentTargetOrder, items: newItems, mergedOrderNumbers: newMergedNumbers };
            });

            if (!updatedTargetOrder) {
                throw new Error("Transaction failed to produce an updated order.");
            }
            return updatedTargetOrder;

        } catch (error: any) {
            if (!navigator.onLine) {
                console.log('Offline: Queuing mergeOrders action.');
                await offlineService.addAction('mergeOrders', { branchId, currentUser, sourceOrders, targetOrder });
                // Optimistic update
                const allItemsToMerge = sourceOrders.flatMap(o => o.items.map(item => ({ ...item, originalOrderNumber: item.originalOrderNumber ?? o.orderNumber, cartItemId: `${item.cartItemId}_m_${o.orderNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` })));
                const sourceNumbers = sourceOrders.map(o => o.orderNumber);
                const newItems = [...targetOrder.items, ...allItemsToMerge];
                const newMergedNumbers = Array.from(new Set([...(targetOrder.mergedOrderNumbers || []), ...sourceNumbers])).sort((a, b) => a - b);
                return { ...targetOrder, items: newItems, mergedOrderNumbers: newMergedNumbers };
            } else {
                console.error("Transaction failed: ", error);
                throw new Error(error.message || 'Failed to merge orders due to a transaction error.');
            }
        }
    },

    async splitOrder(
        branchId: string,
        originalOrder: ActiveOrder,
        itemsToSplit: OrderItem[]
    ): Promise<void> {
        try {
            await db.runTransaction(async (transaction) => {
                const originalRef = db.collection(`branches/${branchId}/activeOrders`).doc(originalOrder.id.toString());
                const doc = await transaction.get(originalRef);

                if (!doc.exists) {
                    throw new Error("Original order does not exist!");
                }

                const currentOrder = doc.data() as ActiveOrder;
                const newSplitCount = (currentOrder.splitCount || 0) + 1;
                const splitOrderId = Date.now();

                const itemsToRemoveMap = new Map<string, number>();
                itemsToSplit.forEach(item => {
                    itemsToRemoveMap.set(item.cartItemId, (itemsToRemoveMap.get(item.cartItemId) || 0) + item.quantity);
                });

                const updatedOriginalItems: OrderItem[] = [];
                currentOrder.items.forEach(origItem => {
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
                    ...currentOrder,
                    id: splitOrderId,
                    items: itemsToSplit,
                    parentOrderId: currentOrder.orderNumber,
                    isSplitChild: true,
                    splitIndex: newSplitCount,
                    mergedOrderNumbers: [],
                    status: currentOrder.status,
                    totalPrice: itemsToSplit.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                    totalQuantity: itemsToSplit.reduce((sum, item) => sum + item.quantity, 0),
                };

                const newRef = db.collection(`branches/${branchId}/activeOrders`).doc(splitOrderId.toString());

                transaction.update(originalRef, { items: updatedOriginalItems, splitCount: newSplitCount, totalPrice: newTotalPrice, totalQuantity: newTotalQuantity, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() });
                transaction.set(newRef, { ...newSplitOrder, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() });
            });
        } catch (error: any) {
            if (!navigator.onLine) {
                console.log('Offline: Queuing splitOrder action.');
                await offlineService.addAction('splitOrder', { branchId, originalOrder, itemsToSplit });
            } else {
                console.error("Transaction failed: ", error);
                throw new Error('Failed to split order due to a transaction error.');
            }
        }
    },

    async cancelOrder(
        branchId: string,
        orderToCancel: ActiveOrder,
        currentUser: User,
        reason: CancellationReason,
        notes?: string
    ): Promise<void> {
        try {
            const cancelledOrder: CancelledOrder = {
                ...orderToCancel,
                status: 'cancelled',
                cancellationTime: Date.now(),
                cancelledBy: currentUser.username,
                cancellationReason: reason,
                cancellationNotes: notes,
            };

            const batch = db.batch();
            const activeRef = db.collection(`branches/${branchId}/activeOrders`).doc(orderToCancel.id.toString());
            const cancelledRef = db.collection(`branches/${branchId}/cancelledOrders_v2`).doc(orderToCancel.id.toString());

            batch.update(activeRef, { 
                status: 'cancelled', 
                cancellationReason: reason, 
                cancellationNotes: notes, 
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                cancelledBy: currentUser.username,
                cancellationTime: firebase.firestore.FieldValue.serverTimestamp(),
            });
            batch.set(cancelledRef, cancelledOrder);

            await batch.commit();
        } catch (error: any) {
            if (!navigator.onLine) {
                console.log('Offline: Queuing cancelOrder action.');
                await offlineService.addAction('cancelOrder', { branchId, orderToCancel, currentUser, reason, notes });
            } else {
                throw error;
            }
        }
    },

    async completeOrder(
        branchId: string,
        orderToComplete: ActiveOrder,
        paymentDetails: PaymentDetails,
        currentUser: User
    ): Promise<CompletedOrder> {
        try {
            const completedOrder: CompletedOrder = {
                ...orderToComplete,
                status: 'completed',
                completionTime: Date.now(),
                paymentDetails: paymentDetails,
                completedBy: currentUser.username || 'Unknown'
            };

            const batch = db.batch();
            const activeRef = db.collection(`branches/${branchId}/activeOrders`).doc(orderToComplete.id.toString());
            const completedRef = db.collection(`branches/${branchId}/completedOrders_v2`).doc(orderToComplete.id.toString());

            batch.update(activeRef, { 
                status: 'completed', 
                completionTime: completedOrder.completionTime, 
                paymentDetails: paymentDetails,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            batch.set(completedRef, completedOrder);

            await batch.commit();
            return completedOrder;
        } catch (error: any) {
            if (!navigator.onLine) {
                console.log('Offline: Queuing completeOrder action.');
                await offlineService.addAction('completeOrder', { 
                    branchId, 
                    orderToComplete, // Pass the full object
                    paymentDetails, 
                    currentUser // Pass the full object
                });
                // Return a mock completed order so the UI can update optimistically
                const optimisticOrder: CompletedOrder = {
                    ...orderToComplete,
                    status: 'completed',
                    completionTime: Date.now(),
                    paymentDetails: paymentDetails,
                    completedBy: currentUser.username || 'Unknown'
                };
                return optimisticOrder;
            } else {
                // Re-throw other errors
                throw error;
            }
        }
    }
};

