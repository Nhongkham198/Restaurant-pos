
import React from 'react';
import type { MenuItem } from '../types';
import { MenuItemImage } from './MenuItemImage';

interface MenuItemCardProps {
    item: MenuItem;
    onSelectItem: (item: MenuItem) => void;
    isEditMode: boolean;
    onEdit: (item: MenuItem) => void;
    onDelete: (id: number) => void;
    onDragStart: () => void;
    onDragEnter: () => void;
    onDragEnd: () => void;
    isRecommended: boolean;
    onToggleAvailability: () => void;
    onToggleVisibility?: () => void; // New prop for visibility toggle
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({ 
    item, 
    onSelectItem, 
    isEditMode, 
    onEdit, 
    onDelete, 
    onDragStart, 
    onDragEnter, 
    onDragEnd, 
    isRecommended, 
    onToggleAvailability,
    onToggleVisibility 
}) => {
    // Default to true if undefined
    const isAvailable = item.isAvailable !== false;
    const isVisible = item.isVisible !== false;

    const handleCardClick = () => {
        if (!isEditMode) {
            if (isAvailable) {
                onSelectItem(item);
            }
        }
    };
    
    return (
        <div 
            className={`relative group bg-white rounded-lg shadow-md overflow-hidden flex flex-col border border-gray-200 h-64 
                ${!isEditMode && isAvailable ? 'cursor-pointer hover:shadow-lg hover:border-blue-400 transition-all' : ''} 
                ${isEditMode ? 'cursor-grab' : ''} 
                ${(!isAvailable || !isVisible) && !isEditMode ? 'grayscale opacity-80 cursor-not-allowed' : ''}
            `}
            onClick={handleCardClick}
            draggable={isEditMode}
            onDragStart={isEditMode ? onDragStart : undefined}
            onDragEnter={isEditMode ? onDragEnter : undefined}
            onDragEnd={isEditMode ? onDragEnd : undefined}
            onDragOver={isEditMode ? (e) => e.preventDefault() : undefined}
        >
            <div className="relative h-36">
                <MenuItemImage 
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full"
                />
                {!isAvailable && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                        <span className="text-white font-bold text-2xl border-2 border-white px-4 py-1 rounded rotate-[-15deg] uppercase tracking-wider">
                            หมด
                        </span>
                    </div>
                )}
                {!isVisible && isEditMode && (
                    <div className="absolute top-2 left-2 z-20">
                        <span className="bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded-md shadow-md border border-gray-600">
                            ซ่อนจากลูกค้า
                        </span>
                    </div>
                )}
            </div>

            <div className="p-2 flex flex-col flex-auto justify-between">
                <h3 className="font-semibold text-gray-800 text-base leading-tight min-h-[40px]">{item.name}</h3>
                <div className="flex justify-end items-baseline mt-1 pt-2 border-t border-gray-100">
                     <p className="text-lg font-bold text-blue-600">{item.price.toLocaleString()}<span className="text-sm font-medium"> ฿</span></p>
                </div>
            </div>

            {isRecommended && (
                <div className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 z-20" title="เมนูแนะนำ">
                    <div className="absolute w-full h-full bg-yellow-400 rounded-full animate-ping opacity-75"></div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="relative h-7 w-7 text-yellow-500 drop-shadow-lg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                </div>
            )}

            {isEditMode && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-30 transition-opacity p-2">
                    
                    {/* Toggle Stock Switch */}
                    <div className="flex items-center justify-between gap-2 bg-white/90 px-3 py-1.5 rounded-full shadow-lg cursor-pointer w-36" onClick={(e) => { e.stopPropagation(); onToggleAvailability(); }}>
                        <span className={`text-[10px] font-bold ${isAvailable ? 'text-green-600' : 'text-gray-400'}`}>มีของ</span>
                        <div className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors duration-300 ${isAvailable ? 'bg-green-500' : 'bg-red-500'}`}>
                            <div className={`bg-white w-3 h-3 rounded-full shadow-md transform duration-300 ease-in-out ${isAvailable ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                        <span className={`text-[10px] font-bold ${!isAvailable ? 'text-red-600' : 'text-gray-400'}`}>หมด</span>
                    </div>

                    {/* Toggle Visibility Switch (NEW) */}
                    {onToggleVisibility && (
                        <div className="flex items-center justify-between gap-2 bg-white/90 px-3 py-1.5 rounded-full shadow-lg cursor-pointer w-36" onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}>
                            <span className={`text-[10px] font-bold ${isVisible ? 'text-blue-600' : 'text-gray-400'}`}>ลูกค้าเห็น</span>
                            <div className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors duration-300 ${isVisible ? 'bg-blue-500' : 'bg-gray-400'}`}>
                                <div className={`bg-white w-3 h-3 rounded-full shadow-md transform duration-300 ease-in-out ${isVisible ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className={`text-[10px] font-bold ${!isVisible ? 'text-gray-600' : 'text-gray-400'}`}>ซ่อน</span>
                        </div>
                    )}

                    <div className="flex gap-3 mt-1">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-200 transition-transform active:scale-95" title="แก้ไขรายละเอียด">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-200 transition-transform active:scale-95" title="ลบเมนู">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
