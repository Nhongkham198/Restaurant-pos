
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { CompletedOrder, Recipe, DeliveryProvider, OrderItem, MenuItem } from '../types';
import Swal from 'sweetalert2';
import { useData } from '../contexts/DataContext';
import { MenuSearchModal } from './MenuSearchModal';
import { ItemCustomizationModal } from './ItemCustomizationModal';
import { calculateBagsForOrder } from '../utils/bagCalculator'; // <-- NEW IMPORT

interface CompletedOrderCardProps {
    order: CompletedOrder;
    onSplitOrder: (order: CompletedOrder) => void;
    isEditMode: boolean;
    onEditOrder: (order: CompletedOrder) => void;
    onInitiateCashBill: (order: CompletedOrder) => void;
    isSelected: boolean;
    onToggleSelection: (orderId: number) => void;
    onReprintReceipt: (order: CompletedOrder) => void; // New Prop
    recipes: Recipe[];
    deliveryProviders: DeliveryProvider[];
    taxRate: number;
    onUpdateOrder?: (orderId: number, updates: Partial<CompletedOrder>) => Promise<void>;
}

export const CompletedOrderCard: React.FC<CompletedOrderCardProps> = ({ 
    order, 
    onSplitOrder, 
    isEditMode, 
    onEditOrder, 
    onInitiateCashBill, 
    isSelected, 
    onToggleSelection,
    onReprintReceipt, // Destructure new prop
    recipes,
    deliveryProviders,
    taxRate,
    onUpdateOrder
}) => {
    const { currentUser, menuItems, stockItems } = useData();
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Calculate Bags Usage
    const bagUsage = useMemo(() => {
        return calculateBagsForOrder(order.items, recipes, stockItems, order.orderType);
    }, [order.items, recipes, stockItems]);

    const getBagName = useMemo(() => (type: '6x14' | '8x16' | '12x20') => {
        const sizeStr = type.replace('x', '*');
        const altSizeStr = type;
        
        const stockItem = stockItems.find(s => {
            const name = s.name.toLowerCase();
            return (name.includes('ถุง') && (name.includes(sizeStr) || name.includes(altSizeStr)));
        });

        if (stockItem) return stockItem.name;

        if (type === '12x20') return 'ถุง L (12*20)';
        if (type === '8x16') return 'ถุง M (8*16)';
        return 'ถุง S (6*14)';
    }, [stockItems]);

    // --- Add Item State ---
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isCustomizationModalOpen, setIsCustomizationModalOpen] = useState(false);
    const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
    
    // --- Image Viewer State ---
    const [isViewingSlip, setIsViewingSlip] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // --- Expiration Logic (48 Hours) ---
    const isSlipExpired = useMemo(() => {
        const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
        return (Date.now() - order.completionTime) > TWO_DAYS_MS;
    }, [order.completionTime]);

    const total = useMemo(() => {
        const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        return subtotal + order.taxAmount;
    }, [order.items, order.taxAmount]);

    const completionDate = useMemo(() => new Date(order.completionTime).toLocaleString('th-TH'), [order.completionTime]);

    // --- Profit Calculation ---
    const profitDetails = useMemo(() => {
        let totalRevenue = 0;
        let totalRawMaterialCost = 0;
        let totalGPCost = 0;
        let totalGPTax = 0;
        let fixedAdCost = 0;
        let adCostTax = 0;

        // Find delivery provider
        const providerName = order.orderType === 'lineman' ? 'LineMan' : (order.tableName || order.customerName || 'Delivery');
        const provider = deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase());

        // Only calculate Ad Cost if isFromAd is true
        if (order.orderType === 'lineman' && order.isFromAd) {
            // Use recorded values if available (snapshot), otherwise fallback to current settings
            if (order.recordedAdCost !== undefined) {
                fixedAdCost = order.recordedAdCost;
                adCostTax = order.recordedAdCostTax || 0;
            } else {
                fixedAdCost = provider?.fixedAdCost || 0;
                adCostTax = fixedAdCost * (taxRate / 100);
            }
        }

        order.items.forEach(item => {
            // Revenue calculation: Use finalPrice (which is the snapshot of the price at order time)
            const itemRevenue = item.finalPrice * item.quantity;
            totalRevenue += itemRevenue;

            // Raw Material Cost
            const recipe = recipes.find(r => r.menuItemId === item.id);
            if (recipe) {
                const ingredientCost = recipe.ingredients.reduce((sum, ing) => sum + (ing.quantity * (ing.unitPrice || 0)), 0);
                const baseCost = ingredientCost + recipe.additionalCost;
                const hiddenCost = baseCost * ((recipe.hiddenCostPercentage || 0) / 100);
                totalRawMaterialCost += (baseCost + hiddenCost) * item.quantity;
            }

            // GP and GP Tax - ALWAYS calculated for delivery
            if (order.orderType === 'lineman') {
                const gpPercent = item.deliveryGPs?.[provider?.id || ''] || 0;
                const gpTaxPercent = item.deliveryTaxes?.[provider?.id || ''] || 0;
                
                // Use the same revenue basis for GP calculation
                const itemGP = itemRevenue * (gpPercent / 100);
                const itemGPTax = itemGP * (gpTaxPercent / 100);
                
                totalGPCost += itemGP;
                totalGPTax += itemGPTax;
            }
        });

        // Add order-level tax if not using delivery prices (if using delivery prices, tax is usually included or handled differently)
        // But the original code added order.taxAmount to totalRevenue.
        // If isFromAd is false, totalRevenue starts as 0 and adds item.finalPrice * qty.
        // We should add order.taxAmount if isFromAd is false.
        if (!order.isFromAd) {
            totalRevenue += order.taxAmount;
        }

        const netProfit = totalRevenue - totalRawMaterialCost - totalGPCost - totalGPTax;
        
        return {
            totalRevenue,
            totalRawMaterialCost,
            totalGPCost,
            totalGPTax,
            fixedAdCost: 0,
            adCostTax: 0,
            netProfit,
            providerName: provider?.name || 'ทั่วไป'
        };
    }, [order, recipes, deliveryProviders, taxRate]);

    const handleToggleAd = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (onUpdateOrder) {
            try {
                const isFromAd = e.target.checked;
                const updates: Partial<CompletedOrder> = { isFromAd };
                
                // Fixed ad cost per order is removed, so we just toggle the flag
                updates.recordedAdCost = 0;
                updates.recordedAdCostTax = 0;

                await onUpdateOrder(order.id, updates);
            } catch (error) {
                console.error('Failed to update ad status:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: 'ไม่สามารถบันทึกสถานะโฆษณาได้',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000
                });
            }
        }
    };
    
    const providerColor = useMemo(() => {
        // 1. Determine provider name
        let providerName = 'Delivery';
        if (order.orderType === 'lineman') {
            if (order.tableName && order.tableName !== 'Delivery' && order.tableName !== 'Unknown') {
                providerName = order.tableName;
            } else if (order.customerName) {
                providerName = order.customerName.split('#')[0].trim();
            } else {
                providerName = 'LineMan';
            }
        } else {
            providerName = order.tableName || order.customerName || 'Dine-in';
        }

        // 2. Try to find in configured providers
        const provider = deliveryProviders.find(p => p.name.toLowerCase() === providerName.toLowerCase());
        if (provider?.color) return provider.color;

        // 3. Fallback to standard brand colors
        const name = providerName.toLowerCase();
        if (name.includes('shopeefood') || name.includes('shopee')) return '#FF5722'; // Shopee Orange
        if (name.includes('lineman')) return '#00B14F'; // LineMan Green
        if (name.includes('grab')) return '#00B14F'; // Grab Green
        if (name.includes('foodpanda')) return '#D70F64'; // FoodPanda Pink
        if (name.includes('robinhood')) return '#802D8C'; // Robinhood Purple
        
        return '#3b82f6'; // Default blue
    }, [order.orderType, order.tableName, order.customerName, deliveryProviders]);

    const cardClasses = useMemo(() => {
        if (order.isDeleted) {
            return "bg-red-50/50 rounded-lg shadow-md border border-red-200 overflow-hidden transition-colors opacity-70";
        }
        let base = "relative bg-white rounded-lg shadow-md border overflow-hidden transition-colors ";
        if (isEditMode && isSelected) {
            base += "border-blue-400 bg-blue-50 ring-2 ring-blue-300";
        } else if (order.isFromAd) {
            base += "border-2";
        } else {
            base += "border-gray-200";
        }
        return base;
    }, [isEditMode, isSelected, order.isDeleted, order.isFromAd]);

    const handleViewSlip = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (isSlipExpired) {
             Swal.fire({
                icon: 'info',
                title: 'รูปภาพถูกลบแล้ว',
                text: 'ระบบได้ลบรูปสลิปนี้อัตโนมัติเนื่องจากเกินระยะเวลา 2 วัน',
                confirmButtonText: 'ตกลง'
            });
            return;
        }

        if (order.paymentDetails.slipImage || order.paymentSlipUrl) {
            setZoomLevel(1); // Reset zoom when opening
            setIsViewingSlip(true);
        } else {
            Swal.fire({
                icon: 'info',
                title: 'ไม่พบรูปภาพ',
                text: 'ไม่พบข้อมูลรูปสลิปในออเดอร์นี้',
                confirmButtonText: 'เข้าใจแล้ว'
            });
        }
    };

    const handleCloseSlip = () => {
        setIsViewingSlip(false);
    };

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.min(prev + 0.5, 3.0)); // Max zoom 3.0x
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.max(prev - 0.5, 1)); // Min zoom 1x
    };

    // Reset scroll position when zoom level changes to 1 (fit screen)
    useEffect(() => {
        if (zoomLevel === 1 && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
            scrollContainerRef.current.scrollLeft = 0;
        }
    }, [zoomLevel]);

    const displayOrderNumber = order.manualOrderNumber ? `#${order.manualOrderNumber}` : `#${String(order.orderNumber).padStart(3, '0')}`;

    const handleAddItem = () => {
        setIsSearchModalOpen(true);
    };

    const handleSelectItem = (item: MenuItem) => {
        if (item.optionGroups && item.optionGroups.length > 0) {
            setSelectedMenuItem(item);
            setIsSearchModalOpen(false);
            setIsCustomizationModalOpen(true);
        } else {
            // Add directly if no options
            addOrderItemToCompletedOrder({
                ...item,
                quantity: 1,
                isTakeaway: order.orderType === 'takeaway',
                cartItemId: `manual-${Date.now()}`,
                finalPrice: item.price,
                selectedOptions: [],
                isManuallyAdded: true
            } as OrderItem);
            setIsSearchModalOpen(false);
        }
    };

    const addOrderItemToCompletedOrder = async (newItem: OrderItem) => {
        if (!onUpdateOrder || !currentUser) return;

        const updatedItems = [...order.items, { ...newItem, isManuallyAdded: true }];
        
        // Recalculate tax
        const subtotal = updatedItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
        const taxAmount = order.taxRate > 0 ? subtotal * (order.taxRate / 100) : 0;

        try {
            await onUpdateOrder(order.id, {
                items: updatedItems,
                taxAmount,
                lastEditedBy: currentUser.username,
                lastEditedTime: Date.now()
            });

            Swal.fire({
                icon: 'success',
                title: 'เพิ่มรายการสำเร็จ',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });
        } catch (error) {
            console.error('Failed to add item:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเพิ่มรายการอาหารได้', 'error');
        }
    };

    return (
        <>
            <div className={cardClasses} style={order.isFromAd ? { borderColor: providerColor } : {}}>
                {order.isFromAd && (
                    <div 
                        className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold text-white rounded-bl-lg z-10 shadow-sm"
                        style={{ backgroundColor: providerColor }}
                    >
                        โฆษณา
                    </div>
                )}
                {order.isPreOrder && (
                    <div 
                        className="absolute top-0 left-0 px-2 py-0.5 text-[10px] font-bold text-white bg-orange-500 rounded-br-lg z-10 shadow-sm"
                    >
                        PRE-ORDER / จอง
                    </div>
                )}
                <header className={`p-4 flex justify-between items-start ${order.isDeleted ? 'bg-red-100/60' : 'bg-gray-50'}`} >
                    <div className="flex items-center gap-4 flex-1 overflow-hidden">
                        {isEditMode && (
                            <div className="p-2 flex-shrink-0">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => onToggleSelection(order.id)}
                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                            </div>
                        )}
                        <div className="flex-1 cursor-pointer overflow-hidden" onClick={() => setIsExpanded(!isExpanded)}>
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <p className={`font-bold text-xl ${order.isDeleted ? 'text-red-700' : 'text-teal-700'}`}>
                                    {displayOrderNumber}
                                </p>
                                <p className={`font-semibold text-lg leading-tight ${order.isDeleted ? 'text-red-800' : 'text-gray-800'}`}>
                                    โต๊ะ {order.tableName} <span className="whitespace-nowrap">({order.floor})</span>
                                </p>
                                {order.isDeleted && <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800 font-semibold">(ลบโดย: {order.deletedBy})</span>}
                            </div>
                            {order.customerName && !order.isDeleted && (
                                <p className="text-base text-blue-700 font-semibold truncate">{order.customerName}</p>
                            )}
                            
                            <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-2">
                                <span>{completionDate}</span>
                                <span className="whitespace-nowrap">
                                    <span className="text-gray-400">|</span> ผู้ส่ง: {order.placedBy}
                                </span>
                                {order.completedBy && (
                                    <span className="whitespace-nowrap">
                                        <span className="text-gray-400">|</span> ผู้รับเงิน: {order.completedBy}
                                    </span>
                                )}
                                {order.lastEditedBy && (
                                    <span className="text-orange-600 font-bold">
                                        <span className="text-gray-400">|</span> แก้ไขล่าสุดโดย: {order.lastEditedBy} ({new Date(order.lastEditedTime || 0).toLocaleString('th-TH')})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 cursor-pointer flex-shrink-0 ml-2" onClick={() => setIsExpanded(!isExpanded)}>
                        <p className={`text-2xl font-bold whitespace-nowrap ${order.isDeleted ? 'text-red-700' : 'text-gray-800'}`}>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                        <div className="flex-shrink-0">
                            <svg className={`w-6 h-6 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </div>
                    </div>
                </header>

                {isExpanded && (
                    <div className={`p-4 border-t ${order.isDeleted ? 'text-gray-500' : ''}`}>
                        <div className="grid grid-cols-2 gap-4 mb-4 text-base">
                            <div className={order.isDeleted ? 'text-gray-500' : 'text-gray-600'}>
                                <p><strong>ลูกค้า:</strong> {order.customerCount} คน</p>
                                <p><strong>ประเภท:</strong> {order.orderType === 'dine-in' ? 'ทานที่ร้าน' : order.orderType === 'takeaway' ? 'กลับบ้าน' : `เดลิเวอรี่ (${profitDetails.providerName})`}</p>
                                {order.parentOrderId && <p><strong>แยกจากบิล:</strong> #{String(order.parentOrderId).padStart(4, '0')}</p>}
                            </div>
                            <div className={order.isDeleted ? 'text-gray-500' : 'text-gray-600'}>
                                <div className="flex items-center gap-2">
                                    <p><strong>ชำระโดย:</strong> {order.paymentDetails.method === 'cash' ? 'เงินสด' : order.paymentDetails.method === 'transfer' ? 'โอนจ่าย' : 'ไม่ระบุ'}</p>
                                    {order.paymentDetails.method === 'transfer' && (
                                        <button 
                                            onClick={handleViewSlip}
                                            disabled={isSlipExpired && !order.paymentDetails.slipImage && !order.paymentSlipUrl}
                                            className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1 transition-colors ${
                                                isSlipExpired 
                                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                    : (order.paymentDetails.slipImage || order.paymentSlipUrl)
                                                        ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm' 
                                                        : 'bg-gray-100 text-gray-500 border-gray-300 cursor-not-allowed'
                                            }`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                            </svg>
                                            {isSlipExpired ? 'ลบอัตโนมัติ' : ((order.paymentDetails.slipImage || order.paymentSlipUrl) ? 'ดูสลิป' : 'ไม่มีรูป')}
                                        </button>
                                    )}
                                </div>
                                {order.paymentDetails.method === 'cash' && (
                                    <>
                                        <p><strong>รับเงินมา:</strong> {order.paymentDetails.cashReceived?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                        <p><strong>เงินทอน:</strong> {order.paymentDetails.changeGiven?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>
                                    </>
                                )}
                                {order.taxAmount > 0 && <p><strong>ภาษี ({order.taxRate}%):</strong> {order.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</p>}
                            </div>
                        </div>

                        {/* Profit Summary Section */}
                        {!order.isDeleted && (
                            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                        สรุปกำไรเบื้องต้น
                                    </h4>
                                    {order.orderType === 'lineman' && (
                                        <label className="flex items-center gap-2 cursor-pointer bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100 transition-colors">
                                            <input 
                                                type="checkbox" 
                                                checked={!!order.isFromAd} 
                                                onChange={handleToggleAd}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                            <span className="text-xs font-bold text-blue-700">มาจากโฆษณา</span>
                                        </label>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    <div className="text-gray-500">{order.isFromAd ? 'ยอดขาย Delivery:' : 'ยอดขายรวม:'}</div>
                                    <div className="text-right font-medium text-gray-800">{profitDetails.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</div>
                                    
                                    <div className="text-gray-500">ต้นทุนวัตถุดิบ:</div>
                                    <div className="text-right font-medium text-red-600">-{profitDetails.totalRawMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</div>
                                    
                                    {order.orderType === 'lineman' && (
                                        <>
                                            <div className="text-gray-500">ค่า GP ({profitDetails.providerName}):</div>
                                            <div className="text-right font-medium text-red-600">-{profitDetails.totalGPCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</div>
                                            
                                            <div className="text-gray-500">ภาษี GP (VAT):</div>
                                            <div className="text-right font-medium text-red-600">-{profitDetails.totalGPTax.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</div>
                                            
                                            {profitDetails.fixedAdCost > 0 && (
                                                <>
                                                    <div className="text-gray-500">ค่าโฆษณาคงที่:</div>
                                                    <div className="text-right font-medium text-red-600">-{profitDetails.fixedAdCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</div>
                                                    
                                                    <div className="text-gray-500">ภาษีค่าโฆษณา:</div>
                                                    <div className="text-right font-medium text-red-600">-{profitDetails.adCostTax.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</div>
                                                </>
                                            )}
                                        </>
                                    )}
                                    
                                    <div className="col-span-2 border-t my-1"></div>
                                    
                                    <div className="font-bold text-gray-800">กำไรสุทธิ:</div>
                                    <div className={`text-right font-bold ${profitDetails.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {profitDetails.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿
                                    </div>
                                    
                                    <div className="text-xs text-gray-400 italic col-span-2 mt-1">
                                        * หลังจากจ่ายให้ {profitDetails.providerName} และหักต้นทุนแล้ว เราเหลือเงินเข้ากระเป๋าจริงๆ เท่าไหร่
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Smart Bag Usage Display */}
                        {(order.orderType === 'takeaway' || order.orderType === 'lineman' || order.items.some(i => i.isTakeaway)) && (bagUsage['6x14'] > 0 || bagUsage['8x16'] > 0 || bagUsage['12x20'] > 0) && (
                            <div className="mb-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex items-start gap-3">
                                <div className="text-blue-500 mt-0.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-blue-800 mb-1">แนะนำขนาดถุงสำหรับจัดของ</h4>
                                    <div className="flex flex-wrap gap-2 text-sm">
                                        {bagUsage['12x20'] > 0 && <span className="bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded font-medium">{getBagName('12x20')} : {bagUsage['12x20']} ใบ</span>}
                                        {bagUsage['8x16'] > 0 && <span className="bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded font-medium">{getBagName('8x16')} : {bagUsage['8x16']} ใบ</span>}
                                        {bagUsage['6x14'] > 0 && <span className="bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded font-medium">{getBagName('6x14')} : {bagUsage['6x14']} ใบ</span>}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 border-t pt-3">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-semibold text-gray-700">รายการอาหาร</h4>
                                {isEditMode && currentUser?.role === 'admin' && !order.isDeleted && (
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddItem();
                                        }}
                                        className="text-xs px-2 py-1 bg-teal-600 text-white rounded hover:bg-teal-700 flex items-center gap-1 shadow-sm"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                        </svg>
                                        เพิ่มรายการอาหาร
                                    </button>
                                )}
                            </div>
                            {order.items.map(item => (
                                <div key={item.cartItemId} className={`text-base py-1 ${item.isManuallyAdded ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                                    <div className="flex justify-between">
                                        <span>{item.quantity} x {item.name} {item.isTakeaway && '(กลับบ้าน)'} {item.isManuallyAdded && '(เพิ่มใหม่)'}</span>
                                        <span>{(item.finalPrice * item.quantity).toLocaleString()} ฿</span>
                                    </div>
                                    { (item.selectedOptions.length > 0 || item.notes) &&
                                        <div className="pl-5 text-sm text-gray-500">
                                            {item.selectedOptions.length > 0 && <div>{item.selectedOptions.map(o => o.name).join(', ')}</div>}
                                            {item.notes && <div className="text-blue-600">** {item.notes}</div>}
                                        </div>
                                    }
                                    {item.isTakeaway && item.takeawayCutlery && item.takeawayCutlery.length > 0 && (
                                        <div className="pl-5 text-sm text-purple-600">
                                            รับ: {item.takeawayCutlery.map(c => {
                                                if(c === 'spoon-fork') return 'ช้อนส้อม';
                                                if(c === 'chopsticks') return 'ตะเกียบ';
                                                if(c === 'other') return `อื่นๆ (${item.takeawayCutleryNotes})`;
                                                if(c === 'none') return 'ไม่รับ';
                                                return '';
                                            }).filter(Boolean).join(', ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t flex flex-wrap justify-end gap-3">
                            <button onClick={() => onReprintReceipt(order)} className="px-4 py-2 bg-gray-200 text-gray-700 text-base font-semibold rounded-md hover:bg-gray-300 flex items-center gap-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" disabled={order.isDeleted}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                พิมพ์ใบเสร็จ
                            </button>
                            <button onClick={() => onInitiateCashBill(order)} className="px-4 py-2 bg-green-100 text-green-800 text-base font-semibold rounded-md hover:bg-green-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed" disabled={order.isDeleted}>สร้างบิลเงินสด</button>
                            
                            {isEditMode && (
                                <>
                                    <button onClick={() => onEditOrder(order)} className="px-4 py-2 bg-blue-100 text-blue-800 text-base font-semibold rounded-md hover:bg-blue-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed" disabled={order.isDeleted}>แก้ไขรายการ</button>
                                    <button onClick={() => onSplitOrder(order)} className="px-4 py-2 bg-yellow-100 text-yellow-800 text-base font-semibold rounded-md hover:bg-yellow-200 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed" disabled={order.isDeleted}>แยกบิลอีกครั้ง</button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* FULL SCREEN IMAGE VIEWER MODAL - IMPROVED SCROLLING */}
            {isViewingSlip && (order.paymentDetails.slipImage || order.paymentSlipUrl) && !isSlipExpired && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-fade-in"
                    onClick={handleCloseSlip}
                >
                    {/* Header with info and close button */}
                    <div className="flex justify-between items-center p-4 text-white bg-black/60 backdrop-blur-md z-10 border-b border-gray-800">
                        <div>
                            <h3 className="text-lg font-bold">หลักฐานการโอนเงิน</h3>
                            <p className="text-xs text-gray-400">ออเดอร์ #{order.orderNumber} (ระบบจะลบรูปใน 2 วัน)</p>
                        </div>
                        <button 
                            onClick={handleCloseSlip}
                            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors border border-gray-700"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Image Area - Scrollable Container */}
                    {/* Using overflow-auto on this container allows NATIVE scrolling momentum when image is larger than screen */}
                    <div 
                        ref={scrollContainerRef}
                        className="flex-1 overflow-auto w-full h-full relative"
                        style={{ 
                            WebkitOverflowScrolling: 'touch', // Enable smooth scrolling on iOS
                            touchAction: 'pan-x pan-y'
                        }}
                        onClick={(e) => e.stopPropagation()} 
                    >
                        <div 
                            className={`min-h-full min-w-full flex items-center justify-center p-4 ${zoomLevel > 1 ? 'items-start justify-start' : ''}`}
                        >
                            <img 
                                src={order.paymentSlipUrl || order.paymentDetails.slipImage} 
                                alt="Slip" 
                                className="transition-all duration-200 ease-out shadow-2xl"
                                style={{ 
                                    // Use CSS width/height for layout sizing instead of transform
                                    // This forces the scroll container to recognize the size and scroll properly
                                    width: zoomLevel === 1 ? 'auto' : `${zoomLevel * 100}%`, 
                                    maxWidth: zoomLevel === 1 ? '100%' : 'none',
                                    maxHeight: zoomLevel === 1 ? '100%' : 'none',
                                    objectFit: 'contain',
                                    // Ensure image doesn't get distorted
                                    height: 'auto'
                                }}
                            />
                        </div>
                    </div>

                    {/* Footer Controls - Fixed at bottom */}
                    <div className="p-6 pb-8 flex justify-center gap-8 items-center bg-black/60 backdrop-blur-md z-10 border-t border-gray-800" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={handleZoomOut}
                            disabled={zoomLevel <= 1}
                            className="w-14 h-14 rounded-full bg-gray-800 text-white flex items-center justify-center text-3xl font-bold hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed border border-gray-600 active:scale-95 transition-transform"
                        >
                            -
                        </button>
                        
                        <div className="flex flex-col items-center w-20">
                            <span className="text-white font-mono text-xl font-bold">
                                {Math.round(zoomLevel * 100)}%
                            </span>
                            <span className="text-gray-400 text-xs">Zoom</span>
                        </div>

                        <button 
                            onClick={handleZoomIn}
                            disabled={zoomLevel >= 3.0}
                            className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xl font-bold hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed border border-blue-400 active:scale-95 transition-transform shadow-lg shadow-blue-900/50"
                        >
                            +
                        </button>
                    </div>
                </div>
            )}
            {/* ADD ITEM MODALS */}
            <MenuSearchModal
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                menuItems={menuItems}
                onSelectItem={handleSelectItem}
                onToggleAvailability={() => {}} // Not needed here
            />

            <ItemCustomizationModal
                isOpen={isCustomizationModalOpen}
                onClose={() => setIsCustomizationModalOpen(false)}
                item={selectedMenuItem}
                onConfirm={(itemToAdd) => {
                    addOrderItemToCompletedOrder(itemToAdd);
                    setIsCustomizationModalOpen(false);
                }}
            />
        </>
    );
};
