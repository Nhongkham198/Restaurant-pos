
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

    // Standard Kedmanee Layout
    const rows = [
        // Row 1
        [
            { normal: 'ๅ', shift: '+' }, { normal: '/', shift: '๑' }, { normal: '-', shift: '๒' }, { normal: 'ภ', shift: '๓' },
            { normal: 'ถ', shift: '๔' }, { normal: 'ุ', shift: 'ู' }, { normal: 'ึ', shift: '฿' }, { normal: 'ค', shift: '๕' },
            { normal: 'ต', shift: '๖' }, { normal: 'จ', shift: '๗' }, { normal: 'ข', shift: '๘' }, { normal: 'ช', shift: '๙' }
        ],
        // Row 2
        [
            { normal: 'ๆ', shift: '๐' }, { normal: 'ไ', shift: '"' }, { normal: 'ำ', shift: 'ฎ' }, { normal: 'พ', shift: 'ฑ' },
            { normal: 'ะ', shift: 'ธ' }, { normal: 'ั', shift: 'ํ' }, { normal: 'ี', shift: '๊' }, { normal: 'ร', shift: 'ณ' },
            { normal: 'น', shift: 'ฯ' }, { normal: 'ย', shift: 'ญ' }, { normal: 'บ', shift: 'ฐ' }, { normal: 'ล', shift: ',' },
            { normal: 'ฃ', shift: 'ฅ' }
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
            className="fixed bg-gray-200 p-2 shadow-2xl z-[100] border border-gray-400 select-none rounded-xl"
            style={{ 
                left: position.x, 
                top: position.y,
                width: 'max-content',
                maxWidth: '100vw'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex flex-col gap-1.5">
                {/* Header / Actions - Drag Handle */}
                <div 
                    className="flex justify-between items-center px-2 py-1 mb-1 cursor-move bg-gray-300 rounded-lg hover:bg-gray-400 transition-colors"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                    title="ลากเพื่อย้ายตำแหน่ง"
                >
                    <span className="text-xs text-gray-700 font-bold uppercase flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                        Thai Keyboard (Kedmanee)
                    </span>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        className="p-1 text-gray-600 hover:text-red-600 hover:bg-gray-200 rounded-full" 
                        title="ปิดคีย์บอร์ด"
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {rows.map((row, rowIndex) => (
                    <div key={rowIndex} className="flex justify-center gap-1.5">
                        {row.map((key, keyIndex) => (
                            <button
                                key={keyIndex}
                                onClick={() => onKeyPress(isShift ? key.shift : key.normal)}
                                className="w-10 h-10 md:w-12 md:h-12 bg-white rounded shadow-sm hover:bg-blue-50 active:bg-blue-100 flex flex-col items-center justify-center border border-gray-300 transition-colors"
                            >
                                <span className="text-[10px] text-gray-400 leading-none mb-0.5">{isShift ? key.normal : key.shift}</span>
                                <span className="text-lg font-bold text-gray-800 leading-none">{isShift ? key.shift : key.normal}</span>
                            </button>
                        ))}
                    </div>
                ))}

                {/* Control Row */}
                <div className="flex justify-center gap-1.5 mt-1">
                    <button
                        onClick={() => setIsShift(!isShift)}
                        className={`px-6 h-10 md:h-12 rounded shadow-sm border font-bold transition-colors ${isShift ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-300 text-gray-700 border-gray-400 hover:bg-gray-400'}`}
                    >
                        Shift
                    </button>
                    <button
                        onClick={() => onKeyPress(' ')}
                        className="flex-grow h-10 md:h-12 bg-white rounded shadow-sm border border-gray-300 hover:bg-gray-50 active:bg-gray-100 max-w-lg text-gray-500 font-medium"
                    >
                        Space
                    </button>
                    <button
                        onClick={onClear}
                        className="px-4 h-10 md:h-12 bg-red-100 text-red-700 rounded shadow-sm border border-red-200 hover:bg-red-200 font-bold"
                    >
                        Clear
                    </button>
                    <button
                        onClick={onBackspace}
                        className="px-6 h-10 md:h-12 bg-gray-300 text-gray-700 rounded shadow-sm border border-gray-400 hover:bg-gray-400 font-bold flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 002.828 0L21 12M3 12l6.414-6.414a2 2 0 012.828 0L21 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
