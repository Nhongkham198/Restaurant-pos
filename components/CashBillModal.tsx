import React, { useState, useEffect, useMemo } from 'react';
import type { CompletedOrder } from '../types';

// --- Utility Function for Number to Thai Text ---
function numberToThaiText(num: number | string): string {
    const numStr = typeof num === 'number' ? num.toFixed(2) : parseFloat(num).toFixed(2);
    const [integerPart, decimalPart] = numStr.split('.');

    const THAI_NUMBERS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
    const THAI_UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

    const readInteger = (n: string): string => {
        let result = '';
        const len = n.length;

        for (let i = 0; i < len; i++) {
            const digit = parseInt(n[i]);
            const unitIndex = len - 1 - i;

            if (digit === 0) continue;

            if (unitIndex % 6 === 0 && unitIndex > 0) { // ล้าน, ล้านล้าน, etc.
                result += readInteger(n.substring(0, i + 1)) + THAI_UNITS[6];
                return result + readInteger(n.substring(i + 1));
            }

            if (unitIndex % 6 === 1 && digit === 2) { // 2 in tens place
                result += 'ยี่';
            } else if (unitIndex % 6 === 1 && digit === 1) { // 1 in tens place
                // No number, just the unit 'สิบ'
            } else if (unitIndex % 6 === 0 && digit === 1 && len > 1) { // 1 in units place
                result += 'เอ็ด';
            } else {
                result += THAI_NUMBERS[digit];
            }

            if (digit !== 0 && unitIndex % 6 > 0) {
                result += THAI_UNITS[unitIndex % 6];
            }
        }
        return result;
    };
    
    const integerText = readInteger(integerPart) || 'ศูนย์';
    const bahtText = `${integerText}บาท`;

    if (parseInt(decimalPart) === 0) {
        return `${bahtText}ถ้วน`;
    }

    const satangText = readInteger(decimalPart);
    return `${bahtText}${satangText}สตางค์`;
}


// --- Component Definition ---

interface BillDataItem {
    id: number;
    description: string;
    quantity: number;
    unitPrice: number;
}
interface BillData {
    sellerName: string;
    sellerAddress: string;
    sellerTaxId: string;
    sellerPhone: string;
    docTitle: string;
    docNumber: string;
    docDate: string;
    customerName: string;
    customerAddress: string;
    customerTaxId: string;
    items: BillDataItem[];
}

interface CashBillModalProps {
    isOpen: boolean;
    order: CompletedOrder | null;
    onClose: () => void;
    restaurantName: string;
    logoUrl: string | null;
}

