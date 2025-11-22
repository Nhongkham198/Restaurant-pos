import React, { useState, useMemo } from 'react';
import type { MenuItem } from '../types';

interface MenuSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    menuItems: MenuItem[];
    onSelectItem: (item: MenuItem) => void;
}

export const MenuSearchModal: React.FC<MenuSearchModalProps> = ({ isOpen, onClose, menuItems, onSelectItem }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredItems = useMemo(() => {
        if (!searchTerm.trim()) {
            return [];
        }
        return menuItems.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, menuItems]);

    const handleItemClick = (item: MenuItem) => {
        onSelectItem(item);
        // The modal for customization will open, we can close this one.
        onClose(); 
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all flex flex-col" style={{maxHeight: '90vh'}} onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b">
                    <h3 className="text-2xl font-bold text-gray-900">ค้นหาเมนูอาหาร</h3>
                     <div className="relative mt-4">
                         <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            placeholder="พิมพ์ชื่อเมนู..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="p-6 space-y-2 overflow-y-auto flex-1">
                    {filteredItems.length > 0 ? (
                        filteredItems.map(item => (
                            <div
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
                            >
                                <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-md object-cover flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-800">{item.name}</p>
                                    <p className="text-sm text-gray-500">{item.category}</p>
                                </div>
                                <p className="font-bold text-lg text-blue-600">{item.price.toLocaleString()} ฿</p>
                            </div>
                        ))
                    ) : (
                        searchTerm.trim() && <p className="text-center text-gray-500 py-8">ไม่พบเมนูที่ตรงกัน</p>
                    )}
                     {!searchTerm.trim() && (
                        <div className="text-center text-gray-400 py-10">
                            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <p className="mt-2">เริ่มพิมพ์เพื่อค้นหา</p>
                        </div>
                    )}
                </div>

                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-lg border-t">
                    <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold">
                        ปิด
                    </button>
                </div>
            </div>
        </div>
    );
};