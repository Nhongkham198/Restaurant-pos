import React from 'react';

interface NumpadModalProps {
    isOpen: boolean;
    onClose: () => void;
    value: string;
    setValue: (value: string) => void;
    title: string;
}

const NumpadButton: React.FC<{ value: string; onClick: (value: string) => void; className?: string; children?: React.ReactNode }> = ({ value, onClick, className = '', children }) => (
    <button type="button" onClick={() => onClick(value)} className={`py-4 text-2xl font-bold text-gray-800 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${className}`}>
        {children || value}
    </button>
);

export const NumpadModal: React.FC<NumpadModalProps> = ({ isOpen, onClose, value, setValue, title }) => {
    if (!isOpen) return null;

    const handleInput = (digit: string) => {
        if (value === '0') {
            setValue(digit);
        } else {
            if (value.length < 9) { // Limit to 9 digits
                setValue(value + digit);
            }
        }
    };

    const handleBackspace = () => {
        const newValue = value.slice(0, -1);
        setValue(newValue.length > 0 ? newValue : '0');
    };
    
    const handleClear = () => {
        setValue('0');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-xs w-full" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-semibold text-center text-gray-800 mb-4">{title}</h2>
                <div className="bg-gray-100 text-gray-900 text-right text-4xl font-mono font-bold p-4 rounded-lg mb-4 h-20 overflow-x-auto break-all">
                    {Number(value).toLocaleString()}
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(val => 
                        <NumpadButton key={val} value={val} onClick={handleInput} />
                    )}
                    <NumpadButton value="C" onClick={handleClear} className="text-red-600 font-mono">C</NumpadButton>
                    <NumpadButton value="0" onClick={handleInput}>0</NumpadButton>
                    <NumpadButton value="backspace" onClick={handleBackspace}>
                        <span className="text-2xl font-sans" aria-label="Backspace">⌫</span>
                    </NumpadButton>
                </div>
                
                <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 w-full px-4 py-3 bg-blue-600 text-white text-lg font-semibold rounded-md hover:bg-blue-700"
                >
                    ตกลง
                </button>
            </div>
        </div>
    );
};