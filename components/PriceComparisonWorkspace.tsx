
import React, { useState, useMemo } from 'react';
import { StockItem } from '../types';
import { useData } from '../contexts/DataContext';
import { Search, Upload, Plus, Trash2, ArrowUpRight, ArrowDownRight, Image as ImageIcon, X, ZoomIn, ZoomOut, Maximize, Keyboard, Calculator } from 'lucide-react';
import Swal from 'sweetalert2';
import { ThaiVirtualKeyboard } from './ThaiVirtualKeyboard';
import { NumpadModal } from './NumpadModal';

interface ComparisonRow {
    id: string;
    stockItemId: number;
    itemName: string;
    currentPrice: number;
    newPrice: number;
    unit: string;
}

interface PriceComparisonWorkspaceProps {
    stockItems: StockItem[];
}

export const PriceComparisonWorkspace: React.FC<PriceComparisonWorkspaceProps> = ({ stockItems }) => {
    const { latestIngredientPrices, latestImportFilename } = useData();
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [rows, setRows] = useState<ComparisonRow[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isHoveringImage, setIsHoveringImage] = useState(false);
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [isNumpadOpen, setIsNumpadOpen] = useState(false);
    const [editingRowId, setEditingRowId] = useState<string | null>(null);

    const handleKeyboardPress = (key: string) => {
        setSearchTerm(prev => prev + key);
        setIsSearching(true);
    };

    const handleKeyboardBackspace = () => {
        setSearchTerm(prev => prev.slice(0, -1));
        setIsSearching(true);
    };

    const handleKeyboardClear = () => {
        setSearchTerm('');
        setIsSearching(false);
    };

    const handleNumpadSubmit = (value: string) => {
        if (editingRowId) {
            updateNewPrice(editingRowId, Number(value));
        }
    };

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
    const handleZoomOut = () => {
        const newZoom = Math.max(zoomLevel - 0.25, 0.5);
        setZoomLevel(newZoom);
        if (newZoom <= 1) setPosition({ x: 0, y: 0 });
    };
    const handleResetZoom = () => {
        setZoomLevel(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoomLevel <= 1) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || zoomLevel <= 1) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const filteredStockEntries = useMemo(() => {
        if (!searchTerm) return [];
        return stockItems.filter(item => 
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 5);
    }, [searchTerm, stockItems]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setAttachedImage(event.target?.result as string);
                setZoomLevel(1);
                setPosition({ x: 0, y: 0 });
            };
            reader.readAsDataURL(file);
        }
    };

    const addRow = (item: StockItem) => {
        // Find price from the latestIngredientPrices array
        const latestPriceObj = latestIngredientPrices.find(p => (p.name || '').trim() === (item.name || '').trim());
        const currentPrice = latestPriceObj ? latestPriceObj.pricePerUnit : 0;
        
        const newRow: ComparisonRow = {
            id: Math.random().toString(36).substr(2, 9),
            stockItemId: item.id,
            itemName: item.name,
            currentPrice,
            newPrice: 0,
            unit: item.unit
        };
        setRows([...rows, newRow]);
        setSearchTerm('');
        setIsSearching(false);
    };

    const removeRow = (id: string) => {
        setRows(rows.filter(row => row.id !== id));
    };

    const updateNewPrice = (id: string, price: number) => {
        setRows(rows.map(row => row.id === id ? { ...row, newPrice: price } : row));
    };

    const calculateDifference = (row: ComparisonRow) => {
        if (row.currentPrice === 0 || row.newPrice === 0) return { diff: 0, percent: 0 };
        const diff = row.newPrice - row.currentPrice;
        const percent = (diff / row.currentPrice) * 100;
        return { diff, percent };
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-800">เปรียบเทียบราคาวัตถุดิบ</h2>
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-400">แนบรูปใบแจ้งหนี้เพื่อตรวจสอบส่วนต่างราคาในฐานข้อมูล</p>
                        {latestImportFilename && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-medium border border-green-100 uppercase tracking-tighter">
                                ราคาล่าสุด: {latestImportFilename}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors text-sm font-medium">
                        <ImageIcon size={18} />
                        {attachedImage ? 'เปลี่ยนรูปภาพ' : 'แนบรูปภาพใบแจ้งหนี้'}
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                    {rows.length > 0 && (
                        <button 
                            onClick={() => {
                                setRows([]);
                                setAttachedImage(null);
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Side: Image Preview */}
                <div 
                    className={`transition-all duration-500 bg-gray-100 border-r border-gray-200 flex flex-col items-center justify-center relative ${attachedImage ? 'w-1/2' : 'w-0 overflow-hidden'}`}
                    onMouseEnter={() => setIsHoveringImage(true)}
                    onMouseLeave={() => setIsHoveringImage(false)}
                >
                    {attachedImage ? (
                        <>
                            <div 
                                className={`flex-1 w-full overflow-hidden flex items-center justify-center p-4 select-none ${zoomLevel > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                            >
                                <img 
                                    src={attachedImage} 
                                    alt="Invoice" 
                                    className="max-w-full max-h-full object-contain transition-transform duration-200 pointer-events-none" 
                                    style={{ 
                                        transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
                                        transformOrigin: 'center center' 
                                    }}
                                />
                            </div>

                            {/* Zoom Controls (Auto-hide) */}
                            <div className={`absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 transition-all duration-300 ${isHoveringImage ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
                                <button 
                                    onClick={handleZoomIn}
                                    title="ซูมเข้า"
                                    className="p-3 bg-white/90 backdrop-blur shadow-md rounded-full text-gray-600 hover:text-blue-600 hover:bg-white transition-all transform hover:scale-110 border border-gray-100"
                                >
                                    <ZoomIn size={20} />
                                </button>
                                <button 
                                    onClick={handleResetZoom}
                                    title="ขนาดปกติ"
                                    className="p-3 bg-white/90 backdrop-blur shadow-md rounded-full text-gray-600 hover:text-blue-600 hover:bg-white transition-all transform hover:scale-110 border border-gray-100"
                                >
                                    <Maximize size={20} />
                                </button>
                                <button 
                                    onClick={handleZoomOut}
                                    title="ซูมออก"
                                    className="p-3 bg-white/90 backdrop-blur shadow-md rounded-full text-gray-600 hover:text-blue-600 hover:bg-white transition-all transform hover:scale-110 border border-gray-100"
                                >
                                    <ZoomOut size={20} />
                                </button>
                            </div>

                            <button 
                                onClick={() => {
                                    setAttachedImage(null);
                                    setZoomLevel(1);
                                    setPosition({ x: 0, y: 0 });
                                }}
                                className={`absolute top-4 right-4 p-2 bg-white/80 backdrop-blur shadow-sm rounded-full text-gray-500 hover:text-red-500 z-10 transition-all duration-300 ${isHoveringImage ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}
                            >
                                <X size={18} />
                            </button>
                        </>
                    ) : null}
                </div>

                {/* Right Side: Comparison Tool */}
                <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                    {/* Search Field */}
                    <div className="relative mb-6">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input 
                                    type="text"
                                    placeholder="พิมพ์ชื่อวัตถุดิบเพื่อเริ่มเปรียบเทียบ..."
                                    className="w-full pl-12 pr-12 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all text-sm"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setIsSearching(true);
                                    }}
                                    onFocus={() => setIsSearching(true)}
                                />
                                <button
                                    onClick={() => setIsKeyboardOpen(!isKeyboardOpen)}
                                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors ${isKeyboardOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                                >
                                    <Keyboard size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Search Results Dropdown */}
                        {isSearching && searchTerm && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-20 py-2">
                                {filteredStockEntries.length > 0 ? (
                                    filteredStockEntries.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => addRow(item)}
                                            className="w-full px-6 py-3 text-left hover:bg-blue-50 flex justify-between items-center group"
                                        >
                                            <div>
                                                <div className="text-sm font-semibold text-gray-700">{item.name}</div>
                                                <div className="text-xs text-gray-400">{item.category}</div>
                                            </div>
                                            <Plus size={18} className="text-gray-300 group-hover:text-blue-500" />
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-6 py-4 text-center text-sm text-gray-400">ไม่พบรายการวัตถุดิบนี้</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Comparison List */}
                    <div className="space-y-4">
                        {rows.length > 0 ? (
                            rows.map(row => {
                                const { diff, percent } = calculateDifference(row);
                                const isUp = diff > 0;
                                const isDown = diff < 0;

                                return (
                                    <div key={row.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-6 group hover:border-blue-200 transition-all">
                                        <div className="flex-1">
                                            <div className="text-xs text-blue-500 font-bold uppercase tracking-wider mb-1">วัตถุดิบ</div>
                                            <div className="font-bold text-gray-800">{row.itemName}</div>
                                            <div className="text-xs text-gray-400">หน่วย: {row.unit}</div>
                                        </div>

                                        <div className="w-32">
                                            <div className="text-xs text-gray-400 mb-1">ราคาล่าสุดในระบบ</div>
                                            <div className="text-sm font-semibold text-gray-600">฿{row.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                        </div>

                                        <div className="w-40">
                                            <div className="text-xs text-gray-400 mb-1">ราคาใหม่ (ใบแจ้งหนี้)</div>
                                            <div className="relative flex gap-1">
                                                <div className="relative flex-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">฿</span>
                                                    <input 
                                                        type="number"
                                                        value={row.newPrice || ''}
                                                        onChange={(e) => updateNewPrice(row.id, Number(e.target.value))}
                                                        placeholder="0.00"
                                                        className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-gray-800"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setEditingRowId(row.id);
                                                        setIsNumpadOpen(true);
                                                    }}
                                                    className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                                                >
                                                    <Calculator size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="w-32 flex flex-col items-end">
                                            <div className="text-xs text-gray-400 mb-1 text-right">ส่วนต่าง</div>
                                            {row.newPrice > 0 ? (
                                                <div className={`flex items-center gap-1 font-bold text-sm ${isUp ? 'text-red-500' : isDown ? 'text-green-500' : 'text-gray-400'}`}>
                                                    {isUp ? <ArrowUpRight size={16} /> : isDown ? <ArrowDownRight size={16} /> : null}
                                                    {isUp ? '+' : ''}{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    <span className="text-[10px] ml-1">({percent.toFixed(1)}%)</span>
                                                </div>
                                            ) : (
                                                <div className="text-sm font-bold text-gray-200">-</div>
                                            )}
                                        </div>

                                        <button 
                                            onClick={() => removeRow(row.id)}
                                            className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                                <ImageIcon size={64} className="mb-4 opacity-20" />
                                <div className="text-sm">ยังไม่มีรายการที่ต้องการเปรียบเทียบ</div>
                                <p className="text-xs opacity-60">พิมพ์ชื่อวัตถุดิบด้านบนเพื่อเริ่มตรวจสอบราคา</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {isKeyboardOpen && (
                <ThaiVirtualKeyboard 
                    onKeyPress={handleKeyboardPress}
                    onBackspace={handleKeyboardBackspace}
                    onClear={handleKeyboardClear}
                    onClose={() => setIsKeyboardOpen(false)}
                />
            )}

            <NumpadModal 
                isOpen={isNumpadOpen}
                onClose={() => setIsNumpadOpen(false)}
                title="ระบุราคาใหม่"
                initialValue={editingRowId ? rows.find(r => r.id === editingRowId)?.newPrice || 0 : 0}
                onSubmit={handleNumpadSubmit}
            />
        </div>
    );
};
