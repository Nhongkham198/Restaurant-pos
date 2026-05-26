import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Eye, EyeOff, Delete } from 'lucide-react';
import Swal from 'sweetalert2';

interface PasswordPinModalProps {
    isOpen: boolean;
    title: string;
    description: string;
    onClose: () => void;
    onConfirm: (password: string) => void;
}

export const PasswordPinModal: React.FC<PasswordPinModalProps> = ({
    isOpen,
    title,
    description,
    onClose,
    onConfirm
}) => {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    // Dynamic keyboard listeners for desktop typing while modal is open
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                setPassword(prev => prev + e.key);
            } else if (e.key === 'Backspace') {
                setPassword(prev => prev.slice(0, -1));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            } else if (e.key === 'Escape') {
                handleClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, password]);

    if (!isOpen) return null;

    const handleNumberClick = (num: string) => {
        setPassword(prev => prev + num);
    };

    const handleBackspace = () => {
        setPassword(prev => prev.slice(0, -1));
    };

    const handleClear = () => {
        setPassword('');
    };

    const handleClose = () => {
        setPassword('');
        setShowPassword(false);
        onClose();
    };

    const handleConfirm = () => {
        if (!password) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณากรอกรหัสผ่าน',
                text: 'กรุณากรอกรหัสผ่านของคุณเพื่อดำเนินการต่อ',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#3b82f6'
            });
            return;
        }
        onConfirm(password);
        setPassword('');
        setShowPassword(false);
    };

    const numpadButtons = [
        '1', '2', '3',
        '4', '5', '6',
        '7', '8', '9'
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={handleClose}>
            <div 
                ref={modalRef}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all border border-slate-100 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header section with Shield Icon and Titles */}
                <div className="p-6 pb-4 text-center border-b border-slate-100">
                    <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-blue-50 text-blue-600 mb-3">
                        <ShieldCheck className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 leading-tight">{title}</h3>
                    <p className="text-sm text-slate-500 mt-1.5 px-4">{description}</p>
                </div>

                {/* Input with Hide/Show toggler */}
                <div className="px-6 pt-5 pb-3">
                    <div className="relative flex items-center">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            readOnly
                            value={password}
                            placeholder="รหัสผ่านของคุณ"
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl py-4.5 px-5 pr-14 text-center text-2xl font-semibold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white placeholder:tracking-normal placeholder:font-normal placeholder:text-lg placeholder:text-slate-350"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute right-4 p-2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            {showPassword ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                        </button>
                    </div>
                </div>

                {/* Tactical Touch Numpad */}
                <div className="px-6 py-2 flex flex-col items-center">
                    <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                        {numpadButtons.map(btn => (
                            <button
                                key={btn}
                                type="button"
                                onClick={() => handleNumberClick(btn)}
                                className="h-14 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold text-xl rounded-2xl flex items-center justify-center transition-all select-none shadow-xs border border-slate-200 active:scale-95 cursor-pointer"
                            >
                                {btn}
                            </button>
                        ))}
                        {/* Clear Key */}
                        <button
                            type="button"
                            onClick={handleClear}
                            className="h-14 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 font-bold text-base rounded-2xl flex items-center justify-center transition-all select-none shadow-xs border border-red-100 active:scale-95 cursor-pointer"
                        >
                            ล้าง
                        </button>
                        {/* Zero Key */}
                        <button
                            type="button"
                            onClick={() => handleNumberClick('0')}
                            className="h-14 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold text-xl rounded-2xl flex items-center justify-center transition-all select-none shadow-xs border border-slate-200 active:scale-95 cursor-pointer"
                        >
                            0
                        </button>
                        {/* Backspace Key */}
                        <button
                            type="button"
                            onClick={handleBackspace}
                            className="h-14 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-700 font-bold text-xl rounded-2xl flex items-center justify-center transition-all select-none shadow-xs border border-amber-100 active:scale-95 cursor-pointer"
                        >
                            <Delete className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 mt-4">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex-1 bg-white hover:bg-slate-100 text-slate-600 font-semibold py-3 px-4 rounded-xl border border-slate-200 transition-colors shadow-xs"
                    >
                        ยกเลิก
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl transition-colors shadow-sm"
                    >
                        ยืนยัน
                    </button>
                </div>
            </div>
        </div>
    );
};
