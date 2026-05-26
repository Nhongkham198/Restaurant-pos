
import React, { useState, useEffect, useRef } from 'react';

interface ThaiVirtualKeyboardProps {
    onKeyPress: (key: string) => void;
    onBackspace: () => void;
    onClose: () => void;
    onClear: () => void;
}

export const ThaiVirtualKeyboard: React.FC<ThaiVirtualKeyboardProps> = ({ onKeyPress, onBackspace, onClose, onClear }) => {
    const [isShift, setIsShift] = useState(false);
    
    // Initial position: Centered horizontally, near bottom
    const [position, setPosition] = useState(() => ({ 
        x: Math.max(0, window.innerWidth / 2 - 300), 
        y: Math.max(0, window.innerHeight - 320) 
    }));
    
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Only allow dragging from the header
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        dragOffset.current = {
            x: clientX - position.x,
            y: clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent scrolling while dragging
            
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            
            setPosition({
                x: clientX - dragOffset.current.x,
                y: clientY - dragOffset.current.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleMouseMove, { passive: false });
            window.addEventListener('touchend', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging]);

    // Detect if a Thai character is a combining vowel, tone, or mark
    const isThaiCombining = (char: string) => {
        if (!char || char.length !== 1) return false;
        const code = char.charCodeAt(0);
        return (code >= 0x0e31 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);
    };

    // Prepend dotted circle (◌) to combining signs for rendering/guidance feedback
    const getDisplayChar = (char: string) => {
        if (!char) return '';
        if (isThaiCombining(char)) {
            return `◌${char}`;
        }
        return char;
    };

    // Standard Kedmanee Layout (Modified to use Arabic numbers)
    const rows = [
        // Row 1
        [
            { normal: 'ๅ', shift: '+' }, { normal: '/', shift: '1' }, { normal: '-', shift: '2' }, { normal: 'ภ', shift: '3' },
            { normal: 'ถ', shift: '4' }, { normal: 'ุ', shift: 'ู' }, { normal: 'ึ', shift: '฿' }, { normal: 'ค', shift: '5' },
            { normal: 'ต', shift: '6' }, { normal: 'จ', shift: '7' }, { normal: 'ข', shift: '8' }, { normal: 'ช', shift: '9' }
        ],
        // Row 2
        [
            { normal: 'ๆ', shift: '0' }, { normal: 'ไ', shift: '๊' }, { normal: 'ำ', shift: 'ฎ' }, { normal: 'พ', shift: 'ฑ' },
            { normal: 'ะ', shift: 'ธ' }, { normal: 'ั', shift: 'ํ' }, { normal: 'ี', shift: '๊' }, { normal: 'ร', shift: 'ณ' },
            { normal: 'น', shift: 'ฯ' }, { normal: 'ย', shift: 'ญ' }, { normal: 'บ', shift: 'ฐ' }, { normal: 'ล', shift: 'ฅ' }
        ],
        // Row 3
        [
            { normal: 'ฟ', shift: 'ฤ' }, { normal: 'ห', shift: 'ฆ' }, { normal: 'ก', shift: 'ฏ' }, { normal: 'ด', shift: 'โ' },
            { normal: 'เ', shift: 'ฌ' }, { normal: '้', shift: '็' }, { normal: '่', shift: '๋' }, { normal: 'า', shift: 'ษ' },
            { normal: 'ส', shift: 'ศ' }, { normal: 'ว', shift: 'ซ' }, { normal: 'ง', shift: '.' }
        ],
        // Row 4
        [
            { normal: 'ผ', shift: '(' }, { normal: 'ป', shift: ')' }, { normal: 'แ', shift: 'ฉ' }, { normal: 'อ', shift: 'ฮ' },
            { normal: 'ิ', shift: 'ฺ' }, { normal: 'ื', shift: '์' }, { normal: 'ท', shift: '?' }, { normal: 'ม', shift: 'ฒ' },
            { normal: 'ใ', shift: 'ฬ' }, { normal: 'ฝ', shift: 'ฦ' }
        ]
    ];

    return (
        <div 
            className="fixed bg-[#dee2e6] border border-gray-300 rounded-[1.5rem] p-4 shadow-2xl z-[100] select-none font-sans"
            style={{ 
                left: position.x, 
                top: position.y,
                width: 'max-content',
                maxWidth: '100vw'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex flex-col gap-1.5 md:gap-2">
                {/* Header / Actions - Drag Handle */}
                <div 
                    className="flex justify-between items-center bg-[#cfd4da]/40 border border-gray-300/25 px-4 py-2 rounded-2xl mb-2 cursor-move hover:bg-[#cfd4da]/60 transition-colors"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                    title="ลากเพื่อย้ายตำแหน่ง"
                >
                    <span className="text-[11px] sm:text-xs text-[#495057] font-black uppercase flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        THAI KEYBOARD (KEDMANEE)
                    </span>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-200/80 rounded-full cursor-pointer transition-colors" 
                        title="ปิดคีย์บอร์ด"
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {rows.map((row, rowIndex) => (
                    <div key={rowIndex} className="flex justify-center gap-1 sm:gap-1.5">
                        {row.map((key, keyIndex) => (
                            <button
                                key={keyIndex}
                                type="button"
                                onClick={() => onKeyPress(isShift ? key.shift : key.normal)}
                                className="relative w-11 h-11 sm:w-12 sm:h-12 bg-white rounded-lg sm:rounded-xl shadow-xs border border-[#ced4da] hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                            >
                                {/* Shifted character (Top-Left) */}
                                <span className={`absolute top-1 left-1.5 transition-all duration-150 ${
                                    isShift 
                                        ? 'text-xs sm:text-base font-extrabold text-[#212529]' 
                                        : 'text-[8px] sm:text-[10px] font-semibold text-slate-400'
                                }`}>
                                    {getDisplayChar(key.shift)}
                                </span>
                                {/* Unshifted character (Bottom-Right) */}
                                <span className={`absolute bottom-1 right-2 transition-all duration-150 ${
                                    isShift 
                                        ? 'text-[8px] sm:text-[10px] font-semibold text-slate-400' 
                                        : 'text-xs sm:text-base font-extrabold text-[#212529]'
                                }`}>
                                    {getDisplayChar(key.normal)}
                                </span>
                            </button>
                        ))}
                    </div>
                ))}

                {/* Control Row */}
                <div className="flex justify-center gap-1.5 mt-1">
                    <button
                        type="button"
                        onClick={() => setIsShift(!isShift)}
                        className={`w-18 sm:w-26 h-11 sm:h-12 text-xs sm:text-sm font-extrabold rounded-lg sm:rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            isShift 
                                ? 'bg-[#51555B] text-white border-[#51555B] shadow-md shadow-gray-400/50' 
                                : 'bg-[#cbd2da] hover:bg-[#b8c1cc] text-[#212529] border-gray-300'
                        }`}
                    >
                        Shift
                    </button>
                    <button
                        type="button"
                        onClick={() => onKeyPress(' ')}
                        className="flex-grow h-11 sm:h-12 bg-white hover:bg-slate-50 active:bg-slate-100 rounded-lg sm:rounded-xl border border-gray-300 shadow-xs text-slate-700 font-extrabold text-xs sm:text-sm flex items-center justify-center cursor-pointer active:scale-95 transition-all max-w-md"
                    >
                        Space
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        className="w-18 sm:w-26 h-11 sm:h-12 bg-red-105 hover:bg-rose-150 border border-red-200 text-rose-700 font-extrabold text-xs sm:text-sm rounded-lg sm:rounded-xl transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-xs"
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        onClick={onBackspace}
                        className="w-18 sm:w-26 h-11 sm:h-12 bg-[#cbd2da] hover:bg-[#b8c1cc] border border-gray-300 rounded-lg sm:rounded-xl transition-all flex items-center justify-center cursor-pointer active:scale-95 font-bold text-slate-800"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px] sm:h-5 sm:w-5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414A2 2 0 0010.828 19H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
