import React, { useState, useRef, useMemo, useEffect } from 'react';
import type { CompletedOrder } from '../types';

// Helper to convert number to Thai Baht text
const moneyToThaiText = (amount: number): string => {
    const txtNumArr = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
    const txtDigitArr = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
    let bahtText = "";
    const strAmount = Math.abs(amount).toFixed(2);
    const parts = strAmount.split('.');
    let baht = parts[0];
    const satang = parts[1];

    if (Number(baht) === 0 && Number(satang) === 0) return "ศูนย์บาทถ้วน";

    // Process Baht
    const bahtLen = baht.length;
    for (let i = 0; i < bahtLen; i++) {
        const num = parseInt(baht.charAt(i));
        const digit = bahtLen - i - 1;
        const unit = digit % 6;

        if (num !== 0) {
            if (unit === 1 && num === 1) {
                // Skip 'neung' for 'sib'
            } else if (unit === 1 && num === 2) {
                bahtText += "ยี่";
            } else if (unit === 0 && num === 1 && digit < bahtLen - 1) {
                bahtText += "เอ็ด";
            } else {
                bahtText += txtNumArr[num];
            }
            bahtText += txtDigitArr[unit];
        }
        
        if (digit > 0 && digit % 6 === 0) {
             bahtText += "ล้าน";
        }
    }
    
    if (bahtText.length > 0) bahtText += "บาท";
    else if (Number(baht) === 0 && Number(satang) > 0) {} // No baht prefix for pure satang? Usually empty is fine, or "ศูนย์บาท" if strictly formal but usually omitted if satang present in casual contexts. Let's keep empty if 0 baht but has satang.

    // Process Satang
    if (Number(satang) > 0) {
        let satangText = "";
        const sLen = satang.length;
        for (let i = 0; i < sLen; i++) {
            const num = parseInt(satang.charAt(i));
            const digit = sLen - i - 1;
            if (num !== 0) {
                if (digit === 1 && num === 1) {
                    // skip
                } else if (digit === 1 && num === 2) {
                    satangText += "ยี่";
                } else if (digit === 0 && num === 1 && parseInt(satang.charAt(0)) !== 0) {
                    satangText += "เอ็ด";
                } else {
                    satangText += txtNumArr[num];
                }
                if (digit === 1) satangText += "สิบ";
            }
        }
        bahtText += satangText + "สตางค์";
    } else {
        bahtText += "ถ้วน";
    }

    return bahtText;
};

// Helper for Editable Field
interface EditableFieldProps {
    value: string | number;
    onChange: (val: string) => void;
    className?: string;
    placeholder?: string;
    align?: 'left' | 'center' | 'right';
}

const EditableField: React.FC<EditableFieldProps> = ({ value, onChange, className = "", placeholder = "", align = 'left' }) => {
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [localValue, setLocalValue] = useState(String(value));

    useEffect(() => {
        setLocalValue(String(value));
    }, [value]);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleBlur = () => {
        setIsEditing(false);
        onChange(localValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBlur();
        }
    };

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                value={localValue}
                onChange={e => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`border-b border-blue-400 focus:outline-none bg-white w-full ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}
                placeholder={placeholder}
            />
        );
    }

    return (
        <span 
            onClick={handleClick} 
            className={`cursor-pointer hover:bg-blue-50 hover:text-blue-800 hover:underline decoration-dashed decoration-blue-300 inline-block w-full ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}
            title="คลิกเพื่อแก้ไข"
        >
            {value || <span className="opacity-50 text-gray-400">{placeholder || "-"}</span>}
        </span>
    );
};

interface CashBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: CompletedOrder | null;
    restaurantName: string;
    logoUrl: string | null;
    restaurantAddress: string;
    restaurantPhone: string;
    taxId: string;
    signatureUrl: string | null;
}

interface EditableItem {
    name: string;
    qty: string;
    price: string;
    total: string;
}

