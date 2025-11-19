import React from 'react';
import type { MenuItem } from '../types';

interface MenuItemCardProps {
    item: MenuItem;
    onSelectItem: (item: MenuItem) => void;
    isEditMode: boolean;
    onEdit: (item: MenuItem) => void;
    onDelete: (id: number) => void;
    onDragStart: () => void;
    onDragEnter: () => void;
    onDragEnd: () => void;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, onSelectItem, isEditMode, onEdit, onDelete, onDragStart, onDragEnter, onDragEnd }) => {
    const handleCardClick = () => {
        if (!isEditMode) {
            onSelectItem(item);
        }
    };
    
    return (
        <div 
            className={`relative group bg-white rounded-lg shadow-md overflow-hidden flex flex-col border border-gray-200 h-64 ${!isEditMode ? 'cursor-pointer hover:shadow-lg hover:border-blue-400 transition-all' : ''} ${isEditMode ? 'cursor-grab' : ''}`}
            onClick={handleCardClick}
            draggable={isEditMode}
            onDragStart={isEditMode ? onDragStart : undefined}
            onDragEnter={isEditMode ? onDragEnter : undefined}
            onDragEnd={isEditMode ? onDragEnd : undefined}
            onDragOver={isEditMode ? (e) => e.preventDefault() : undefined}
        >
            <div className="h-36 bg-gray-200">
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-2 flex flex-col flex-auto justify-between">
                <h3 className="font-semibold text-gray-800 text-base leading-tight min-h-[40px]">{item.name}</h3>
                <div className="flex justify-end items-baseline mt-1 pt-2 border-t border-gray-100">
                     <p className="text-lg font-bold text-blue-600">{item.price.toLocaleString()}<span className="text-sm font-medium"> ฿</span></p>
                </div>
            </div>
            {isEditMode && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} className="p-3 bg-white rounded-full shadow-lg hover:bg-gray-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-3 bg-white rounded-full shadow-lg hover:bg-gray-200">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            )}
        </div>
    );
};