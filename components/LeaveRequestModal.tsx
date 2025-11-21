

import React, { useState, useMemo, useEffect } from 'react';
import type { LeaveRequest, User } from '../types';
import Swal from 'sweetalert2';

interface LeaveRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User | null;
    // FIX: The onSave prop should not expect a branchId, as the parent component (App.tsx) is responsible for adding it based on the currently selected branch. The modal component doesn't have this information.
    onSave: (request: Omit<LeaveRequest, 'id' | 'status' | 'branchId'>) => void;
    leaveRequests?: LeaveRequest[]; // Needed to calculate remaining days
    initialDate?: Date | null;
}

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({ isOpen, onClose, currentUser, onSave, leaveRequests = [], initialDate }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [type, setType] = useState<LeaveRequest['type']>('personal');
    const [reason, setReason] = useState('');
    const [isHalfDay, setIsHalfDay] = useState(false);

    // Pre-fill date when initialDate changes or modal opens
    useEffect(() => {
        if (isOpen && initialDate) {
            const year = initialDate.getFullYear();
            const month = String(initialDate.getMonth() + 1).padStart(2, '0');
            const day = String(initialDate.getDate()).padStart(2, '0');
            const formattedDate = `${year}-${month}-${day}`;
            
            setStartDate(formattedDate);
            setEndDate(formattedDate); 
        } else if (isOpen && !initialDate) {
            setStartDate('');
            setEndDate('');
        }
        // Reset half day on open
        if(isOpen) setIsHalfDay(false);
    }, [isOpen, initialDate]);

    // Force endDate to be same as startDate if half-day is checked
    useEffect(() => {
        if (isHalfDay && startDate) {
            setEndDate(startDate);
        }
    }, [isHalfDay, startDate]);

    const quotas = useMemo(() => {
        const defaultQuotas = { sick: 30, personal: 6, vacation: 6 }; 
        if (!currentUser) return { total: defaultQuotas, used: { sick: 0, personal: 0, vacation: 0 } };

        const userQuotas = currentUser.leaveQuotas || defaultQuotas;

        // Calculate used days
        const used = { sick: 0, personal: 0, vacation: 0 };
        
        leaveRequests.forEach(req => {
            if (req.userId === currentUser.id && req.status === 'approved') { 
                let diffDays = 0;
                if (req.isHalfDay) {
                    diffDays = 0.5;
                } else {
                    const diffTime = Math.abs(req.endDate - req.startDate);
                    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                }
                
                if (req.type === 'sick') used.sick += diffDays;
                else if (req.type === 'personal') used.personal += diffDays;
                else if (req.type === 'leave-without-pay') used.vacation += diffDays; 
            }
        });

        return { total: userQuotas, used };
    }, [currentUser, leaveRequests]);

    const remainingPersonal = Math.max(0, quotas.total.personal - quotas.used.personal);
    const remainingSick = Math.max(0, quotas.total.sick - quotas.used.sick);

    // Auto-switch type if current selection is invalid due to quota
    useEffect(() => {
        if (isOpen) {
            if (type === 'personal' && remainingPersonal <= 0) {
                setType('leave-without-pay');
            } else if (type === 'sick' && remainingSick <= 0) {
                setType('leave-without-pay');
            }
        }
    }, [isOpen, type, remainingPersonal, remainingSick]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        
        if (!startDate || !endDate || !reason) {
            Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกวันที่และเหตุผล', 'warning');
            return;
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        if (end < start) {
            Swal.fire('วันที่ไม่ถูกต้อง', 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น', 'error');
            return;
        }

        // Final validation for quota before submit (in case UI was bypassed)
        const duration = isHalfDay ? 0.5 : Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        
        if (type === 'personal' && remainingPersonal < duration) {
             Swal.fire('สิทธิ์วันลาไม่พอ', `วันลากิจเหลือ ${remainingPersonal} วัน แต่คุณขอ ${duration} วัน ระบบจะเปลี่ยนเป็นลาไม่รับเงินเดือนแทนหรือไม่?`, 'question').then((result) => {
                 if(result.isConfirmed) setType('leave-without-pay');
             });
             return;
        }
        if (type === 'sick' && remainingSick < duration) {
             Swal.fire('สิทธิ์วันลาไม่พอ', `วันลาป่วยเหลือ ${remainingSick} วัน แต่คุณขอ ${duration} วัน ระบบจะเปลี่ยนเป็นลาไม่รับเงินเดือนแทนหรือไม่?`, 'question').then((result) => {
                 if(result.isConfirmed) setType('leave-without-pay');
             });
             return;
        }

        onSave({
            userId: currentUser.id,
            username: currentUser.username,
            startDate: start.getTime(),
            endDate: end.getTime(),
            type,
            reason,
            isHalfDay
        });
        
        // Reset form
        setStartDate('');
        setEndDate('');
        setReason('');
        setType('personal');
        setIsHalfDay(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full flex flex-col" style={{ minHeight: '400px' }} onClick={e => e.stopPropagation()}>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">ขอวันลา</h3>
                <form onSubmit={handleSubmit} className="space-y-4 flex-1">
                    
                    <div className="flex items-center gap-2 mb-2">
                        <input 
                            type="checkbox" 
                            id="halfDay" 
                            checked={isHalfDay} 
                            onChange={(e) => setIsHalfDay(e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                        />
                        <label htmlFor="halfDay" className="text-gray-700 font-medium select-none cursor-pointer">ลาครึ่งวัน (0.5 วัน)</label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มลา</label>
                            <input 
                                type="date" 
                                value={startDate} 
                                onChange={(e) => setStartDate(e.target.value)} 
                                className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">ถึงวันที่</label>
                            <input 
                                type="date" 
                                value={endDate} 
                                onChange={(e) => setEndDate(e.target.value)} 
                                className={`w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none ${isHalfDay ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                required
                                disabled={isHalfDay}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทการลา</label>
                        <select 
                            value={type} 
                            onChange={(e) => setType(e.target.value as LeaveRequest['type'])}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            {remainingPersonal > 0 && <option value="personal">ลากิจ</option>}
                            {remainingSick > 0 && <option value="sick">ลาป่วย</option>}
                            <option value="leave-without-pay">ลาไม่รับเงินเดือน</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผล</label>
                        <textarea 
                            value={reason} 
                            onChange={(e) => setReason(e.target.value)} 
                            rows={3}
                            className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="ระบุเหตุผล..."
                            required
                        />
                    </div>

                    <div className="pt-4 mt-auto flex items-end justify-between">
                        {/* Quota Display Area */}
                        <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-2 rounded border border-gray-200 mr-2 flex-grow">
                            <p className="font-bold text-gray-700 border-b pb-1 mb-1">วันลาคงเหลือ (อนุมัติแล้ว):</p>
                            <div className={`flex justify-between ${remainingPersonal <= 0 ? 'text-red-500' : ''}`}>
                                <span>ลากิจ:</span>
                                <span className="font-medium">{remainingPersonal} / {quotas.total.personal}</span>
                            </div>
                            <div className={`flex justify-between ${remainingSick <= 0 ? 'text-red-500' : ''}`}>
                                <span>ลาป่วย:</span>
                                <span className="font-medium">{remainingSick} / {quotas.total.sick}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>ลาไม่รับเงินเดือน:</span>
                                <span className="font-medium">{Math.max(0, quotas.total.vacation - quotas.used.vacation)} / {quotas.total.vacation}</span>
                            </div>
                        </div>

                        <div className="flex gap-2 flex-shrink-0">
                            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-medium h-10">
                                ยกเลิก
                            </button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium h-10">
                                ส่งคำขอ
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};