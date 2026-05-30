import React from 'react';
import { motion } from 'framer-motion';
import type { View, NavItem } from '../types';

interface BottomNavBarProps {
    items: NavItem[];
    currentView: View;
    onViewChange: (view: View) => void;
}

const BottomNavItem: React.FC<{ item: NavItem; isActive: boolean; onClick: () => void; }> = ({ item, isActive, onClick }) => {
    // Dynamic soft haptic feedback on touch for native feel
    const triggerHaptic = () => {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            try {
                window.navigator.vibrate(10);
            } catch (e) {
                // Ignore if permission denied or unsupported in context
            }
        }
    };

    const handlePress = () => {
        triggerHaptic();
        onClick();
    };

    return (
        <motion.button
            whileTap={item.disabled ? {} : { scale: 0.90, y: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 20 }}
            onClick={handlePress}
            disabled={item.disabled}
            className={`relative flex flex-col items-center justify-center p-2 rounded-xl h-full w-full overflow-hidden select-none touch-manipulation focus:outline-none ${
                item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            }`}
        >
            {/* Sliding Shared Layout Active Capsule */}
            {isActive && (
                <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-gradient-to-tr from-gray-700 to-gray-600 rounded-xl shadow-[inset_0_1px_2px_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.15)] border border-gray-600/30"
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 28
                    }}
                />
            )}

            {/* Inactive Subtle Background */}
            {!isActive && (
                <div className="absolute inset-0 bg-gray-800/40 rounded-xl transition-all duration-200 active:bg-gray-800/70" />
            )}

            {/* Icon & Label Content */}
            <div className="relative z-10 flex flex-col items-center justify-center">
                <motion.div 
                    className="relative w-5 h-5 mb-1 flex items-center justify-center"
                    animate={{ 
                        scale: isActive ? 1.12 : 1,
                        color: isActive ? "#ffffff" : "#9ca3af" 
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                    {item.icon}
                    {item.badge !== undefined && item.badge > 0 && (
                        <motion.span 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-[9px] font-black text-white px-1 shadow-md border border-gray-900"
                        >
                            {item.badge > 99 ? '99+' : item.badge}
                        </motion.span>
                    )}
                </motion.div>
                
                <motion.span 
                    className="text-[10px] font-bold leading-none tracking-tight whitespace-nowrap"
                    animate={{ 
                        color: isActive ? "#ffffff" : "#9ca3af",
                        fontWeight: isActive ? 700 : 500
                    }}
                    transition={{ duration: 0.15 }}
                >
                    {item.label}
                </motion.span>
            </div>
        </motion.button>
    );
};

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ items, currentView, onViewChange }) => {
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const activeIndex = items.findIndex(item => currentView === item.view);

    // Fluid viewport alignment helper to automatically scroll selected tabs smoothly into center display
    React.useEffect(() => {
        if (scrollContainerRef.current && activeIndex !== -1) {
            const container = scrollContainerRef.current;
            const activeChild = container.children[activeIndex] as HTMLElement;
            if (activeChild) {
                const containerWidth = container.clientWidth;
                const childWidth = activeChild.clientWidth;
                const childLeft = activeChild.offsetLeft;
                const targetScrollLeft = childLeft - (containerWidth / 2) + (childWidth / 2);
                
                container.scrollTo({
                    left: targetScrollLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeIndex]);

    const handleItemClick = (item: NavItem) => {
        if (item.view) {
            onViewChange(item.view);
        } else if (item.onClick) {
            item.onClick();
        }
    };
    
    return (
        <nav 
            ref={scrollContainerRef}
            className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-b from-gray-950 to-gray-900 border-t border-gray-800/80 p-2 flex overflow-x-auto gap-2.5 snap-x snap-mandatory scroll-smooth hide-scrollbar select-none shadow-[0_-8px_24px_rgba(0,0,0,0.3)] pb-safe"
        >
            <style>{`
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .pb-safe {
                    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
                }
            `}</style>
            {items.map((item) => (
                <div 
                    key={item.id} 
                    className="flex-shrink-0 w-[72px] h-[52px] snap-center"
                >
                    <BottomNavItem
                        item={item}
                        isActive={currentView === item.view}
                        onClick={() => handleItemClick(item)}
                    />
                </div>
            ))}
        </nav>
    );
};
