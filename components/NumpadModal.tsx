
import React, { useState, useEffect } from 'react';

interface NumpadModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialValue: number | string; // Allow string initial value
    onSubmit: (value: string) => void; // Return string to preserve leading zeros
    title: string;
}

const NumpadButton: React.FC<{ value: string; onClick: (value: string) => void; className?: string; children?: React.ReactNode }> = ({ value, onClick, className = '', children }) => (
    <button type="button" onClick={() => onClick(value)} className={`py-4 text-2xl font-bold text-gray-800 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${className}`}>
        {children || value}
    </button>
);

export const NumpadModal: React.FC<NumpadModalProps> = ({ isOpen, onClose, initialValue, onSubmit, title }) => {
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

        if (currentValue === '0') {
            setCurrentValue(digit);
        } else {
            if (currentValue.length < 10) { // Limit digits
                setCurrentValue(currentValue + digit);
            }
        }
    };

    const handleBackspace = () => {
        const newValue = currentValue.slice(0, -1);
        setCurrentValue(newValue.length > 0 ? newValue : '0');
    };
    
    const handleClear = () => {
        setCurrentValue('0');
    };

    const handleConfirm = () => {
        // Return as string to preserve leading zeros (e.g. "055")
        onSubmit(currentValue);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-xs w-full" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-semibold text-center text-gray-800 mb-4">{title}</h2>
                <div className="bg-gray-100 text-gray-900 text-right text-4xl font-mono font-bold p-4 rounded-lg mb-4 h-20 overflow-x-auto break-all">
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
                    className="mt-4 w-full px-4 py-3 bg-blue-600 text-white text-lg font-semibold rounded-md hover:bg-blue-700"
                >
                    ตกลง
                </button>
            </div>
        </div>
    );
};
