
import React, { useState, useMemo, useRef } from 'react';
import type { StockItem } from '../types';
import Swal from 'sweetalert2';
import { StockItemModal } from './StockItemModal';
import { AdjustStockModal } from './AdjustStockModal';
import { functionsService } from '../services/firebaseFunctionsService';

// Declare XLSX to inform TypeScript that it's available globally from the script tag
declare var XLSX: any;

interface StockManagementProps {
    stockItems: StockItem[];
    setStockItems: React.Dispatch<React.SetStateAction<StockItem[]>>;
    stockCategories: string[];
    setStockCategories: React.Dispatch<React.SetStateAction<string[]>>;
    stockUnits: string[];
    setStockUnits: React.Dispatch<React.SetStateAction<string[]>>;
}

export const StockManagement: React.FC<StockManagementProps> = ({
    stockItems,
    setStockItems,
    stockCategories,
    setStockCategories,
    stockUnits,
    setStockUnits,
}) => {
    const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
    const [searchTerm, setSearchTerm] = useState('');
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filteredItems = useMemo(() => {
        const items = Array.isArray(stockItems) ? stockItems : [];
        const categoryFiltered = selectedCategory === 'ทั้งหมด'
            ? items
            : items.filter(item => item.category === selectedCategory);
        
        if (!searchTerm.trim()) {
            return categoryFiltered;
        }

        return categoryFiltered.filter(item => 
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [stockItems, selectedCategory, searchTerm]);

    const handleOpenItemModal = (item: StockItem | null) => {
        setSelectedItem(item);
        setIsItemModalOpen(true);
    };

    const handleOpenAdjustModal = (item: StockItem) => {
        setSelectedItem(item);
        setIsAdjustModalOpen(true);
    };

    const handleSaveItem = async (itemToSave: Omit<StockItem, 'id'> & { id?: number }) => {
        let success = false;
        try {
            if (itemToSave.id) {
                // This will fail because the cloud function doesn't exist, triggering the catch block.
                await functionsService.updateStockItem({
                    itemId: itemToSave.id,
                    name: itemToSave.name,
                    category: itemToSave.category,
                    unit: itemToSave.unit,
                    reorderPoint: itemToSave.reorderPoint
                });
            } else {
                // This will also fail, triggering the catch block.
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
            // --- Client-side fallback logic ---
            setStockItems(prev => {
                const itemWithTimestamp = { ...itemToSave, lastUpdated: Date.now() };
                if (itemToSave.id) { // Update existing item
                    return prev.map(i => i.id === itemToSave.id ? { ...i, ...itemWithTimestamp } as StockItem : i);
                }
                // Add new item
                // Robust ID generation: handle empty array and ensure valid number
                const maxId = prev.reduce((max, item) => Math.max(max, (item.id || 0)), 0);
                const newId = maxId + 1;
                
                const newItem: StockItem = {
                    id: newId,
                    name: itemToSave.name,
                    category: itemToSave.category,
                    imageUrl: itemToSave.imageUrl || '',
                    quantity: itemToSave.quantity,
                    unit: itemToSave.unit,
                    reorderPoint: itemToSave.reorderPoint,
                    lastUpdated: Date.now(),
                    orderDate: itemToSave.orderDate,
                    receivedDate: itemToSave.receivedDate
                };
                
                return [...prev, newItem];
            });
            success = true; // Mark as successful because fallback worked.
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
        try {
            // This will fail, triggering the catch block.
            await functionsService.adjustStockQuantity({
                itemId: itemToAdjust.id,
                adjustment: adjustment
            });
            success = true;
        } catch (e: any) {
             console.warn("Backend function for stock adjustment failed or not implemented. Falling back to direct client-side DB write.", e);
             // --- Client-side fallback logic ---
             setStockItems(prev => prev.map(i => 
                i.id === itemToAdjust.id 
                ? { ...i, quantity: i.quantity + adjustment, lastUpdated: Date.now() } 
                : i
            ));
            success = true;
        }

        if (success) {
            setIsAdjustModalOpen(false);
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'ปรับปรุงสต็อกแล้ว',
                showConfirmButton: false,
                timer: 1500
            });
        } else {
             Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถปรับสต็อกได้', 'error');
        }
    };

    const handleDeleteItem = async (itemId: number) => {
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
                    // This will fail, triggering the catch block.
                    await functionsService.deleteStockItem({ itemId });
                    success = true;
                } catch (e: any) {
                    console.warn("Backend function for stock deletion failed or not implemented. Falling back to direct client-side DB write.", e);
                    // --- Client-side fallback logic ---
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
        if (item.quantity <= 0) return { text: 'หมด', color: 'bg-red-200 text-red-800' };
        if (item.quantity <= item.reorderPoint) return { text: 'ใกล้หมด', color: 'bg-yellow-200 text-yellow-800' };
        return { text: 'มีของ', color: 'bg-green-200 text-green-800' };
    };

    const handleExport = () => {
        const dataToExport = stockItems.map(item => ({
            'id': item.id,
            'ชื่อวัตถุดิบ': item.name,
            'หมวดหมู่': item.category,
            'จำนวนคงเหลือ': item.quantity,
            'หน่วยนับ': item.unit,
            'จุดสั่งซื้อขั้นต่ำ': item.reorderPoint
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
                if (json.length === 0 || !expectedHeaders.every(header => Object.keys(json[0]).includes(header))) {
                    Swal.fire({
                        icon: 'error',
                        title: 'รูปแบบไฟล์ไม่ถูกต้อง',
                        text: 'กรุณาใช้ไฟล์ Excel ที่มีรูปแบบเดียวกับไฟล์ที่ export จากระบบนี้เท่านั้น',
                    });
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                const newStockItemsMap = new Map<number, StockItem>();
                
                for (const row of json) {
                    const id = Number(row.id);
                    const quantity = Number(row['จำนวนคงเหลือ']);
                    const reorderPoint = Number(row['จุดสั่งซื้อขั้นต่ำ']);

                    if (isNaN(id) || isNaN(quantity) || isNaN(reorderPoint) || !row['ชื่อวัตถุดิบ'] || !row['หน่วยนับ']) {
                        throw new Error(`ข้อมูลในไฟล์ไม่ถูกต้อง แถวที่มี ID: ${row.id || 'N/A'} มีข้อมูลผิดพลาด`);
                    }

                    newStockItemsMap.set(id, {
                        id: id,
                        name: String(row['ชื่อวัตถุดิบ']),
                        category: String(row['หมวดหมู่']),
                        quantity: quantity,
                        unit: String(row['หน่วยนับ']),
                        reorderPoint: reorderPoint,
                        lastUpdated: Date.now(),
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

    // Format helper
    const formatQty = (qty: number, unit: string) => {
        if (unit === 'กิโลกรัม') {
            return qty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return qty.toLocaleString();
    };

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    return (
        <>
            <div className="h-full flex flex-col bg-gray-50 md:bg-white">
                <header className="p-4 sm:p-6 border-b border-gray-200 bg-white flex-shrink-0">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <h1 className="text-3xl font-bold text-gray-800">จัดการสต็อกสินค้า</h1>
                        <div className="flex items-center gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImport}
                                className="hidden"
                                accept=".xlsx, .xls"
                            />
                            <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-full hover:bg-green-700 whitespace-nowrap text-sm">
                                Export Excel
                            </button>
                             <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-full hover:bg-purple-700 whitespace-nowrap text-sm">
                                Import Excel
                            </button>
                            <button onClick={() => handleOpenItemModal(null)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 whitespace-nowrap">
                                + เพิ่มรายการ
                            </button>
                        </div>
                    </div>
                     <div className="mt-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div className="relative w-full sm:max-w-xs">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                            </span>
                            <input
                                type="text"
                                placeholder="ค้นหาวัตถุดิบ..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {stockCategories.map(category => (
                                <button
                                    key={category}
                                    onClick={() => setSelectedCategory(category)}
                                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${selectedCategory === category ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto pb-24">
                     {/* Desktop Header */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 text-sm text-gray-700 uppercase bg-gray-100 border-b font-bold sticky top-0 z-10 shadow-sm">
                        <div className="col-span-1">รูปภาพ</div>
                        <div className="col-span-2">ชื่อวัตถุดิบ</div>
                        <div className="col-span-1">หมวดหมู่</div>
                        <div className="col-span-2 text-center">วันที่สั่ง/รับ</div>
                        <div className="col-span-2 text-right">จำนวนคงเหลือ</div>
                        <div className="col-span-2 text-right">จุดสั่งซื้อ</div>
                        <div className="col-span-1 text-center">สถานะ</div>
                        <div className="col-span-1 text-center">จัดการ</div>
                    </div>

                    {/* Item List */}
                    <div className="space-y-3 md:space-y-0 p-3 md:p-0">
                        {filteredItems.length > 0 ? filteredItems.map((item, index) => {
                            const status = getStatus(item);
                            // Determine background color for zebra striping (alternating rows)
                            const rowBgClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                            
                            return (
                                <div key={item.id} className={`md:grid md:grid-cols-12 md:gap-4 md:px-6 md:items-center ${rowBgClass} md:border-b hover:bg-blue-50 rounded-lg shadow-sm md:shadow-none md:rounded-none transition-colors duration-150`}>
                                    
                                    {/* Mobile/Tablet Card Layout */}
                                    <div className="md:hidden p-4 space-y-3 bg-white">
                                        <div className="flex justify-between items-start gap-3">
                                            <img src={item.imageUrl || "https://placehold.co/100?text=No+Image"} alt={item.name} className="w-16 h-16 object-cover rounded-md border border-gray-200 flex-shrink-0" onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"} />
                                            <div className="flex-1">
                                                <h3 className="font-bold text-xl text-gray-900">{item.name}</h3>
                                                <p className="text-base text-gray-500">หมวดหมู่: {item.category}</p>
                                            </div>
                                            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${status.color}`}>{status.text}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                            <div>
                                                <span className="font-semibold block text-xs text-gray-400">สั่งของ</span>
                                                {formatDate(item.orderDate)}
                                            </div>
                                            <div className="text-right">
                                                <span className="font-semibold block text-xs text-gray-400">รับของ</span>
                                                {formatDate(item.receivedDate)}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 text-base pt-2 border-t gap-2">
                                            <div>
                                                <p className="text-gray-500">คงเหลือ</p> 
                                                <p className="font-semibold text-gray-800">{formatQty(item.quantity, item.unit)} {item.unit}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">จุดสั่งซื้อ</p>
                                                <p className="font-semibold text-gray-800">{formatQty(item.reorderPoint, item.unit)} {item.unit}</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-3 pt-3 border-t">
                                            <button onClick={() => handleOpenAdjustModal(item)} className="text-base font-medium text-green-600 hover:underline">ปรับสต็อก</button>
                                            <button onClick={() => handleOpenItemModal(item)} className="text-base font-medium text-blue-600 hover:underline">แก้ไข</button>
                                            <button onClick={() => handleDeleteItem(item.id)} className="text-base font-medium text-red-600 hover:underline">ลบ</button>
                                        </div>
                                    </div>

                                    {/* Desktop Table Row Layout */}
                                    <div className="hidden md:block md:col-span-1 md:py-4">
                                        <img src={item.imageUrl || "https://placehold.co/100?text=No+Image"} alt={item.name} className="w-12 h-12 object-cover rounded-md border border-gray-200" onError={(e) => e.currentTarget.src = "https://placehold.co/100?text=Error"} />
                                    </div>
                                    <div className="hidden md:block md:col-span-2 md:py-4 md:font-medium md:text-lg md:text-gray-900 md:whitespace-nowrap">{item.name}</div>
                                    <div className="hidden md:block md:col-span-1 md:py-4">
                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800 truncate block text-center">
                                            {item.category}
                                        </span>
                                    </div>
                                    <div className="hidden md:block md:col-span-2 md:py-4 text-center">
                                        <div className="text-xs text-gray-500">
                                            <div className="flex justify-between px-4"><span>สั่ง:</span> <span className="font-medium text-gray-800">{formatDate(item.orderDate)}</span></div>
                                            <div className="flex justify-between px-4 mt-1"><span>รับ:</span> <span className="font-medium text-gray-800">{formatDate(item.receivedDate)}</span></div>
                                        </div>
                                    </div>
                                    {/* Quantity Column */}
                                    <div className="hidden md:block md:col-span-2 md:py-4 md:text-right">
                                        <span className="text-xl font-bold text-gray-900">{formatQty(item.quantity, item.unit)}</span>
                                        <span className="text-base text-gray-600 ml-1">{item.unit}</span>
                                    </div>
                                    {/* Reorder Point Column - Updated to match Quantity style */}
                                    <div className="hidden md:block md:col-span-2 md:py-4 md:text-right">
                                        <span className="text-xl font-bold text-gray-900">{formatQty(item.reorderPoint, item.unit)}</span>
                                        <span className="text-base text-gray-600 ml-1">{item.unit}</span>
                                    </div>
                                    
                                    <div className="hidden md:flex md:col-span-1 md:py-4 md:justify-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.color} whitespace-nowrap`}>{status.text}</span>
                                    </div>
                                    <div className="hidden md:block md:col-span-1 md:py-4 md:text-center md:space-x-2 text-sm">
                                        <button onClick={() => handleOpenAdjustModal(item)} className="font-medium text-green-600 hover:text-green-800" title="ปรับ">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                        </button>
                                        <button onClick={() => handleOpenItemModal(item)} className="font-medium text-blue-600 hover:text-blue-800" title="แก้ไข">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                        </button>
                                        <button onClick={() => handleDeleteItem(item.id)} className="font-medium text-red-600 hover:text-red-800" title="ลบ">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-16 text-gray-500">
                                <p>ไม่พบรายการวัตถุดิบที่ตรงกับเงื่อนไข</p>
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
        </>
    );
};