export const CashBillModal: React.FC<CashBillModalProps> = ({ isOpen, order, onClose, restaurantName, logoUrl }) => {
    const [billData, setBillData] = useState<BillData>({
        sellerName: '', sellerAddress: '', sellerTaxId: '', sellerPhone: '',
        docTitle: 'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ', docNumber: '', docDate: '',
        customerName: '', customerAddress: '', customerTaxId: '', items: []
    });

    useEffect(() => {
        if (order) {
            const today = new Date();
            const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
            const docNum = `RE${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}-${String(order.id).padStart(4,'0')}`;
            
            setBillData({
                sellerName: restaurantName,
                sellerAddress: '123 ถนนสุขุมวิท แขวงคลองเตย\nเขตคลองเตย กรุงเทพมหานคร 10110',
                sellerTaxId: '0-1234-56789-01-2',
                sellerPhone: '02-123-4567',
                docTitle: 'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ',
                docNumber: docNum,
                docDate: dateStr,
                customerName: `โต๊ะ ${order.tableName}`,
                customerAddress: '',
                customerTaxId: '',
                items: order.items.map(item => ({
                    id: item.id,
                    description: item.name + (item.isTakeaway ? ' (กลับบ้าน)' : ''),
                    quantity: item.quantity,
                    unitPrice: item.price,
                }))
            });
        }
    }, [order, restaurantName]);

    const { subtotal, vat, grandTotal, grandTotalInWords } = useMemo(() => {
        const sub = billData.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
        const taxRate = order?.taxRate ?? 0;
        const currentVat = taxRate > 0 ? (sub * taxRate) / (100 + taxRate) : 0;
        const subExclVat = sub - currentVat;
        const total = sub;
        const words = numberToThaiText(total);
        return { subtotal: subExclVat, vat: currentVat, grandTotal: total, grandTotalInWords: words };
    }, [billData.items, order?.taxRate]);

    const handleFieldChange = (field: keyof BillData, value: string) => {
        setBillData(prev => ({ ...prev, [field]: value }));
    };

    const handleItemChange = (itemId: number, field: keyof BillDataItem, value: string | number) => {
        setBillData(prev => ({
            ...prev,
            items: prev.items.map(item => item.id === itemId ? { ...item, [field]: value } : item)
        }));
    };
    
    const handleAddItem = () => {
        const newId = Math.max(0, ...billData.items.map(i => i.id)) + 1000; // Use a high starting number to avoid collision
        setBillData(prev => ({
            ...prev,
            items: [...prev.items, {id: newId, description: '', quantity: 1, unitPrice: 0}]
        }));
    };
    
    const handleDeleteItem = (itemId: number) => {
        setBillData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== itemId)
        }));
    };

    if (!isOpen || !order) return null;

    const EditableField: React.FC<{ value: string, onChange: (value: string) => void, multiline?: boolean, className?: string }> = ({ value, onChange, multiline = false, className = '' }) => {
        const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
            onChange(multiline ? e.currentTarget.innerText : e.currentTarget.textContent || '');
        };
        return (
            <div
                contentEditable
                suppressContentEditableWarning
                onBlur={handleBlur}
                className={`p-1 -m-1 focus:bg-yellow-100 focus:outline-none focus:ring-1 focus:ring-yellow-400 rounded-sm ${className}`}
                style={{ whiteSpace: multiline ? 'pre-wrap' : 'normal' }}
            >
                {value}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-200 rounded-lg shadow-xl w-full h-full transform transition-all flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-3 bg-white border-b flex justify-between items-center no-print">
                    <h3 className="text-lg font-bold text-gray-800">สร้างบิลเงินสด</h3>
                    <div className="flex items-center gap-3">
                        <button onClick={() => window.print()} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold">บันทึกเป็น PDF</button>
                        <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">พิมพ์</button>
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold">ปิด</button>
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-4 print:overflow-visible">
                    <div className="w-[210mm] min-h-[290mm] mx-auto bg-white p-8 shadow-lg text-black printable-area">
                        {/* Header */}
                        <div className="flex justify-between items-start pb-4 border-b">
                            <div className="w-1/2 text-sm space-y-1">
                                {logoUrl && <img src={logoUrl} alt="Logo" className="mb-2" style={{ width: '200px', height: '100px', objectFit: 'contain' }}/>}
                                <div className="font-bold text-base"><EditableField value={billData.sellerName} onChange={(val) => handleFieldChange('sellerName', val)} /></div>
                                <div><EditableField value={billData.sellerAddress} onChange={(val) => handleFieldChange('sellerAddress', val)} multiline/></div>
                                <div><EditableField value={`โทร: ${billData.sellerPhone}`} onChange={(val) => handleFieldChange('sellerPhone', val.replace('โทร: ',''))} /></div>
                                <div><EditableField value={`เลขประจำตัวผู้เสียภาษี: ${billData.sellerTaxId}`} onChange={(val) => handleFieldChange('sellerTaxId', val.replace('เลขประจำตัวผู้เสียภาษี: ',''))} /></div>
                            </div>
                            <div className="w-1/2 text-right text-sm">
                                <div className="font-bold text-xl"><EditableField value={billData.docTitle} onChange={(val) => handleFieldChange('docTitle', val)} /></div>
                                <div className="mt-4"><EditableField value={`เลขที่: ${billData.docNumber}`} onChange={(val) => handleFieldChange('docNumber', val.replace('เลขที่: ',''))} /></div>
                                <div><EditableField value={`วันที่: ${billData.docDate}`} onChange={(val) => handleFieldChange('docDate', val.replace('วันที่: ',''))} /></div>
                            </div>
                        </div>

                        {/* Customer Info */}
                        <div className="mt-4 pb-4 border-b text-sm">
                            <div className="font-bold">ลูกค้า:</div>
                            <div className="pl-4">
                                <div><EditableField value={billData.customerName} onChange={(val) => handleFieldChange('customerName', val)} /></div>
                                <div><EditableField value={billData.customerAddress} onChange={(val) => handleFieldChange('customerAddress', val)} multiline/></div>
                                <div><EditableField value={`เลขประจำตัวผู้เสียภาษี: ${billData.customerTaxId}`} onChange={(val) => handleFieldChange('customerTaxId', val.replace('เลขประจำตัวผู้เสียภาษี: ',''))} /></div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <table className="w-full mt-4 text-sm">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="p-2 text-left w-12 font-medium text-gray-800">#</th>
                                    <th className="p-2 text-left font-medium text-gray-800">รายการ</th>
                                    <th className="p-2 text-right w-24 font-medium text-gray-800">จำนวน</th>
                                    <th className="p-2 text-right w-32 font-medium text-gray-800">หน่วยละ</th>
                                    <th className="p-2 text-right w-32 font-medium text-gray-800">จำนวนเงิน</th>
                                    <th className="w-8 no-print"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {billData.items.map((item, index) => (
                                    <tr key={item.id} className="border-b hover:bg-gray-50 group text-gray-800">
                                        <td className="p-2">{index + 1}</td>
                                        <td className="p-1"><EditableField value={item.description} onChange={(val) => handleItemChange(item.id, 'description', val)} /></td>
                                        <td className="p-1 text-right"><EditableField value={String(item.quantity)} onChange={(val) => handleItemChange(item.id, 'quantity', Number(val) || 0)} /></td>
                                        <td className="p-1 text-right"><EditableField value={item.unitPrice.toFixed(2)} onChange={(val) => handleItemChange(item.id, 'unitPrice', Number(val) || 0)} /></td>
                                        <td className="p-2 text-right">{(item.quantity * item.unitPrice).toFixed(2)}</td>
                                        <td className="p-1 text-center no-print"><button onClick={() => handleDeleteItem(item.id)} className="text-red-500 opacity-0 group-hover:opacity-100">&times;</button></td>
                                    </tr>
                                ))}
                                 <tr className="no-print">
                                    <td colSpan={6} className="pt-2">
                                        <button onClick={handleAddItem} className="text-blue-600 text-sm font-semibold hover:text-blue-800">+ เพิ่มรายการ</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        
                        {/* Totals */}
                        <div className="flex justify-end mt-4">
                            <div className="w-1/2 text-sm">
                                <div className="flex justify-between p-2 border-b">
                                    <span className="text-gray-800">รวมเป็นเงิน</span>
                                    <span className="text-gray-800">{subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between p-2 border-b">
                                    <span className="text-gray-800">ภาษีมูลค่าเพิ่ม {order.taxRate}%</span>
                                    <span className="text-gray-800">{vat.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between p-2 font-bold text-base bg-gray-100">
                                    <span className="text-gray-800">จำนวนเงินรวมทั้งสิ้น</span>
                                    <span className="text-gray-800">{grandTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Total in words */}
                        <div className="mt-2 p-2 bg-gray-100 text-sm font-bold text-center text-gray-800">
                            ( <EditableField value={grandTotalInWords} onChange={() => {}} /> )
                        </div>

                        {/* Footer */}
                         <div className="flex justify-between items-end mt-16 text-sm">
                            <div className="text-center w-1/3">
                                <p className="pt-8 border-t border-dotted border-gray-400">ผู้รับเงิน</p>
                            </div>
                            <div className="text-center w-1/3">
                                <p className="pt-8 border-t border-dotted border-gray-400">ผู้มีอำนาจลงนาม</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};