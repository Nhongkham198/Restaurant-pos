import React, { useState, useMemo, useRef } from 'react';
import type { StockItem } from '../types';
import Swal from 'sweetalert2';
import { StockItemModal } from './StockItemModal';
import { AdjustStockModal } from './AdjustStockModal';

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
        const categoryFiltered = selectedCategory === 'ทั้งหมด'
            ? stockItems
            : stockItems.filter(item => item.category === selectedCategory);
        
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

    const handleSaveItem = (itemToSave: Omit<StockItem, 'id'> & { id?: number }) => {
        setStockItems(prev => {
            const exists = prev.some(i => i.id === itemToSave.id);
            if (exists && itemToSave.id) {
                return prev.map(i => i.id === itemToSave.id ? { ...i, ...itemToSave, lastUpdated: Date.now() } : i);
            }
            const newId = Math.max(0, ...prev.map(i => i.id)) + 1;
            return [...prev, { ...itemToSave, id: newId, lastUpdated: Date.now() }];
        });
        setIsItemModalOpen(false);
    };

    const handleAdjustStock = (itemToAdjust: StockItem, adjustment: number) => {
        setStockItems(prev => prev.map(i => 
            i.id === itemToAdjust.id 
            ? { ...i, quantity: i.quantity + adjustment, lastUpdated: Date.now() } 
            : i
        ));
        setIsAdjustModalOpen(false);
    };

    const handleDeleteItem = (itemId: number) => {
        Swal.fire({
            title: 'คุณแน่ใจหรือไม่?',
            text: "คุณกำลังจะลบรายการนี้ออกจากสต็อก",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ใช่, ลบเลย',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                setStockItems(prev => prev.filter(item => item.id !== itemId));
                Swal.fire('ลบแล้ว!', 'รายการถูกลบออกจากสต็อกแล้ว', 'success');
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

                <div className="flex-1 overflow-y-auto">
                     {/* Desktop Header */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-3 text-xs text-gray-700 uppercase bg-gray-100 border-b">
                        <div className="col-span-3 font-semibold">ชื่อวัตถุดิบ</div>
                        <div className="col-span-2 font-semibold">หมวดหมู่</div>
                        <div className="col-span-2 font-semibold text-right">จำนวนคงเหลือ</div>
                        <div className="col-span-2 font-semibold text-right">จุดสั่งซื้อ</div>
                        <div className="col-span-1 font-semibold text-center">สถานะ</div>
                        <div className="col-span-2 font-semibold text-center">จัดการ</div>
                    </div>

                    {/* Item List */}
                    <div className="space-y-3 md:space-y-0 p-3 md:p-0">
                        {filteredItems.length > 0 ? filteredItems.map(item => {
                            const status = getStatus(item);
                            return (
                                <div key={item.id} className="md:grid md:grid-cols-12 md:gap-4 md:px-6 md:items-center bg-white md:border-b hover:bg-gray-50 rounded-lg shadow-sm md:shadow-none md:rounded-none">
                                    
                                    {/* Mobile/Tablet Card Layout */}
                                    <div className="md:hidden p-4 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>{status.text}</span>
                                        </div>
                                        <p className="text-sm text-gray-500">หมวดหมู่: {item.category}</p>
                                        <div className="grid grid-cols-2 text-sm pt-2 border-t gap-2">
                                            <div>
                                                <p className="text-gray-500">คงเหลือ</p> 
                                                <p className="font-semibold text-gray-800">{item.quantity.toLocaleString()} {item.unit}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">จุดสั่งซื้อ</p>
                                                <p className="font-semibold text-gray-800">{item.reorderPoint.toLocaleString()} {item.unit}</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-3 pt-3 border-t">
                                            <button onClick={() => handleOpenAdjustModal(item)} className="text-sm font-medium text-green-600 hover:underline">ปรับสต็อก</button>
                                            <button onClick={() => handleOpenItemModal(item)} className="text-sm font-medium text-blue-600 hover:underline">แก้ไข</button>
                                            <button onClick={() => handleDeleteItem(item.id)} className="text-sm font-medium text-red-600 hover:underline">ลบ</button>
                                        </div>
                                    </div>

                                    {/* Desktop Table Row Layout */}
                                    <div className="hidden md:block md:col-span-3 md:py-4 md:font-medium md:text-gray-900 md:whitespace-nowrap">{item.name}</div>
                                    <div className="hidden md:block md:col-span-2 md:py-4">
                                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-200 text-gray-800">
                                            {item.category}
                                        </span>
                                    </div>
                                    <div className="hidden md:block md:col-span-2 md:py-4 md:text-right">
                                        <span className="text-base font-bold text-gray-900">{item.quantity.toLocaleString()}</span>
                                        <span className="text-sm text-gray-600 ml-1">{item.unit}</span>
                                    </div>
                                    <div className="hidden md:block md:col-span-2 md:py-4 md:text-right">{item.reorderPoint.toLocaleString()} {item.unit}</div>
                                    <div className="hidden md:flex md:col-span-1 md:py-4 md:justify-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>{status.text}</span>
                                    </div>
                                    <div className="hidden md:block md:col-span-2 md:py-4 md:text-center md:space-x-2">
                                        <button onClick={() => handleOpenAdjustModal(item)} className="font-medium text-green-600 hover:underline">ปรับ</button>
                                        <button onClick={() => handleOpenItemModal(item)} className="font-medium text-blue-600 hover:underline">แก้ไข</button>
                                        <button onClick={() => handleDeleteItem(item.id)} className="font-medium text-red-600 hover:underline">ลบ</button>
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
                // FIX: Pass setStockCategories to allow management of categories from the modal.
                setCategories={setStockCategories}
                units={stockUnits}
                // FIX: Pass the correct 'setStockUnits' prop to the 'setUnits' prop of StockItemModal to resolve a 'Cannot find name' error.
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