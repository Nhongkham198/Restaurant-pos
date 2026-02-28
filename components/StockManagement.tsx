
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { StockItem, User, StockTag } from '../types';
import Swal from 'sweetalert2';
import { StockItemModal } from './StockItemModal';
import { AdjustStockModal } from './AdjustStockModal';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import { functionsService } from '../services/firebaseFunctionsService';

// Declare XLSX to inform TypeScript that it's available globally from the script tag
declare var XLSX: any;
// Declare html2canvas for potential direct usage if needed, though mainly used in modal
declare var html2canvas: any;

interface StockManagementProps {
    stockItems: StockItem[];
    setStockItems: React.Dispatch<React.SetStateAction<StockItem[]>>;
    stockTags: StockTag[];
    setStockTags: React.Dispatch<React.SetStateAction<StockTag[]>>;
    stockCategories: string[];
    setStockCategories: React.Dispatch<React.SetStateAction<string[]>>;
    stockUnits: string[];
    setStockUnits: React.Dispatch<React.SetStateAction<string[]>>;
    currentUser: User | null;
    isTagModalOpen: boolean;
    onOpenTagModal: () => void;
    onCloseTagModal: () => void;
}

export const StockManagement: React.FC<StockManagementProps> = ({
    stockItems,
    setStockItems,
    stockTags,
    setStockTags,
    stockCategories,
    setStockCategories,
    stockUnits,
    setStockUnits,
    currentUser,
    isTagModalOpen,
    onOpenTagModal,
    onCloseTagModal
}) => {
    const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
    const [searchTerm, setSearchTerm] = useState('');
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isPurchaseOrderModalOpen, setIsPurchaseOrderModalOpen] = useState(false);
    // New state to track if the PO modal is opened in "Mobile Image Mode"
    const [isMobilePOMode, setIsMobilePOMode] = useState(false);
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
    
    // Tag Registration State
    const [selectedTagItem, setSelectedTagItem] = useState<StockItem | null>(null);
    const [isWritingTag, setIsWritingTag] = useState(false);
    const [tagSearchTerm, setTagSearchTerm] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'default', direction: 'desc' });
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement>(null);

    // Close sort menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
                setIsSortMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredItems = useMemo(() => {
        // Safety check: Ensure stockItems is an array
        const items = Array.isArray(stockItems) ? stockItems : [];
        
        // Filter out null/undefined items first
        const validItems = items.filter(item => item && typeof item === 'object');

        let result = validItems;

        if (selectedCategory === 'รายการสั่งของ') {
             const startOfDay = new Date();
             startOfDay.setHours(0,0,0,0);
             result = validItems.filter(item => item.orderDate && item.orderDate >= startOfDay.getTime());
        } else if (selectedCategory !== 'ทั้งหมด') {
             result = validItems.filter(item => item.category === selectedCategory);
        }
        
        if (searchTerm.trim()) {
            result = result.filter(item => 
                // Safety check: Ensure name exists before calling toLowerCase
                (item.name || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Sorting Logic
        if (sortConfig.key !== 'default') {
            result.sort((a, b) => {
                let valA = 0;
                let valB = 0;

                if (sortConfig.key === 'lastUpdated') {
                    valA = a.lastUpdated || 0;
                    valB = b.lastUpdated || 0;
                } else if (sortConfig.key === 'orderDate') {
                    valA = a.orderDate || 0;
                    valB = b.orderDate || 0;
                } else if (sortConfig.key === 'receivedDate') {
                    valA = a.receivedDate || 0;
                    valB = b.receivedDate || 0;
                }

                return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            });
        } else {
             // Default sort by ID (usually creation order)
             result.sort((a, b) => a.id - b.id);
        }

        return result;
    }, [stockItems, selectedCategory, searchTerm, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            // Toggle direction if clicking the same key, otherwise default to desc (newest first)
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
        setIsSortMenuOpen(false);
    };

    const getSortLabel = () => {
        if (sortConfig.key === 'lastUpdated') return 'เรียงตามแก้ไขล่าสุด';
        if (sortConfig.key === 'orderDate') return 'เรียงตามวันที่สั่ง';
        if (sortConfig.key === 'receivedDate') return 'เรียงตามวันที่รับ';
        return 'วันที่สั่ง/รับ';
    };

    const canDelete = useMemo(() => {
        if (!currentUser) return false;
        return !['pos', 'kitchen'].includes(currentUser.role);
    }, [currentUser]);

    const handleOpenItemModal = (item: StockItem | null) => {
        setSelectedItem(item);
        setIsItemModalOpen(true);
    };

    const handleOpenAdjustModal = (item: StockItem) => {
        setSelectedItem(item);
        setIsAdjustModalOpen(true);
    };

    const handleBulkUpdateStock = (items: StockItem[]) => {
        const updatedBy = currentUser?.username || 'System';
        const timestamp = Date.now();
        
        const updatesMap = new Map(items.map(i => [i.id, i]));
        
        setStockItems(prev => prev.map(item => {
            if (updatesMap.has(item.id)) {
                const updatedItem = updatesMap.get(item.id)!;
                return {
                    ...item,
                    orderDate: updatedItem.orderDate,
                    orderedQuantity: updatedItem.orderedQuantity,
                    orderedBy: updatedItem.orderedBy,
                    lastUpdated: timestamp,
                    lastUpdatedBy: updatedBy
                };
            }
            return item;
        }));
        
        Swal.fire({
            icon: 'success',
            title: 'อัปเดตสถานะการสั่งซื้อแล้ว',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000
        });
    };

    // Handler for Mobile PO Button
    const handleMobilePO = () => {
        setIsMobilePOMode(true);
        setIsPurchaseOrderModalOpen(true);
    };

    // Smart Running Function: Find the first available gap in the sequence
    const getNextTagId = (item: StockItem) => {
        const itemTags = stockTags.filter(t => t.stockItemId === item.id);
        const usedNumbers = new Set<number>();
        
        itemTags.forEach(tag => {
            // Extract number from ID (Format: Name-XXX)
            const parts = tag.id.split('-');
            const lastPart = parts[parts.length - 1];
            const num = parseInt(lastPart, 10);
            if (!isNaN(num)) {
                usedNumbers.add(num);
            }
        });

        let nextNum = 1;
        while (usedNumbers.has(nextNum)) {
            nextNum++;
        }
        
        return String(nextNum).padStart(3, '0');
    };

    const handleRegisterTag = async () => {
        if (!selectedTagItem) return;

        setIsWritingTag(true);
        try {
            // 1. Generate ID using Smart Running
            const runningId = getNextTagId(selectedTagItem);
            const tagDisplayId = `${selectedTagItem.name}-${runningId}`;

            if ('NDEFReader' in window) {
                try {
                    const ndef = new (window as any).NDEFReader();
                    await ndef.write(tagDisplayId);
                    Swal.fire('สำเร็จ', `บันทึก Tag: ${tagDisplayId} เรียบร้อย`, 'success');
                } catch (writeError) {
                    console.error("NDEF Write Error:", writeError);
                    throw writeError;
                }
            } else {
                // Simulation for desktop/incompatible devices
                await new Promise(resolve => setTimeout(resolve, 1000));
                Swal.fire('จำลอง', `(Simulation) บันทึก Tag: ${tagDisplayId} เรียบร้อย`, 'success');
            }

            // 2. Save to DB
            const newTag: StockTag = {
                id: tagDisplayId,
                stockItemId: selectedTagItem.id,
                stockItemName: selectedTagItem.name,
                createdAt: Date.now(),
                status: 'active'
            };
            
            setStockTags(prev => [...prev, newTag]);
            onCloseTagModal();
            setSelectedTagItem(null);

        } catch (error) {
            console.error(error);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึก Tag ได้ (ต้องใช้บน Android/Chrome หรืออุปกรณ์ที่รองรับ NFC)', 'error');
        } finally {
            setIsWritingTag(false);
        }
    };

    const handleViewImage = (item: StockItem) => {
        Swal.fire({
            title: item.name,
            text: item.category,
            imageUrl: item.imageUrl || "https://placehold.co/400?text=No+Image",
            imageWidth: 400,
            imageHeight: 'auto',
            imageAlt: item.name,
            showConfirmButton: false,
            showCloseButton: true,
        });
    };

    const handleReceiveStock = async (item: StockItem) => {
        const result = await Swal.fire({
            title: `รับสินค้า: ${item.name}`,
            html: `
                <div class="flex flex-col gap-4 text-left">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">วันที่รับสินค้า</label>
                        <input type="date" id="swal-receive-date" class="w-full px-3 py-2 border rounded-lg" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">จำนวนที่รับ (${item.unit})</label>
                        <input type="number" id="swal-receive-qty" class="w-full px-3 py-2 border rounded-lg" placeholder="ระบุจำนวน">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'รับยอดครบ',
            denyButtonText: 'รับยอดไม่ครบ',
            showDenyButton: true,
            confirmButtonColor: '#10B981',
            denyButtonColor: '#F59E0B',
            cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                const date = (document.getElementById('swal-receive-date') as HTMLInputElement).value;
                const qty = (document.getElementById('swal-receive-qty') as HTMLInputElement).value;
                if (!date || !qty) {
                    Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
                    return false;
                }
                return { date, qty: Number(qty), status: 'complete' };
            },
            preDeny: () => {
                const date = (document.getElementById('swal-receive-date') as HTMLInputElement).value;
                const qty = (document.getElementById('swal-receive-qty') as HTMLInputElement).value;
                if (!date || !qty) {
                    Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
                    return false;
                }
                return { date, qty: Number(qty), status: 'incomplete' };
            }
        });

        if (!result.isConfirmed && !result.isDenied) return;

        const receivedData = result.value; 
        if (!receivedData) return;

        if (receivedData.status === 'incomplete') {
             const { value: note } = await Swal.fire({
                 title: 'บันทึกยอดไม่ครบ',
                 input: 'textarea',
                 inputLabel: 'ระบุสาเหตุ/จำนวนที่ขาด',
                 inputPlaceholder: 'เช่น ขาดไป 2 กก. เพราะ...',
                 showCancelButton: true,
                 confirmButtonText: 'บันทึก',
                 cancelButtonText: 'ยกเลิก',
                 inputValidator: (value) => {
                     if (!value) {
                         return 'กรุณาระบุสาเหตุ';
                     }
                 }
             });
             
             if (!note) return;
             receivedData.note = note;
        }

        let newTotal = receivedData.qty;
        let shouldMerge = false;

        if (item.quantity > 0) {
            newTotal = item.quantity + receivedData.qty;
            const confirmMerge = await Swal.fire({
                title: 'รวมยอดสินค้า?',
                html: `
                    <div class="text-left">
                        <p>มีสินค้าเดิมอยู่: <b>${formatQty(item.quantity, item.unit)} ${item.unit}</b></p>
                        <p>รับเพิ่ม: <b>${formatQty(receivedData.qty, item.unit)} ${item.unit}</b></p>
                        <hr class="my-2">
                        <p class="text-lg">ยอดรวมใหม่: <b class="text-blue-600">${formatQty(newTotal, item.unit)} ${item.unit}</b></p>
                    </div>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ใช่, รวมยอด',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#3B82F6'
            });

            if (!confirmMerge.isConfirmed) return;
            shouldMerge = true;
        }

        // Update Item
        const updatedBy = currentUser?.username || 'System';
        const timestamp = Date.now();

        const updatedItem = {
             ...item,
             quantity: shouldMerge ? newTotal : receivedData.qty,
             receivedDate: new Date(receivedData.date).getTime(),
             lastUpdated: timestamp,
             lastUpdatedBy: updatedBy
        };
        
        setStockItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
        Swal.fire('สำเร็จ', 'รับสินค้าเรียบร้อย', 'success');
    };

    const handleSaveItem = async (itemToSave: Omit<StockItem, 'id'> & { id?: number }) => {
        let success = false;
        const updatedBy = currentUser?.username || 'System';

        try {
            if (itemToSave.id) {
                await functionsService.updateStockItem({
                    itemId: itemToSave.id,
                    name: itemToSave.name,
                    category: itemToSave.category,
                    unit: itemToSave.unit,
                    reorderPoint: itemToSave.reorderPoint
                });
            } else {
                await functionsService.addStockItem({
                    name: itemToSave.name,
                    category: itemToSave.category,
                    quantity: itemToSave.quantity,
                    unit: itemToSave.unit,
                    reorderPoint: itemToSave.reorderPoint,
                    branchId: 1 // Placeholder branch ID
                });
            }
            success = true;
        } catch (e: any) {
            console.warn("Backend function for stock management failed or not implemented. Falling back to direct client-side DB write.", e);
            setStockItems(prev => {
                const safePrev = Array.isArray(prev) ? prev : [];
                
                const itemWithTimestamp = { 
                    ...itemToSave, 
                    lastUpdated: Date.now(),
                    lastUpdatedBy: updatedBy
                };
                
                if (itemToSave.id) {
                    return safePrev.map(i => i.id === itemToSave.id ? { ...i, ...itemWithTimestamp } as StockItem : i);
                }
                
                const maxId = safePrev.reduce((max, item) => {
                    const id = Number(item?.id);
                    return !isNaN(id) ? Math.max(max, id) : max;
                }, 0);
                
                const newId = maxId + 1;
                
                const newItem: StockItem = {
                    id: newId,
                    name: itemToSave.name || 'สินค้าใหม่',
                    category: itemToSave.category || 'ทั่วไป',
                    imageUrl: itemToSave.imageUrl || '',
                    quantity: Number(itemToSave.quantity) || 0,
                    unit: itemToSave.unit || 'ชิ้น',
                    reorderPoint: Number(itemToSave.reorderPoint) || 0,
                    withdrawalCount: 0, // Initialize withdrawal count
                    lastUpdated: Date.now(),
                    lastUpdatedBy: updatedBy,
                    orderDate: itemToSave.orderDate,
                    receivedDate: itemToSave.receivedDate
                };
                
                return [...safePrev, newItem];
            });
            success = true;
        }
        
        if (success) {
            setIsItemModalOpen(false);
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'บันทึกข้อมูลสำเร็จ',
                showConfirmButton: false,
                timer: 1500
            });
        } else {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    const handleAdjustStock = async (itemToAdjust: StockItem, adjustment: number) => {
        let success = false;
        const updatedBy = currentUser?.username || 'System';
        
        // Key for current month's stats (e.g., "2023-10")
        const currentMonthKey = new Date().toISOString().slice(0, 7);

        try {
            await functionsService.adjustStockQuantity({
                itemId: itemToAdjust.id,
                adjustment: adjustment
            });
            success = true;
        } catch (e: any) {
             console.warn("Backend function for stock adjustment failed or not implemented. Falling back to direct client-side DB write.", e);
             
             setStockItems(prev => prev.map(i => {
                if (i.id !== itemToAdjust.id) return i;

                let newWithdrawalCount = i.withdrawalCount || 0;
                let newMonthlyWithdrawals = { ...(i.monthlyWithdrawals || {}) };

                if (adjustment < 0) {
                    // WITHDRAWAL: Increment count AND history
                    newWithdrawalCount = newWithdrawalCount + 1;
                    const currentMonthCount = newMonthlyWithdrawals[currentMonthKey] || 0;
                    newMonthlyWithdrawals[currentMonthKey] = currentMonthCount + 1;
                } else if (adjustment > 0) {
                    // RESTOCK (ADD): Reset cycle count to 0 (Keep history intact)
                    newWithdrawalCount = 0;
                }

                return { 
                    ...i, 
                    quantity: (Number(i.quantity) || 0) + adjustment, 
                    withdrawalCount: newWithdrawalCount,
                    monthlyWithdrawals: newMonthlyWithdrawals,
                    lastUpdated: Date.now(),
                    lastUpdatedBy: updatedBy
                };
            }));
            success = true;
        }

        if (success) {
            setIsAdjustModalOpen(false);
            const actionText = adjustment > 0 ? 'รับเข้า' : 'นำออก';
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: `ปรับสต็อก (${actionText}) เรียบร้อย`,
                showConfirmButton: false,
                timer: 1500
            });
        } else {
             Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถปรับสต็อกได้', 'error');
        }
    };

    const handleDeleteItem = async (itemId: number) => {
        if (!canDelete) {
            Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ลบรายการสินค้า', 'error');
            return;
        }

        Swal.fire({
            title: 'คุณแน่ใจหรือไม่?',
            text: "คุณกำลังจะลบรายการนี้ออกจากสต็อก",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                let success = false;
                try {
                    await functionsService.deleteStockItem({ itemId });
                    success = true;
                } catch (e: any) {
                    console.warn("Backend function for stock deletion failed or not implemented. Falling back to direct client-side DB write.", e);
                    setStockItems(prev => prev.filter(item => item.id !== itemId));
                    success = true;
                }

                if (success) {
                    Swal.fire('ลบแล้ว!', 'รายการถูกลบออกจากสต็อกแล้ว', 'success');
                } else {
                    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบรายการได้', 'error');
                }
            }
        });
    };

    const getStatus = (item: StockItem) => {
        const qty = Number(item.quantity) || 0;
        const reorder = Number(item.reorderPoint) || 0;
        
        if (qty <= 0) return { text: 'หมด', color: 'bg-red-100 text-red-700 border-red-200' };
        if (qty <= reorder) return { text: 'ใกล้หมด', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
        return { text: 'มีของ', color: 'bg-green-100 text-green-700 border-green-200' };
    };

    const getMobileCardStyle = (item: StockItem) => {
        const qty = Number(item.quantity) || 0;
        const reorder = Number(item.reorderPoint) || 0;
        
        if (qty <= 0) return 'bg-red-50 border-l-4 border-red-500 shadow-sm';
        if (qty <= reorder) return 'bg-yellow-50 border-l-4 border-yellow-500 shadow-sm';
        return 'bg-white border-l-4 border-green-500 shadow-sm';
    };

    const getRowStyle = (item: StockItem) => {
        const qty = Number(item.quantity) || 0;
        const reorder = Number(item.reorderPoint) || 0;
        
        if (qty <= 0) return 'bg-red-50 border-red-200 hover:bg-red-100';
        if (qty <= reorder) return 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100';
        return 'border-gray-100 hover:bg-blue-50/30';
    };

    const formatQty = (qty: any, unit: string | undefined) => {
        const val = Number(qty);
        const safeVal = isNaN(val) ? 0 : val;
        
        if (unit === 'กิโลกรัม') {
            return safeVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return safeVal.toLocaleString();
    };

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    const handlePrintKitchen = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            Swal.fire('Error', 'กรุณาอนุญาตให้แสดง Popup เพื่อพิมพ์', 'error');
            return;
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        let html = `
            <html>
            <head>
                <title>พิมพ์รายการสั่งของ</title>
                <style>
                    @page { margin: 0; size: 80mm auto; }
                    body { 
                        font-family: 'Sarabun', sans-serif; 
                        width: 80mm; 
                        margin: 0; 
                        padding: 10px; 
                        font-size: 14px;
                        color: #000;
                    }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: bold; }
                    .mb-2 { margin-bottom: 8px; }
                    .flex { display: flex; justify-content: space-between; }
                    .border-b { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { text-align: left; padding: 4px 0; vertical-align: top; }
                    th { border-bottom: 1px solid #000; }
                    .qty { text-align: right; width: 30%; }
                </style>
            </head>
            <body>
                <div class="text-center font-bold mb-2" style="font-size: 18px;">รายการสั่งของ</div>
                <div class="flex mb-2">
                    <span>วันที่: ${dateStr}</span>
                    <span>เวลา: ${timeStr}</span>
                </div>
                <div class="border-b">ผู้พิมพ์: ${currentUser?.username || 'System'}</div>
                <table>
                    <thead>
                        <tr>
                            <th>รายการ</th>
                            <th class="qty">จำนวน</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        filteredItems.forEach(item => {
            const qty = item.orderedQuantity || '-';
            const unit = item.unit || '';
            html += `
                <tr>
                    <td>${item.name}</td>
                    <td class="qty">${qty} ${unit}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
                <div class="text-center" style="margin-top: 20px; border-top: 1px dashed #000; padding-top: 10px;">
                    --- สิ้นสุดรายการ ---
                </div>
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleExport = () => {
        const dataToExport = stockItems.map(item => ({
            'id': item.id,
            'ชื่อวัตถุดิบ': item.name,
            'หมวดหมู่': item.category,
            'จำนวนคงเหลือ': item.quantity,
            'หน่วยนับ': item.unit,
            'จุดสั่งซื้อขั้นต่ำ': item.reorderPoint,
            'แก้ไขล่าสุดโดย': item.lastUpdatedBy || '-',
            'เวลาแก้ไขล่าสุด': new Date(item.lastUpdated).toLocaleString('th-TH'),
            'รูปภาพ (URL)': item.imageUrl || ''
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'StockData');
        XLSX.writeFile(wb, 'stock_template.xlsx');
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json: any[] = XLSX.utils.sheet_to_json(worksheet);

                const expectedHeaders = ['id', 'ชื่อวัตถุดิบ', 'หมวดหมู่', 'จำนวนคงเหลือ', 'หน่วยนับ', 'จุดสั่งซื้อขั้นต่ำ'];
                if (json.length > 0) {
                    const keys = Object.keys(json[0]);
                    const missing = expectedHeaders.filter(h => !keys.includes(h));
                    if (missing.length > 0) {
                         Swal.fire({
                            icon: 'error',
                            title: 'รูปแบบไฟล์ไม่ถูกต้อง',
                            text: `ไม่พบคอลัมน์: ${missing.join(', ')} กรุณาใช้ไฟล์ที่ Export จากระบบ`,
                        });
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        return;
                    }
                }

                const newStockItemsMap = new Map<number, StockItem>();
                const importUser = currentUser?.username || 'Import';
                
                for (const row of json) {
                    const id = Number(row.id);
                    const quantity = Number(row['จำนวนคงเหลือ']);
                    const reorderPoint = Number(row['จุดสั่งซื้อขั้นต่ำ']);

                    if (isNaN(id) || !row['ชื่อวัตถุดิบ'] || !row['หน่วยนับ']) {
                        console.warn('Skipping invalid row:', row);
                        continue;
                    }

                    newStockItemsMap.set(id, {
                        id: id,
                        name: String(row['ชื่อวัตถุดิบ']),
                        category: String(row['หมวดหมู่']),
                        quantity: isNaN(quantity) ? 0 : quantity,
                        unit: String(row['หน่วยนับ']),
                        reorderPoint: isNaN(reorderPoint) ? 0 : reorderPoint,
                        withdrawalCount: 0, // Default 0 for imported items
                        imageUrl: row['รูปภาพ (URL)'] ? String(row['รูปภาพ (URL)']) : '',
                        lastUpdated: Date.now(),
                        lastUpdatedBy: importUser
                    });
                }
                
                setStockItems(prevItems => {
                    const updatedItemsMap = new Map(prevItems.map(item => [item.id, item]));
                    newStockItemsMap.forEach((value, key) => {
                        updatedItemsMap.set(key, value);
                    });
                    return Array.from(updatedItemsMap.values());
                });

                Swal.fire('สำเร็จ', `นำเข้าและอัปเดตข้อมูลสต็อก ${newStockItemsMap.size} รายการเรียบร้อยแล้ว`, 'success');

            } catch (error) {
                 Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาดในการนำเข้า',
                    text: error instanceof Error ? error.message : 'ไม่สามารถอ่านไฟล์ได้',
                });
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    return (
        <>
            <div className="h-full w-full flex flex-col bg-gray-50">
                <header className="p-4 sm:p-6 border-b border-gray-200 bg-white flex-shrink-0 shadow-sm z-10">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div className="flex justify-between items-center w-full md:w-auto">
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">จัดการสต็อกสินค้า</h1>
                            {/* Mobile Action Button - Moved here */}
                            <button onClick={handleMobilePO} className="lg:hidden px-3 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 text-sm flex items-center gap-2 shadow-sm transition-all active:scale-95 ml-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span>ออกใบสั่ง (รูปภาพ)</span>
                            </button>
                        </div>
                        {/* Hidden on mobile and tablet vertical (< 1024px), shown on desktop */}
                        <div className="hidden lg:flex items-center gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImport}
                                className="hidden"
                                accept=".xlsx, .xls"
                            />
                            <button onClick={() => { setIsMobilePOMode(false); setIsPurchaseOrderModalOpen(true); }} className="px-4 py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 whitespace-nowrap text-sm flex items-center gap-2 shadow transition-all hover:shadow-md">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                ออกรายการสั่งของ
                            </button>
                            <button onClick={handlePrintKitchen} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 whitespace-nowrap text-sm flex items-center gap-2 shadow transition-all hover:shadow-md">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                พิมพ์รายการ
                            </button>
                            <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 whitespace-nowrap text-sm shadow transition-all hover:shadow-md">
                                Export Excel
                            </button>
                             <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 whitespace-nowrap text-sm shadow transition-all hover:shadow-md">
                                Import Excel
                            </button>
                            <button onClick={() => handleOpenItemModal(null)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap text-sm shadow transition-all hover:shadow-md">
                                + เพิ่มรายการ
                            </button>
                            <button onClick={onOpenTagModal} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 whitespace-nowrap text-sm shadow transition-all hover:shadow-md flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                🏷️ ลงทะเบียน Tag
                            </button>
                        </div>
                    </div>
                     <div className="mt-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        {/* Container for Search + Category Dropdown (Mobile) */}
                        <div className="flex w-full sm:w-auto gap-3">
                            <div className="relative flex-grow sm:w-80">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="ค้นหาวัตถุดิบ..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 shadow-sm"
                                />
                            </div>
                            
                            {/* Mobile Category Dropdown - Visible only on small screens */}
                            <div className="sm:hidden flex-shrink-0 relative">
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="h-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm appearance-none shadow-sm"
                                >
                                    <option value="ทั้งหมด">ทั้งหมด</option>
                                    <option value="รายการสั่งของ">รายการสั่งของ</option>
                                    {stockCategories.filter(c => c !== 'ทั้งหมด').map(category => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                </select>
                                {/* Custom arrow for select */}
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Category Buttons - Hidden on mobile */}
                        <div className="hidden sm:flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => setSelectedCategory('ทั้งหมด')}
                                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${selectedCategory === 'ทั้งหมด' ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
                            >
                                ทั้งหมด
                            </button>
                            <button
                                onClick={() => setSelectedCategory('รายการสั่งของ')}
                                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${selectedCategory === 'รายการสั่งของ' ? 'bg-purple-600 text-white shadow-md' : 'bg-white border border-purple-200 text-purple-600 hover:bg-purple-50 hover:border-purple-300'}`}
                            >
                                รายการสั่งของ
                            </button>
                            {stockCategories.filter(c => c !== 'ทั้งหมด').map(category => (
                                <button
                                    key={category}
                                    onClick={() => setSelectedCategory(category)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${selectedCategory === category ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                {/* ... (Existing table and card code remains unchanged) ... */}
                <div className="flex-1 overflow-hidden p-4 md:p-6">
                    {/* Desktop Table Layout */}
                    <div className="hidden md:flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200 sticky top-0 z-10 items-center">
                            <div className="col-span-1">รูปภาพ</div>
                            <div className="col-span-2">ชื่อวัตถุดิบ</div>
                            <div className="col-span-1 text-center">จำนวนสั่ง</div>
                            <div className="col-span-1 text-center">ผู้สั่งซื้อ</div>
                            <div className="col-span-1 text-center">หมวดหมู่</div>
                            
                            <div className="col-span-2 text-center relative" ref={sortMenuRef}>
                                <button 
                                    onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                                    className={`flex items-center justify-center gap-1 transition-colors w-full focus:outline-none ${sortConfig.key !== 'default' && sortConfig.key !== 'lastUpdated' ? 'text-blue-600 font-bold' : 'hover:text-blue-600'}`}
                                >
                                    {getSortLabel()}
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isSortMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {isSortMenuOpen && (
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden text-left">
                                        <div className="py-1">
                                            <button onClick={() => handleSort('lastUpdated')} className={`block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortConfig.key === 'lastUpdated' ? 'bg-blue-50 text-blue-600 font-semibold' : ''}`}>
                                                เรียงตามแก้ไขล่าสุด
                                            </button>
                                            <button onClick={() => handleSort('orderDate')} className={`block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortConfig.key === 'orderDate' ? 'bg-blue-50 text-blue-600 font-semibold' : ''}`}>
                                                เรียงตามวันที่สั่ง
                                            </button>
                                            <button onClick={() => handleSort('receivedDate')} className={`block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortConfig.key === 'receivedDate' ? 'bg-blue-50 text-blue-600 font-semibold' : ''}`}>
                                                เรียงตามวันที่รับ
                                            </button>
                                             <button onClick={() => handleSort('default')} className={`block w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t`}>
                                                รีเซ็ตการเรียง
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="col-span-1 text-center">แก้ไขล่าสุด</div>
                            <div className="col-span-1 text-right">คงเหลือ/จุดสั่ง</div>
                            <div className="col-span-1 text-center">สถานะ</div>
                            <div className="col-span-1 text-center">จัดการ</div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {filteredItems.length > 0 ? filteredItems.map((item, index) => {
                                if (!item) return null;
                                const status = getStatus(item);
                                
                                return (
                                    <div key={item.id} className={`grid grid-cols-12 gap-4 px-6 py-3 items-center border-b transition-colors last:border-0 group ${getRowStyle(item)}`}>
                                        <div className="col-span-1">
                                            <div className="relative w-12 h-12">
                                                <img 
                                                    src={item.imageUrl || "https://placehold.co/100?text=No+Image"} 
                                                    alt={item.name} 
                                                    className="w-full h-full object-cover rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity" 
                                                    onClick={() => handleViewImage(item)}
                                                    onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"} 
                                                />
                                                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-gray-800 text-white text-[10px] flex items-center justify-center rounded-full font-bold shadow-sm">
                                                    {index + 1}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-2 pr-2">
                                            <div className="font-semibold text-gray-900 text-base truncate" title={item.name}>{item.name}</div>
                                            <div className="text-xs text-gray-400">ID: {item.id}</div>
                                        </div>
                                        
                                        <div className="col-span-1 text-center flex items-center justify-center">
                                            <span className="font-medium text-gray-700">{item.orderedQuantity || '-'}</span>
                                        </div>

                                        <div className="col-span-1 text-center flex items-center justify-center">
                                            <span className="text-xs text-gray-600">{item.orderedBy || '-'}</span>
                                        </div>

                                        <div className="col-span-1 text-center">
                                            <span className="px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600 border border-gray-200 inline-block truncate max-w-full">
                                                {item.category}
                                            </span>
                                        </div>
                                        
                                        <div className="col-span-2 text-center text-xs text-gray-500 space-y-1">
                                            <div className="flex justify-between px-2">
                                                <span className="text-gray-400">สั่ง:</span> 
                                                <span className="font-medium text-gray-700">{formatDate(item.orderDate)}</span>
                                            </div>
                                            <div className="flex justify-between px-2 border-t border-gray-100 pt-1">
                                                <span className="text-gray-400">รับ:</span> 
                                                <span className="font-medium text-gray-700">{formatDate(item.receivedDate)}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-1 text-center">
                                            <div className="flex flex-col items-center">
                                                <div className="text-xs font-semibold text-gray-700">{item.lastUpdatedBy || '-'}</div>
                                                <div className="text-[10px] text-gray-400">
                                                    {new Date(item.lastUpdated).toLocaleString('th-TH', { 
                                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-1 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`text-base font-bold ${Number(item.quantity) <= Number(item.reorderPoint) ? 'text-red-600' : 'text-gray-900'}`}>
                                                    {formatQty(item.quantity, item.unit)}
                                                </span>
                                                <span className="text-[10px] text-gray-400 border-t border-gray-200 pt-0.5 mt-0.5 w-full text-right">
                                                    จุดสั่ง: {formatQty(item.reorderPoint, item.unit)} {item.unit}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-1 text-center">
                                            <span className={`px-2 py-1 text-xs font-bold rounded-full border shadow-sm ${status.color} inline-block w-20 text-center`}>
                                                {status.text}
                                            </span>
                                        </div>
                                        
                                        <div className="col-span-1 flex justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleOpenAdjustModal(item)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg border border-transparent hover:border-green-200 transition-all" title="เบิกของ">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                            </button>
                                            <button onClick={() => handleOpenItemModal(item)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-all" title="แก้ไข">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                            </button>
                                            {canDelete && (
                                                <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all" title="ลบ">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                    </svg>
                                    <p className="text-lg font-medium">ไม่พบรายการวัตถุดิบ</p>
                                    <p className="text-sm">ลองค้นหาคำอื่น หรือเปลี่ยนหมวดหมู่</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile/Tablet Card Layout */}
                    <div className="md:hidden space-y-3 pb-24 overflow-y-auto h-full">
                        {filteredItems.length > 0 ? filteredItems.map((item, index) => {
                            if (!item) return null;
                            const status = getStatus(item);
                            
                            return (
                                <div key={item.id} className={`p-4 space-y-3 rounded-lg shadow-sm ${getMobileCardStyle(item)}`}>
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="relative flex-shrink-0">
                                            <div className="absolute -top-2 -left-2 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md border-2 border-white z-10">
                                                {index + 1}
                                            </div>
                                            <img 
                                                src={item.imageUrl || "https://placehold.co/100?text=No+Image"} 
                                                alt={item.name} 
                                                className="w-16 h-16 object-cover rounded-md border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity" 
                                                onClick={() => handleViewImage(item)}
                                                onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"} 
                                            />
                                        </div>
                                        
                                        <div className="flex-1">
                                            <h3 className="font-bold text-xl text-gray-900">{item.name}</h3>
                                            <p className="text-base text-gray-500">หมวดหมู่: {item.category}</p>
                                        </div>
                                        <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${status.color}`}>{status.text}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-600 bg-white/50 p-2 rounded">
                                        <div>
                                            <span className="font-semibold block text-xs text-gray-500">สั่งของ</span>
                                            {formatDate(item.orderDate)}
                                        </div>
                                        <div className="text-right">
                                            <span className="font-semibold block text-xs text-gray-500">รับของ</span>
                                            {formatDate(item.receivedDate)}
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 mt-2 mb-2">
                                        <div>
                                            <span className="font-semibold block text-xs text-gray-500">จำนวนสั่ง</span>
                                            <span className="font-medium text-gray-800">{item.orderedQuantity || '-'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-semibold block text-xs text-gray-500">ผู้สั่งซื้อ</span>
                                            <span className="font-medium text-gray-800">{item.orderedBy || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
                                        <span className="font-semibold text-xs text-blue-600">แก้ไขล่าสุด:</span>
                                        <div className="text-right">
                                            <div className="font-bold text-gray-800">{item.lastUpdatedBy || '-'}</div>
                                            <div className="text-xs text-gray-500">{new Date(item.lastUpdated).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 text-base pt-2 border-t border-gray-200 gap-2">
                                        <div>
                                            <p className="text-gray-600 text-xs">คงเหลือ</p> 
                                            <div className="flex items-baseline gap-1">
                                                <p className="font-semibold text-gray-900 text-lg">{formatQty(item.quantity, item.unit)}</p>
                                                <p className="text-xs text-gray-500">{item.unit}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-gray-600 text-xs">จุดสั่งซื้อ</p>
                                            <div className="flex items-baseline gap-1">
                                                <p className="font-semibold text-gray-900 text-lg">{formatQty(item.reorderPoint, item.unit)}</p>
                                                <p className="text-xs text-gray-500">{item.unit}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                                        <button onClick={() => handleReceiveStock(item)} className="text-base font-medium text-purple-700 hover:underline">รับของ</button>
                                        <button onClick={() => handleOpenAdjustModal(item)} className="text-base font-medium text-green-700 hover:underline">เบิกของ</button>
                                        <button onClick={() => handleOpenItemModal(item)} className="text-base font-medium text-blue-700 hover:underline">แก้ไข</button>
                                        {canDelete && (
                                            <button onClick={() => handleDeleteItem(item.id)} className="text-base font-medium text-red-700 hover:underline">ลบ</button>
                                        )}
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-16 text-gray-500">
                                <p>ไม่พบรายการวัตถุดิบ</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <StockItemModal
                isOpen={isItemModalOpen}
                onClose={() => setIsItemModalOpen(false)}
                onSave={handleSaveItem}
                itemToEdit={selectedItem}
                categories={stockCategories.filter(c => c !== 'ทั้งหมด')}
                setCategories={setStockCategories}
                units={stockUnits}
                setUnits={setStockUnits}
                stockItems={stockItems}
            />

            <AdjustStockModal
                isOpen={isAdjustModalOpen}
                onClose={() => setIsAdjustModalOpen(false)}
                onSave={handleAdjustStock}
                item={selectedItem}
            />

            <PurchaseOrderModal 
                isOpen={isPurchaseOrderModalOpen}
                onClose={() => { setIsPurchaseOrderModalOpen(false); setIsMobilePOMode(false); }}
                stockItems={stockItems}
                currentUser={currentUser}
                isMobileMode={isMobilePOMode}
                onUpdateStock={handleBulkUpdateStock}
            />

            {/* Tag Registration Modal */}
            {isTagModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4 pb-24">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                ลงทะเบียน NFC Tag
                            </h3>
                            <button onClick={() => { onCloseTagModal(); setSelectedTagItem(null); }} className="text-gray-400 hover:text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <div className="p-4 flex-1 overflow-y-auto">
                            {!selectedTagItem ? (
                                <>
                                    <div className="mb-4">
                                        <input 
                                            type="text" 
                                            placeholder="ค้นหาสินค้า..." 
                                            value={tagSearchTerm}
                                            onChange={(e) => setTagSearchTerm(e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        {stockItems
                                            .filter(item => item.name.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                                            .map(item => (
                                                <button 
                                                    key={item.id} 
                                                    onClick={() => setSelectedTagItem(item)}
                                                    className="w-full text-left p-3 hover:bg-indigo-50 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all flex items-center justify-between group"
                                                >
                                                    <span className="font-medium text-gray-700 group-hover:text-indigo-700">{item.name}</span>
                                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full group-hover:bg-indigo-100 group-hover:text-indigo-600">{item.category}</span>
                                                </button>
                                            ))
                                        }
                                        {stockItems.length === 0 && <p className="text-center text-gray-500 py-4">ไม่พบสินค้า</p>}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-6 space-y-6">
                                    <div className="bg-indigo-50 p-4 rounded-xl inline-block mb-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-indigo-600 mx-auto animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.131A8 8 0 008 8m0 0a8 8 0 00-8 8c0 2.33.341 4.591.976 6.722" />
                                        </svg>
                                    </div>
                                    
                                    <div>
                                        <h4 className="text-xl font-bold text-gray-800 mb-1">{selectedTagItem.name}</h4>
                                        <p className="text-gray-500 text-sm">กำลังจะสร้าง Tag ID:</p>
                                        <div className="text-2xl font-mono font-bold text-indigo-600 mt-2 bg-indigo-50 py-2 rounded-lg border border-indigo-100">
                                            {selectedTagItem.name}-{getNextTagId(selectedTagItem)}
                                        </div>
                                    </div>

                                    <div className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-left">
                                        <p className="font-semibold text-yellow-800 mb-1">คำแนะนำ:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>นำ NFC Tag มาแตะที่ด้านหลังโทรศัพท์</li>
                                            <li>กดปุ่ม "บันทึกข้อมูลลง Tag" ด้านล่าง</li>
                                            <li>ถือค้างไว้จนกว่าจะขึ้นข้อความสำเร็จ</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3">
                            {selectedTagItem ? (
                                <>
                                    <button 
                                        onClick={() => setSelectedTagItem(null)}
                                        className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50"
                                        disabled={isWritingTag}
                                    >
                                        ย้อนกลับ
                                    </button>
                                    <button 
                                        onClick={handleRegisterTag}
                                        disabled={isWritingTag}
                                        className={`flex-1 px-4 py-2 font-semibold rounded-lg text-white shadow-sm flex items-center justify-center gap-2 ${isWritingTag ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                    >
                                        {isWritingTag ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                กำลังบันทึก...
                                            </>
                                        ) : (
                                            'บันทึกข้อมูลลง Tag'
                                        )}
                                    </button>
                                </>
                            ) : (
                                <button 
                                    onClick={onCloseTagModal}
                                    className="w-full px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300"
                                >
                                    ปิด
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
