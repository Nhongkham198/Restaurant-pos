import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { db } from '../firebaseConfig';
import firebase from 'firebase/compat/app';
import Swal from 'sweetalert2';
import { printerService } from '../services/printerService';
import { OrderItem, Table, ActiveOrder, OrderCounter, PaymentDetails, CompletedOrder, CancelledOrder } from '../types';

export const useOrderLogic = () => {
    const { 
        branchId, 
        currentUser, 
        tables, 
        sendToKitchen, 
        isTaxEnabled, 
        taxRate, 
        printerConfig,
        isCustomerMode,
        activeOrders,
        activeOrdersActions
    } = useData();
    
    const { setModalState, handleModalClose } = useUI();

    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [lastPlacedOrderId, setLastPlacedOrderId] = useState<number | null>(null);

    const placeOrder = async (
        orderItems: OrderItem[], 
        custName: string, 
        custCount: number, 
        tableOverride: Table | null, 
        isLineMan: boolean = false, 
        lineManNumber?: string, 
        deliveryProviderName?: string
    ): Promise<number | undefined> => {
        if (!isLineMan && !tableOverride) { 
            Swal.fire('กรุณาเลือกโต๊ะ', 'ต้องเลือกโต๊ะสำหรับออเดอร์ หรือเลือก Delivery', 'warning'); 
            return; 
        } 

        let finalTable = tableOverride;
        if (!isLineMan && finalTable && finalTable.name === 'กำลังโหลด...') {
            const realTable = tables.find(t => t.id === finalTable!.id);
            if (realTable) {
                finalTable = realTable;
            } else {
                Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูลโต๊ะ', text: 'กรุณาลองใหม่อีกครั้ง หรือติดต่อพนักงาน (รหัสโต๊ะอาจไม่ถูกต้อง)', });
                return;
            }
        }

        if (orderItems.length === 0) return; 
        if (!navigator.onLine) { Swal.fire('เชื่อมต่ออินเทอร์เน็ตไม่ได้', 'ไม่สามารถสั่งอาหารได้ในขณะนี้', 'error'); return; } 
        setIsPlacingOrder(true); 

        try { 
            const MAX_RETRIES = 3; 
            let result: { newOrder: ActiveOrder; shouldSendToKitchen: boolean; isPrintedImmediatelyByThisDevice: boolean } | undefined;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const branchIdStr = branchId;
                    if (!branchIdStr) {
                        throw new Error('ไม่พบข้อมูลสาขา (Branch ID Missing)');
                    }
                    
                    const counterRef = db.doc(`branches/${branchIdStr}/orderCounter/data`);
                    result = await db.runTransaction(async (transaction: firebase.firestore.Transaction) => { 
                        const counterDoc = await transaction.get(counterRef); 
                        const counterData = (counterDoc.data() as { value: OrderCounter | undefined })?.value; 
                        const today = new Date(); 
                        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; 
                        let nextOrderId = 1; 
                        if (counterData && typeof counterData.count === 'number' && typeof counterData.lastResetDate === 'string' && counterData.lastResetDate === todayStr) { 
                            nextOrderId = counterData.count + 1; 
                        } 
                        const itemsWithOrigin = orderItems.map(item => ({ ...item, originalOrderNumber: nextOrderId, })); 
                        const orderTableName = isLineMan ? (deliveryProviderName || 'Delivery') : (finalTable ? finalTable.name : 'Unknown'); 
                        const orderFloor = isLineMan ? 'Delivery' : (finalTable ? finalTable.floor : 'Unknown'); 
                        const orderTableId = isLineMan ? -99 : (finalTable ? finalTable.id : 0); 
                        const shouldSendToKitchen = isCustomerMode || sendToKitchen || isLineMan;
                        const isPrintedImmediatelyByThisDevice = !isCustomerMode && shouldSendToKitchen;
                        
                        const newOrder: ActiveOrder = { 
                            id: Date.now(), 
                            orderNumber: nextOrderId, 
                            manualOrderNumber: lineManNumber || null, 
                            tableId: orderTableId, 
                            tableName: orderTableName, 
                            customerName: custName, 
                            floor: orderFloor, 
                            customerCount: custCount, 
                            items: itemsWithOrigin, 
                            status: shouldSendToKitchen ? 'waiting' : 'served', 
                            orderTime: Date.now(), 
                            orderType: isLineMan ? 'lineman' : 'dine-in', 
                            taxRate: isTaxEnabled ? taxRate : 0, 
                            taxAmount: 0, 
                            placedBy: currentUser ? currentUser.username : (custName || `โต๊ะ ${orderTableName}`),
                            isPrintedToKitchen: isPrintedImmediatelyByThisDevice,
                        }; 
                        const subtotal = newOrder.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0); 
                        newOrder.taxAmount = newOrder.taxRate > 0 ? subtotal * (newOrder.taxRate / 100) : 0; 
                        
                        transaction.set(counterRef, { value: { count: nextOrderId, lastResetDate: todayStr } }); 
                        const newOrderDocRef = db.collection(`branches/${branchIdStr}/activeOrders`).doc(newOrder.id.toString()); 
                        transaction.set(newOrderDocRef, { ...newOrder, lastUpdated: firebase.firestore.FieldValue.serverTimestamp() }); 
                        
                        return { newOrder, shouldSendToKitchen, isPrintedImmediatelyByThisDevice }; 
                    });

                    break;
                } catch (error: any) {
                    if (error.code === 'aborted' && attempt < MAX_RETRIES) {
                        console.warn(`Place order contention detected. Retrying attempt ${attempt + 1}...`);
                        await new Promise(res => setTimeout(res, 100 * attempt)); 
                    } else {
                        throw error;
                    }
                }
            }

            if (!result) {
                 throw new Error('Transaction failed after multiple retries without a specific error.');
            }

            const { newOrder, isPrintedImmediatelyByThisDevice } = result;
            setLastPlacedOrderId(newOrder.orderNumber); 
            
            if (!isCustomerMode) {
                setModalState(prev => ({ ...prev, isOrderSuccess: true })); 
            }
        
            if (isPrintedImmediatelyByThisDevice && printerConfig?.kitchen?.ipAddress) {
                // Fire-and-forget printing to avoid blocking the UI
                printerService.printKitchenOrder(newOrder, printerConfig.kitchen)
                    .catch((printError: any) => {
                        console.error("Kitchen print failed (Direct):", printError);
                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'error',
                            title: 'พิมพ์ใบครัวไม่สำเร็จ',
                            text: 'กรุณาตรวจสอบเครื่องพิมพ์',
                            timer: 5000,
                            showConfirmButton: false
                        });
                    });
            }
            
            return newOrder.orderNumber;

        } catch (error: any) {
            console.error("Failed to place order:", error);
            const errorMessage = (error.message || '').toLowerCase();
            
            if (error.code === 'aborted') {
                Swal.fire('ระบบกำลังยุ่ง', 'การส่งออเดอร์พร้อมกันหลายเครื่อง กรุณาลองอีกครั้งในอีกสักครู่', 'warning');
            }
            else if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
                Swal.fire({
                    icon: 'error',
                    title: 'โควต้าการใช้งานเต็ม',
                    html: `
                        <div class="text-left text-gray-700">
                            <p class="font-bold">โควต้าการบันทึกข้อมูลสำหรับวันนี้เต็มแล้ว</p>
                            <p class="mt-2 text-sm">ออเดอร์นี้จึงไม่ถูกบันทึกเข้าระบบ</p>
                            <hr class="my-3"/>
                            <p class="text-sm"><strong>สาเหตุ:</strong> แอปพลิเคชันนี้ใช้แผนบริการฟรีของ Firebase ซึ่งมีจำกัดการใช้งานรายวัน</p>
                            <p class="text-sm mt-2"><strong>วิธีแก้ไข:</strong></p>
                            <ul class="list-disc list-inside text-sm pl-4 mt-1">
                                <li><strong>ชั่วคราว:</strong> ระบบจะกลับมาใช้งานได้อีกครั้งในวันพรุ่งนี้ (โควต้าจะรีเซ็ตทุกวัน)</li>
                                <li><strong>ถาวร:</strong> อัปเกรดแผน Firebase เป็น <strong class="text-orange-500">Blaze (Pay-as-you-go)</strong> เพื่อใช้งานได้ไม่จำกัด</li>
                            </ul>
                        </div>
                    `,
                    confirmButtonText: 'รับทราบ',
                });
            } else {
                Swal.fire('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถสร้างออเดอร์ได้', 'error');
            }
            throw error;
        } finally { 
            setIsPlacingOrder(false); 
        } 
    };

    const handleUpdateOrderFromModal = async (orderId: number, items: OrderItem[], customerCount: number) => { 
        if (!navigator.onLine) return; 
        if (items.length === 0) { 
            const orderToCancel = activeOrders.find(o => o.id === orderId); 
            if (orderToCancel) { 
                const reason = 'อื่นๆ';
                const notes = 'ยกเลิกอัตโนมัติ (รายการอาหารถูกลบหมด)';
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
                
                Swal.fire({ icon: 'info', title: 'ยกเลิกบิลอัตโนมัติ', text: 'บิลถูกยกเลิกเนื่องจากไม่มีรายการอาหารเหลืออยู่', timer: 2000, showConfirmButton: false }); 
            } 
            handleModalClose(); 
        } else { 
            await activeOrdersActions.update(orderId, { items, customerCount }); 
            handleModalClose(); 
        } 
    };

    const handleStartCooking = (orderId: number) => { 
        if (!navigator.onLine) return; 
        activeOrdersActions.update(orderId, { status: 'cooking', cookingStartTime: Date.now() }); 
    };

    const handleCompleteOrder = async (orderId: number) => { 
        if (!navigator.onLine) return; 
        const order = activeOrders.find(o => o.id === orderId); 
        if (!order) return; 
        
        if (order.orderType === 'lineman') { 
            try { 
                const paymentDetails: PaymentDetails = { method: 'transfer' }; 
                const completed: CompletedOrder = { ...order, status: 'completed', completionTime: Date.now(), paymentDetails: paymentDetails, completedBy: currentUser?.username || 'Auto-Kitchen' }; 
                await activeOrdersActions.update(orderId, { status: 'completed', completionTime: completed.completionTime, paymentDetails: paymentDetails }); 
                await db.collection(`branches/${branchId}/completedOrders_v2`).doc(orderId.toString()).set(completed); 
                
                Swal.fire({ 
                    icon: 'success', 
                    title: `${order.tableName} Completed`, 
                    text: `ออเดอร์ #${order.orderNumber} จบงานและบันทึกยอดขายแล้ว`, 
                    timer: 1500, 
                    showConfirmButton: false 
                }); 
            } catch (error) { 
                console.error("Auto-complete failed", error); 
                Swal.fire('Error', 'Failed to auto-complete LineMan order', 'error'); 
            } 
        } else { 
            activeOrdersActions.update(orderId, { status: 'served' }); 
        } 
    };

    const handlePrintKitchenOrder = async (orderId: number) => { 
        const order = activeOrders.find(o => o.id === orderId); 
        if (!order) return; 
        if (!printerConfig?.kitchen) { 
            Swal.fire('ไม่พบเครื่องพิมพ์', 'กรุณาตั้งค่าเครื่องพิมพ์ครัวก่อน', 'warning'); 
            return; 
        } 
        try { 
            Swal.fire({ 
                title: 'กำลังส่งพิมพ์...', 
                text: 'กรุณารอสักครู่', 
                timer: 1000, 
                showConfirmButton: false, 
                didOpen: () => { Swal.showLoading(); } 
            }); 
            await printerService.printKitchenOrder(order, printerConfig.kitchen); 
        } catch (error: any) { 
            console.error("Reprint failed:", error); 
            Swal.fire('พิมพ์ไม่สำเร็จ', error.message || 'ไม่สามารถเชื่อมต่อเครื่องพิมพ์ได้', 'error'); 
        } 
    };

    return {
        placeOrder,
        isPlacingOrder,
        lastPlacedOrderId,
        handleUpdateOrderFromModal,
        handleStartCooking,
        handleCompleteOrder,
        handlePrintKitchenOrder
    };
};
