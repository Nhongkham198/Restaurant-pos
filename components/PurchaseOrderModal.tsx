
import React, { useMemo, useState, useEffect } from 'react';
import type { StockItem, User } from '../types';
import Swal from 'sweetalert2';

// Use declare var to avoid import issues for global script libraries
declare var html2canvas: any;

interface PurchaseOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    stockItems: StockItem[];
    currentUser: User | null;
    isMobileMode?: boolean;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({ isOpen, onClose, stockItems, currentUser, isMobileMode }) => {
    // Local state to track typed quantities: Record<itemId, quantityString>
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    // Local state to track notes: Record<itemId, noteString>
    const [notes, setNotes] = useState<Record<number, string>>({});
    // State for draft log
    const [draftLog, setDraftLog] = useState<{ user: string; timestamp: string } | null>(null);

    // Load draft from localStorage when modal opens
    useEffect(() => {
        if (isOpen) {
            try {
                const savedDraft = localStorage.getItem('purchaseOrderDraft');
                if (savedDraft) {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed.quantities) setQuantities(parsed.quantities);
                    if (parsed.notes) setNotes(parsed.notes);
                    if (parsed.log) setDraftLog(parsed.log);
                } else {
                    // Reset if no draft
                    setQuantities({});
                    setNotes({});
                    setDraftLog(null);
                }
            } catch (e) {
                console.error("Failed to load draft", e);
            }
        }
    }, [isOpen]);

    // Filter items that are low in stock (quantity <= reorderPoint)
    const itemsToOrder = useMemo(() => {
        return stockItems.filter(item => {
            const qty = Number(item.quantity) || 0;
            const reorder = Number(item.reorderPoint) || 0;
            return qty <= reorder;
        }).sort((a, b) => a.category.localeCompare(b.category));
    }, [stockItems]);

    const handleQuantityChange = (itemId: number, value: string) => {
        setQuantities(prev => ({
            ...prev,
            [itemId]: value
        }));
    };

    const handleNoteChange = (itemId: number, value: string) => {
        setNotes(prev => ({
            ...prev,
            [itemId]: value
        }));
    };

    const handleSaveDraft = () => {
        const now = new Date();
        const logData = {
            user: currentUser?.username || 'Unknown',
            timestamp: now.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })
        };

        const draftData = {
            quantities,
            notes,
            log: logData
        };

        localStorage.setItem('purchaseOrderDraft', JSON.stringify(draftData));
        setDraftLog(logData);

        Swal.fire({
            icon: 'success',
            title: 'บันทึกร่างสำเร็จ',
            text: 'ข้อมูลถูกบันทึกเรียบร้อยแล้ว',
            timer: 1500,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleSaveAsImage = async () => {
        const element = document.getElementById('purchase-order-capture-area');
        if (!element) return;

        Swal.fire({
            title: 'กำลังสร้างรูปภาพ...',
            text: 'กรุณารอสักครู่',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            // Clone the element to render it fully expanded (no scroll) for capture
            const clone = element.cloneNode(true) as HTMLElement;
            
            // Setup style for the clone to ensure full content is visible and formatted for image
            clone.style.width = '800px'; 
            clone.style.height = 'auto';
            clone.style.maxHeight = 'none';
            clone.style.overflow = 'visible';
            clone.style.position = 'absolute';
            clone.style.top = '-9999px';
            clone.style.left = '-9999px';
            clone.style.background = 'white';
            clone.style.zIndex = '9999';
            clone.className = element.className.replace('overflow-y-auto', '').replace('h-full', 'h-auto');
            clone.style.padding = '40px'; // Add consistent padding

            // Manually copy input values because cloneNode doesn't copy current input values
            const originalInputs = element.querySelectorAll('input');
            const cloneInputs = clone.querySelectorAll('input');
            originalInputs.forEach((input, index) => {
                if (cloneInputs[index]) {
                    cloneInputs[index].value = input.value;
                    cloneInputs[index].setAttribute('value', input.value);
                }
            });

            // --- INSERT HEADER INFO FOR IMAGE ---
            const now = new Date();
            const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const issuer = currentUser?.username || 'ไม่ระบุ';

            const headerDiv = document.createElement('div');
            headerDiv.style.marginBottom = '25px';
            headerDiv.style.textAlign = 'center';
            headerDiv.innerHTML = `
                <h2 style="font-size: 28px; font-weight: bold; color: #111827; margin-bottom: 10px;">ใบรายการสั่งซื้อสินค้า</h2>
                <div style="font-size: 16px; color: #4b5563; display: flex; justify-content: center; gap: 20px; margin-bottom: 5px;">
                    <span>วันที่บันทึก: <strong>${dateStr}</strong></span>
                    <span>เวลา: <strong>${timeStr}</strong></span>
                </div>
                <div style="font-size: 18px; color: #1d4ed8; font-weight: bold;">
                    ผู้ออกเอกสาร: ${issuer}
                </div>
                <hr style="margin-top: 15px; border: 0; border-top: 2px solid #e5e7eb;" />
            `;
            
            // Insert header at the beginning of the clone
            clone.insertBefore(headerDiv, clone.firstChild);

            // Also ensure the signature section (if it exists hidden) is shown
            const footer = clone.querySelector('.print\\:flex');
            if (footer) {
                (footer as HTMLElement).style.display = 'flex';
                (footer as HTMLElement).classList.remove('hidden');
                (footer as HTMLElement).style.marginTop = '40px';
            }
            // ------------------------------------

            document.body.appendChild(clone);

            // Use html2canvas to capture the clone
            const canvas = await html2canvas(clone, { 
                scale: 2, 
                useCORS: true, 
                windowWidth: 800,
                // height: clone.scrollHeight + 50 // Removed to let it calculate naturally
            });
            const image = canvas.toDataURL('image/png');
            
            // Clean up the clone
            document.body.removeChild(clone);

            // Trigger download
            const link = document.createElement('a');
            link.href = image;
            const filenameDate = now.toISOString().slice(0, 10);
            const filenameTime = now.toTimeString().slice(0, 5).replace(':', '-');
            link.download = `PO-${filenameDate}-${filenameTime}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            Swal.close();
            Swal.fire({
                icon: 'success',
                title: 'บันทึกรูปภาพสำเร็จ',
                timer: 1500,
                showConfirmButton: false
            });

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถสร้างรูปภาพได้', 'error');
        }
    };

    if (!isOpen) return null;

    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const timeStr = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <div 
            id="purchase-order-modal-wrapper"
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[80] p-4 print:p-0 print:block print:bg-white print:static"
        >
            <style>
                {`
                    @media print {
                        @page { 
                            margin: 10mm; 
                            size: A4; 
                        }
                        
                        /* Hide everything in body */
                        body * {
                            visibility: hidden;
                        }

                        /* Reset constraints on html/body/root for scrolling/paging */
                        html, body, #root {
                            height: auto !important;
                            overflow: visible !important;
                            min-height: auto !important;
                        }

                        /* Make our modal wrapper visible and positioned correctly */
                        #purchase-order-modal-wrapper {
                            visibility: visible !important;
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 100% !important;
                            height: auto !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            background: white !important;
                            display: block !important;
                            z-index: 9999 !important;
                            overflow: visible !important;
                        }

                        /* Make all children of the modal visible */
                        #purchase-order-modal-wrapper * {
                            visibility: visible !important;
                        }

                        /* Override fixed heights and overflows on the modal containers */
                        #purchase-order-modal-content {
                            height: auto !important;
                            width: 100% !important;
                            max-width: none !important;
                            box-shadow: none !important;
                            border: none !important;
                            border-radius: 0 !important;
                            overflow: visible !important;
                            display: block !important; /* Remove flex behavior which can constrain height */
                        }

                        #purchase-order-scroll-container, #purchase-order-capture-area {
                            height: auto !important;
                            overflow: visible !important;
                            display: block !important;
                            padding: 0 !important;
                            margin: 0 !important;
                        }

                        /* Hide UI elements not for print */
                        .no-print {
                            display: none !important;
                        }

                        /* Table styling for print */
                        table {
                            width: 100% !important;
                            border-collapse: collapse !important;
                            page-break-inside: auto;
                        }
                        
                        thead {
                            display: table-header-group;
                        }
                        
                        tbody {
                            display: table-row-group;
                        }
                        
                        tr {
                            page-break-inside: avoid;
                            break-inside: avoid;
                        }

                        /* Input styling to look like text */
                        input {
                            border: none !important;
                            background: transparent !important;
                            padding: 0 !important;
                            color: black !important;
                            font-weight: bold;
                            display: inline-block !important;
                            width: 100% !important;
                            font-size: 14pt !important; /* Larger font for print */
                        }
                        /* Specific alignment for inputs */
                        .qty-input { text-align: center !important; }
                        .note-input { text-align: left !important; }
                    }
                `}
            </style>
            
            <div 
                id="purchase-order-modal-content"
                className="bg-white w-full max-w-4xl h-[90vh] flex flex-col rounded-lg shadow-xl overflow-hidden" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header (On Screen & Print) */}
                <div className="p-8 border-b border-gray-300 text-center relative flex-shrink-0">
                    <h2 className="text-2xl font-bold text-gray-900 uppercase tracking-wide">ใบรายการสั่งซื้อสินค้า</h2>
                    <div className="mt-3 space-y-1 text-gray-700">
                        <p className="text-base">
                            วันที่: <span className="font-medium">{dateStr}</span> &nbsp; 
                            เวลา: <span className="font-medium">{timeStr}</span>
                        </p>
                        <p className="text-blue-700 font-semibold text-lg">
                            ผู้ออกเอกสาร: {currentUser?.username || 'ไม่ระบุ'}
                        </p>
                    </div>
                    
                    <div className="absolute top-4 right-4 no-print">
                        <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content Area - ID added for capture */}
                <div id="purchase-order-capture-area" className="flex-1 overflow-y-auto p-8 bg-white">
                    {itemsToOrder.length > 0 ? (
                        <table className="w-full border-collapse border border-gray-300 text-sm">
                            <thead className="bg-gray-100 text-gray-700">
                                <tr>
                                    <th className="border border-gray-300 p-2 w-12 text-center">No.</th>
                                    <th className="border border-gray-300 p-2 text-left">รายการสินค้า</th>
                                    <th className="border border-gray-300 p-2 w-24 text-center">หมวดหมู่</th>
                                    <th className="border border-gray-300 p-2 w-24 text-right">คงเหลือ</th>
                                    <th className="border border-gray-300 p-2 w-24 text-right">จุดสั่งซื้อ</th>
                                    <th className="border border-gray-300 p-2 w-24 text-center">หน่วย</th>
                                    <th className="border border-gray-300 p-2 w-32 text-center">จำนวนที่สั่ง</th>
                                    <th className="border border-gray-300 p-2 w-48 text-center">หมายเหตุ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemsToOrder.map((item, index) => (
                                    <tr key={item.id}>
                                        <td className="border border-gray-300 p-2 text-center text-gray-600">{index + 1}</td>
                                        <td className="border border-gray-300 p-2 font-medium text-gray-800">{item.name}</td>
                                        <td className="border border-gray-300 p-2 text-center text-gray-600">{item.category}</td>
                                        <td className="border border-gray-300 p-2 text-right text-red-600 font-bold">{Number(item.quantity).toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right text-gray-600">{Number(item.reorderPoint).toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-center text-gray-600">{item.unit}</td>
                                        <td className="border border-gray-300 p-1">
                                            <input 
                                                type="number" 
                                                value={quantities[item.id] || ''} 
                                                onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                                className="qty-input w-full h-full text-center p-1 bg-white focus:bg-blue-50 focus:outline-none text-blue-800 font-bold text-lg"
                                                placeholder=""
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input 
                                                type="text" 
                                                value={notes[item.id] || ''} 
                                                onChange={(e) => handleNoteChange(item.id, e.target.value)}
                                                className="note-input w-full h-full text-left p-1 bg-white focus:bg-blue-50 focus:outline-none text-gray-800 text-base"
                                                placeholder=""
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                            <p className="text-gray-500 text-lg">ไม่มีสินค้าที่ต้องสั่งซื้อในขณะนี้ (สต็อกยังเพียงพอ)</p>
                        </div>
                    )}
                    
                    <div className="mt-8 flex justify-between text-sm text-gray-600 pt-8 no-print">
                       <p>* รายการนี้แสดงเฉพาะสินค้าที่มีจำนวนคงเหลือต่ำกว่าหรือเท่ากับจุดสั่งซื้อ</p>
                    </div>
                    
                    {/* Signature Section for Print */}
                    <div className="mt-16 flex justify-around text-center hidden print:flex print-flex" style={{ pageBreakInside: 'avoid' }}>
                        <div className="flex flex-col items-center">
                            {/* Display Current User Name */}
                            {currentUser && (
                                <p className="mb-2 font-bold text-gray-800">{currentUser.username}</p>
                            )}
                            <p className="border-t border-black w-40 pt-2">ผู้สั่งซื้อ</p>
                        </div>
                        <div>
                            <p className="mb-2 h-6"></p> {/* Spacer to align with name above */}
                            <p className="border-t border-black w-40 pt-2">ผู้อนุมัติ</p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions (No Print) */}
                <div className="p-4 border-t bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4 no-print flex-shrink-0">
                    {/* Log Data Display */}
                    <div className="text-sm text-gray-500 flex-1 w-full md:w-auto">
                        {draftLog ? (
                            <div className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>บันทึกล่าสุดโดย: <span className="font-semibold text-gray-700">{draftLog.user}</span> เมื่อ {draftLog.timestamp}</span>
                            </div>
                        ) : (
                            <span className="text-gray-400 italic">ยังไม่ได้บันทึกร่าง</span>
                        )}
                    </div>

                    <div className="flex gap-3 w-full md:w-auto justify-end">
                        <button 
                            onClick={handleSaveDraft}
                            className="px-6 py-2 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 transition-colors shadow flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                            Save Draft
                        </button>
                        
                        {/* Condition to show Print vs Save Image based on mode */}
                        {isMobileMode ? (
                            <button 
                                onClick={handleSaveAsImage} 
                                disabled={itemsToOrder.length === 0}
                                className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors shadow flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                บันทึกเป็นรูปภาพ
                            </button>
                        ) : (
                            <button 
                                onClick={handlePrint} 
                                disabled={itemsToOrder.length === 0}
                                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                                </svg>
                                พิมพ์รายการ
                            </button>
                        )}

                        <button onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">
                            ปิด
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