export const CashBillModal: React.FC<CashBillModalProps> = ({
    isOpen,
    onClose,
    order,
    restaurantName,
    logoUrl,
    restaurantAddress,
    restaurantPhone,
    taxId,
    signatureUrl
}) => {
    const componentRef = useRef<HTMLDivElement>(null);
    const [paperSize, setPaperSize] = useState<'a4' | '80mm'>('80mm');

    // --- Local State for ALL Editable Fields ---
    
    // Header Info
    const [shopName, setShopName] = useState('');
    const [shopAddress, setShopAddress] = useState('');
    const [shopPhone, setShopPhone] = useState('');
    const [shopTaxId, setShopTaxId] = useState('');
    
    // Bill Meta
    const [docTitle, setDocTitle] = useState('บิลเงินสด / ใบกำกับภาษี');
    const [invNo, setInvNo] = useState('');
    const [billDate, setBillDate] = useState('');
    const [billTime, setBillTime] = useState('');

    // Customer Info
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [customerTaxId, setCustomerTaxId] = useState('');

    // Items
    const [editableItems, setEditableItems] = useState<EditableItem[]>([]);

    // Totals & Footer
    const [subtotalStr, setSubtotalStr] = useState('');
    const [taxLabel, setTaxLabel] = useState('ภาษีมูลค่าเพิ่ม 7%');
    const [taxAmountStr, setTaxAmountStr] = useState('');
    const [grandTotalLabel, setGrandTotalLabel] = useState('ยอดสุทธิ');
    const [grandTotalStr, setGrandTotalStr] = useState('');
    const [grandTotalInWords, setGrandTotalInWords] = useState('');
    
    // Signatures
    const [receiverLabel, setReceiverLabel] = useState('ผู้รับเงิน');
    const [authorityLabel, setAuthorityLabel] = useState('ผู้มีอำนาจลงนาม');

    // Helper to calculate totals
    const recalculateTotals = (items: EditableItem[]) => {
        let subtotal = 0;
        const updatedItems = items.map(item => {
            const qty = parseFloat(item.qty.replace(/,/g, '')) || 0;
            const price = parseFloat(item.price.replace(/,/g, '')) || 0;
            const total = qty * price;
            subtotal += total;
            return {
                ...item,
                total: total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            };
        });

        // Use order tax rate if available, or extract from label if possible, default to 7%
        const taxRate = order?.taxRate || 7;
        const taxAmount = (taxRate / 100) * subtotal;
        const grandTotal = subtotal + taxAmount;

        setSubtotalStr(subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setTaxAmountStr(taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setGrandTotalStr(grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setGrandTotalInWords(moneyToThaiText(grandTotal));
        
        return updatedItems;
    };

    // --- Initialize Data when Order Opens ---
    useEffect(() => {
        if (isOpen && order) {
            // Header
            setShopName(restaurantName);
            setShopAddress(restaurantAddress);
            setShopPhone(`โทร: ${restaurantPhone}`);
            setShopTaxId(`เลขประจำตัวผู้เสียภาษี: ${taxId}`);

            // Meta
            setInvNo(`INV-${String(order.orderNumber).padStart(6, '0')}`);
            setBillDate(new Date(order.completionTime).toLocaleDateString('th-TH'));
            setBillTime(new Date(order.completionTime).toLocaleTimeString('th-TH'));

            // Customer
            setCustomerName('');
            setCustomerAddress('');
            setCustomerTaxId('');

            // Items
            const items = order.items.map(item => ({
                name: `${item.name} ${item.selectedOptions.length > 0 ? `(${item.selectedOptions.map(o => o.name).join(', ')})` : ''}`,
                qty: String(item.quantity),
                price: item.finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                total: (item.finalPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })
            }));
            setEditableItems(items);

            // Totals - Initial Calculation
            const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
            const tax = order.taxAmount;
            const total = subtotal + tax;

            setSubtotalStr(subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 }));
            setTaxAmountStr(tax.toLocaleString(undefined, { minimumFractionDigits: 2 }));
            setGrandTotalStr(total.toLocaleString(undefined, { minimumFractionDigits: 2 }));
            setGrandTotalInWords(moneyToThaiText(total));
            
            // Labels
            setDocTitle('บิลเงินสด / ใบกำกับภาษี');
            setTaxLabel(`ภาษีมูลค่าเพิ่ม ${order.taxRate}%`);
            setGrandTotalLabel('ยอดสุทธิ');
            setReceiverLabel('ผู้รับเงิน');
            setAuthorityLabel('ผู้มีอำนาจลงนาม');
        }
    }, [isOpen, order, restaurantName, restaurantAddress, restaurantPhone, taxId]);

    const handleItemChange = (index: number, field: keyof EditableItem, value: string) => {
        const newItems = [...editableItems];
        newItems[index] = { ...newItems[index], [field]: value };
        
        // If changing qty or price, auto-calculate row total and grand totals
        if (field === 'qty' || field === 'price') {
            const recalculated = recalculateTotals(newItems);
            setEditableItems(recalculated);
        } else {
            setEditableItems(newItems);
        }
    };

    const handleAddItem = () => {
        const newItem: EditableItem = {
            name: 'รายการใหม่',
            qty: '1',
            price: '0.00',
            total: '0.00'
        };
        const newItems = [...editableItems, newItem];
        const recalculated = recalculateTotals(newItems);
        setEditableItems(recalculated);
    };

    const handleDeleteItem = (index: number) => {
        const newItems = editableItems.filter((_, i) => i !== index);
        const recalculated = recalculateTotals(newItems);
        setEditableItems(recalculated);
    };

    if (!isOpen || !order) return null;

    const handlePrint = () => {
        const printContent = componentRef.current;
        if (printContent) {
            const printWindow = window.open('', '', 'height=600,width=800');
            if (printWindow) {
                printWindow.document.write('<html><head><title>Print Bill</title>');
                printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">');
                printWindow.document.write('</head><body >');
                printWindow.document.write(printContent.innerHTML);
                printWindow.document.write('</body></html>');
                printWindow.document.close();
                printWindow.print();
            }
        }
    };

    const isA4 = paperSize === 'a4';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
            {/* CSS injection for continuous 80mm printing */}
            {!isA4 && (
                <style>{`
                    @media print {
                        @page {
                            size: auto; /* Force continuous roll */
                            margin: 0mm;
                        }
                        body {
                            margin: 0mm;
                        }
                    }
                `}</style>
            )}

            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg no-print">
                    <div className="flex items-center gap-4">
                        <h3 className="text-xl font-bold text-gray-800">ออกบิลเงินสด / ใบกำกับภาษี (แก้ไขได้)</h3>
                        <select 
                            value={paperSize} 
                            onChange={(e) => setPaperSize(e.target.value as any)}
                            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                        >
                            <option value="80mm">กระดาษ 80mm (Thermal)</option>
                            <option value="a4">กระดาษ A4</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            พิมพ์
                        </button>
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 font-bold">ปิด</button>
                    </div>
                </div>

                {/* Printable Area */}
                <main className="flex-1 overflow-y-auto p-8 bg-gray-100 flex justify-center">
                    <div 
                        ref={componentRef} 
                        className={`bg-white shadow-sm relative text-black ${
                            isA4 ? 'p-8 max-w-[210mm] min-h-[297mm] w-full' : 'p-2 w-[80mm] min-h-0 text-xs'
                        }`}
                        style={{ fontFamily: 'Sarabun, sans-serif' }}
                    >
                        
                        {/* Header */}
                        <div className={`flex ${isA4 ? 'justify-between items-start flex-row' : 'flex-col items-center text-center'} mb-6`}>
                            <div className={`flex ${isA4 ? 'gap-4 w-2/3' : 'flex-col items-center gap-2 w-full'}`}>
                                {logoUrl && <img src={logoUrl} alt="Logo" className={`${isA4 ? 'h-20 w-20' : 'h-16 w-16'} object-contain`} />}
                                <div className="flex-1">
                                    <div className={`${isA4 ? 'text-2xl' : 'text-lg'} font-bold mb-1`}>
                                        <EditableField value={shopName} onChange={setShopName} align={isA4 ? 'left' : 'center'} />
                                    </div>
                                    <div className="text-sm whitespace-pre-wrap mb-1">
                                        <EditableField value={shopAddress} onChange={setShopAddress} className="w-full" align={isA4 ? 'left' : 'center'} />
                                    </div>
                                    <div className="text-sm mb-1">
                                        <EditableField value={shopPhone} onChange={setShopPhone} align={isA4 ? 'left' : 'center'} />
                                    </div>
                                    <div className="text-sm">
                                        <EditableField value={shopTaxId} onChange={setShopTaxId} align={isA4 ? 'left' : 'center'} />
                                    </div>
                                </div>
                            </div>
                            <div className={`${isA4 ? 'text-right w-1/3' : 'text-center w-full mt-4 border-t border-dashed pt-2'}`}>
                                <div className={`${isA4 ? 'text-xl' : 'text-base'} font-bold mb-2`}>
                                    <EditableField value={docTitle} onChange={setDocTitle} className={isA4 ? "text-right w-full" : "text-center w-full"} align={isA4 ? 'right' : 'center'} />
                                </div>
                                <div className="text-sm space-y-1">
                                    <div className={`flex ${isA4 ? 'justify-end' : 'justify-center'} gap-2`}>
                                        <strong>เลขที่:</strong> 
                                        <EditableField value={invNo} onChange={setInvNo} className={`${isA4 ? 'text-right w-28' : 'text-left w-24'}`} align={isA4 ? 'right' : 'left'} />
                                    </div>
                                    <div className={`flex ${isA4 ? 'justify-end' : 'justify-center'} gap-2`}>
                                        <strong>วันที่:</strong>
                                        <EditableField value={billDate} onChange={setBillDate} className={`${isA4 ? 'text-right w-28' : 'text-left w-24'}`} align={isA4 ? 'right' : 'left'} />
                                    </div>
                                    <div className={`flex ${isA4 ? 'justify-end' : 'justify-center'} gap-2`}>
                                        <strong>เวลา:</strong>
                                        <EditableField value={billTime} onChange={setBillTime} className={`${isA4 ? 'text-right w-28' : 'text-left w-24'}`} align={isA4 ? 'right' : 'left'} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Customer Info Input */}
                        <div className={`mb-6 p-2 border rounded-lg bg-gray-50 border-gray-200 ${isA4 ? 'p-4' : ''}`}>
                            <h3 className="font-bold border-b border-gray-300 mb-2 pb-1">ข้อมูลลูกค้า</h3>
                            <div className={`grid ${isA4 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                                <div>
                                    <label className="block text-xs text-gray-500">ชื่อลูกค้า / บริษัท</label>
                                    <EditableField value={customerName} onChange={setCustomerName} placeholder="-" className="w-full font-medium" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">เลขประจำตัวผู้เสียภาษี</label>
                                    <EditableField value={customerTaxId} onChange={setCustomerTaxId} placeholder="-" className="w-full font-medium" />
                                </div>
                                <div className={isA4 ? "col-span-2" : ""}>
                                    <label className="block text-xs text-gray-500">ที่อยู่</label>
                                    <EditableField value={customerAddress} onChange={setCustomerAddress} placeholder="-" className="w-full font-medium" />
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <table className="w-full text-sm border-collapse mb-6">
                            <thead>
                                <tr className="bg-gray-100 border-t border-b border-gray-300">
                                    {isA4 && <th className="py-2 text-center w-12">#</th>}
                                    <th className="py-2 text-left">รายการ</th>
                                    <th className="py-2 text-center w-12">จำนวน</th>
                                    {isA4 && <th className="py-2 text-right w-24">ราคา/หน่วย</th>}
                                    <th className="py-2 text-right w-20">รวม</th>
                                    <th className="py-2 text-center w-8 no-print"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {editableItems.map((item, index) => (
                                    <tr key={index} className="border-b border-gray-200 hover:bg-gray-50 group">
                                        {isA4 && <td className="py-2 text-center">{index + 1}</td>}
                                        <td className="py-2 align-top">
                                            <EditableField value={item.name} onChange={(v) => handleItemChange(index, 'name', v)} className="w-full" />
                                            {!isA4 && (
                                                <div className="text-[10px] text-gray-500">
                                                    @{item.price}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2 text-center align-top">
                                            <EditableField value={item.qty} onChange={(v) => handleItemChange(index, 'qty', v)} className="text-center w-full" align="center" />
                                        </td>
                                        {isA4 && (
                                            <td className="py-2 text-right align-top">
                                                <EditableField value={item.price} onChange={(v) => handleItemChange(index, 'price', v)} className="text-right w-full" align="right" />
                                            </td>
                                        )}
                                        <td className="py-2 text-right align-top">
                                            <EditableField value={item.total} onChange={(v) => handleItemChange(index, 'total', v)} className="text-right w-full" align="right" />
                                        </td>
                                        <td className="py-2 text-center no-print align-top">
                                            <button 
                                                onClick={() => handleDeleteItem(index)}
                                                className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="ลบรายการ"
                                            >
                                                &times;
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {/* Add Item Row */}
                                <tr className="no-print">
                                    <td colSpan={isA4 ? 6 : 4} className="py-2 text-center">
                                        <button 
                                            onClick={handleAddItem}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center justify-center gap-1 w-full border border-dashed border-blue-300 rounded hover:bg-blue-50 py-1"
                                        >
                                            + เพิ่มรายการ
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={isA4 ? 3 : 1}></td>
                                    <td className="py-2 text-right font-bold whitespace-nowrap">รวมเป็นเงิน</td>
                                    <td className="py-2 text-right font-bold">
                                        <EditableField value={subtotalStr} onChange={setSubtotalStr} className="text-right w-full" align="right" />
                                    </td>
                                    <td></td>
                                </tr>
                                {order.taxRate > 0 && (
                                    <tr>
                                        <td colSpan={isA4 ? 3 : 1}></td>
                                        <td className="py-2 text-right whitespace-nowrap">
                                            <EditableField value={taxLabel} onChange={setTaxLabel} className="text-right w-full" align="right" />
                                        </td>
                                        <td className="py-2 text-right">
                                            <EditableField value={taxAmountStr} onChange={setTaxAmountStr} className="text-right w-full" align="right" />
                                        </td>
                                        <td></td>
                                    </tr>
                                )}
                                <tr className="border-t border-b border-black">
                                    <td colSpan={isA4 ? 3 : 1}></td>
                                    <td className="py-2 text-right font-bold text-lg whitespace-nowrap">
                                        <EditableField value={grandTotalLabel} onChange={setGrandTotalLabel} className="text-right w-full" align="right" />
                                    </td>
                                    <td className="py-2 text-right font-bold text-lg">
                                        <EditableField value={grandTotalStr} onChange={setGrandTotalStr} className="text-right w-full" align="right" />
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>

                        {/* Total in words */}
                        <div className="mt-2 p-2 bg-gray-100 text-sm font-bold text-center text-gray-800 border-b border-dashed border-gray-300 pb-4">
                            ( <EditableField value={grandTotalInWords} onChange={setGrandTotalInWords} className="text-center w-full" align="center" /> )
                        </div>

                        {/* Footer - With Signature Image */}
                         <div className={`flex ${isA4 ? 'justify-between flex-row' : 'flex-col items-center gap-8'} items-end mt-12 text-sm`}>
                            <div className={`${isA4 ? 'w-1/3' : 'w-full'} text-center`}>
                                <div className="h-16 w-full flex items-end justify-center mb-1">
                                    {/* Empty space or cashier signature could go here */}
                                </div>
                                <div className="pt-2 border-t border-dotted border-gray-400">
                                    <EditableField value={receiverLabel} onChange={setReceiverLabel} className="text-center w-full" align="center" />
                                </div>
                            </div>
                            <div className={`${isA4 ? 'w-1/3' : 'w-full'} text-center relative`}>
                                <div className={`w-full flex items-end justify-center relative ${isA4 ? 'h-16 mb-1' : 'h-auto mt-6 mb-10'}`}>
                                    {signatureUrl ? (
                                        <div className={`${isA4 ? 'absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-28' : 'relative w-48 h-28'} flex items-end justify-center`}>
                                            <img 
                                                src={signatureUrl} 
                                                alt="Authorized Signature" 
                                                className="w-full h-full object-contain"
                                                style={{ 
                                                    filter: 'grayscale(100%) contrast(150%) brightness(1.1)', 
                                                    mixBlendMode: 'multiply' 
                                                }} 
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-32 h-16 border border-gray-200 bg-white/50 hidden" />
                                    )}
                                </div>
                                <div className="pt-2 border-t border-dotted border-gray-400">
                                    <EditableField value={authorityLabel} onChange={setAuthorityLabel} className="text-center w-full" align="center" />
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};
