
import React, { useState } from 'react';
import type { View, NavItem } from '../types';

interface BottomNavBarProps {
    items: NavItem[];
    currentView: View;
    onViewChange: (view: View) => void;
}

const BottomNavItem: React.FC<{ item: NavItem; isActive: boolean; onClick: () => void; }> = ({ item, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            disabled={item.disabled}
            className={`flex flex-col items-center justify-center w-full pt-2 pb-1 text-center transition-colors duration-200 ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'
            } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <div className="relative">
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-2 -right-3 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white px-1">
                        {item.badge > 99 ? '99+' : item.badge}
                    </span>
                )}
            </div>
            <span className="text-xs mt-1">{item.label}</span>
        </button>
    );
};


export const BottomNavBar: React.FC<BottomNavBarProps> = ({ items, currentView, onViewChange }) => {
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    
    const moreItem = items.find(item => item.id === 'more');

    const handleItemClick = (item: NavItem) => {
        if (item.id === 'more') {
            setIsMoreMenuOpen(!isMoreMenuOpen);
        } else {
            setIsMoreMenuOpen(false);
            if (item.view) {
                onViewChange(item.view);
            } else if (item.onClick) {
                item.onClick();
            }
        }
    };
    
    return (
        <>
            {isMoreMenuOpen && moreItem?.subItems && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-40 z-40 md:hidden"
                    onClick={() => setIsMoreMenuOpen(false)}
                >
                     <div 
                        className="absolute bottom-20 right-4 bg-white rounded-lg shadow-xl w-56 p-2"
                        onClick={e => e.stopPropagation()}
                     >
                         <ul>
                            {moreItem.subItems.map(subItem => (
                                <li key={subItem.id}>
                                    <button 
                                        onClick={() => handleItemClick(subItem)}
                                        className="w-full text-left flex items-center gap-3 px-4 py-3 text-gray-700 rounded-md hover:bg-gray-100"
                                    >
                                        {subItem.icon}
                                        <span>{subItem.label}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-2px_5px_rgba(0,0,0,0.05)] grid grid-cols-5 md:hidden">
                {items.map(item => (
                    <BottomNavItem
                        key={item.id}
                        item={item}
                        isActive={currentView === item.view || (item.id === 'more' && isMoreMenuOpen)}
                        onClick={() => handleItemClick(item)}
                    />
                ))}
            </nav>
        </>
    );
};
