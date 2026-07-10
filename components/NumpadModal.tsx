
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface NumpadModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialValue: number | string; // Allow string initial value
    onSubmit: (value: string) => void; // Return string to preserve leading zeros
    title: string;
    allowLeadingZeros?: boolean;
}

const NumpadButton: React.FC<{ value: string; onClick: (value: string) => void; className?: string; children?: React.ReactNode }> = ({ value, onClick, className = '', children }) => (
    <button type="button" onClick={() => onClick(value)} className={`py-4 text-2xl font-bold text-gray-800 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${className}`}>
        {children || value}
    </button>
);

export const NumpadModal: React.FC<NumpadModalProps> = ({ isOpen, onClose, initialValue, onSubmit, title, allowLeadingZeros = false }) => {
    const [currentValue, setCurrentValue] = useState<string>('0');

    useEffect(() => {
        if (isOpen) {
            // Format initial value to string, preserving decimals if any
            setCurrentValue(String(initialValue));
        }
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    const handleInput = (digit: string) => {
        if (digit === '.') {
            if (currentValue.includes('.')) return; // Prevent double dots
            setCurrentValue(currentValue + '.');
            return;
        }

        // If not allowing leading zeros (default numeric mode), replace '0' with new digit
        if (currentValue === '0' && !allowLeadingZeros) {
            setCurrentValue(digit);
        } else {
            if (currentValue.length < 10) { // Limit digits
                setCurrentValue(currentValue + digit);
            }
        }
    };

    const handleBackspace = () => {
        const newValue = currentValue.slice(0, -1);
        if (newValue.length === 0) {
            // If allowing leading zeros, allow empty string. Otherwise default to '0'.
            setCurrentValue(allowLeadingZeros ? '' : '0');
        } else {
            setCurrentValue(newValue);
        }
    };
    
    const handleClear = () => {
        setCurrentValue(allowLeadingZeros ? '' : '0');
    };

    const handleConfirm = () => {
        // Return as string to preserve leading zeros (e.g. "055")
        onSubmit(currentValue);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <motion.div 
                drag
                dragMomentum={false}
                dragElastic={0.1}
                className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 max-w-xs w-full cursor-grab active:cursor-grabbing select-none"
                onClick={e => e.stopPropagation()}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.15 }}
            >
                {/* Drag Handle & Header */}
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">Drag to move / ลากเพื่อย้าย</span>
                        <h2 className="text-sm font-bold text-gray-800 line-clamp-1">{title}</h2>
                    </div>
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="bg-gray-100 text-gray-900 text-right text-4xl font-mono font-bold p-4 rounded-lg mb-4 h-20 overflow-x-auto break-all flex items-center justify-end">
                    {currentValue}
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(val => 
                        <NumpadButton key={val} value={val} onClick={handleInput} />
                    )}
                    <NumpadButton value="C" onClick={handleClear} className="text-red-600 font-mono">C</NumpadButton>
                    <NumpadButton value="0" onClick={handleInput}>0</NumpadButton>
                    <NumpadButton value="." onClick={handleInput}>.</NumpadButton>
                </div>
                
                <div className="mt-2 grid grid-cols-1">
                    <NumpadButton value="backspace" onClick={handleBackspace} className="py-2">
                        <span className="text-2xl font-sans" aria-label="Backspace">⌫</span>
                    </NumpadButton>
                </div>
                
                <button
                    type="button"
                    onClick={handleConfirm}
                    className="mt-4 w-full px-4 py-3 bg-blue-600 text-white text-lg font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-200"
                >
                    ตกลง
                </button>
            </motion.div>
        </div>
    );
};
