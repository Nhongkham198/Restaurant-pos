
import React from 'react';
import type { ActiveOrder } from '../types';

interface ReceiptPreviewProps {
  order: ActiveOrder | null;
  restaurantName: string;
  logoUrl: string | null;
  refProp: React.RefObject<HTMLDivElement>;
}

export const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({ order, restaurantName, logoUrl, refProp }) => {
  if (!order) return null;

  const subtotal = order.items.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const total = subtotal + order.taxAmount;

  return (
    <div ref={refProp} className="bg-white p-6 text-black">
      {/* Header */}
      <div className="text-center mb-6">
        {/* FIX: Add crossOrigin="anonymous" to allow html2canvas to render the image from another domain. */}
        {logoUrl && <img src={logoUrl} alt="Logo" className="h-16 w-auto mx-auto mb-4" crossOrigin="anonymous" />}
        <h2 className="text-2xl font-bold">{restaurantName}</h2>
        <p className="text-sm text-gray-600">E-Receipt</p>
      </div>

      {/* Order Info */}
      <div className="flex justify-between text-sm text-gray-700 mb-4 border-b pb-2">
        <div>
          <p><strong>โต๊ะ:</strong> {order.tableName} ({order.floor})</p>
          <p><strong>ออเดอร์ #:</strong> {String(order.orderNumber).padStart(3, '0')}</p>
        </div>
        <div>
          <p><strong>วันที่:</strong> {new Date().toLocaleDateString('th-TH')}</p>
          <p><strong>เวลา:</strong> {new Date().toLocaleTimeString('th-TH')}</p>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-2 mb-4">
        {order.items.map(item => (
          <div key={item.cartItemId} className="flex text-sm">
            <div className="flex-1">
              <p>{item.quantity}x {item.name}</p>
              {item.selectedOptions.length > 0 && (
                <p className="text-xs text-gray-500 pl-4">({item.selectedOptions.map(o => o.name).join(', ')})</p>
              )}
            </div>
            <p className="font-mono">{(item.finalPrice * item.quantity).toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t pt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">ยอดรวม (ก่อนภาษี)</span>
          <span className="font-mono">{subtotal.toFixed(2)}</span>
        </div>
        {order.taxAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">ภาษี ({order.taxRate}%)</span>
            <span className="font-mono">{order.taxAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
          <span>ยอดสุทธิ</span>
          <span className="font-mono">{total.toFixed(2)} ฿</span>
        </div>
      </div>

      <p className="text-center text-xs text-gray-500 mt-6">ขอบคุณที่ใช้บริการ</p>
    </div>
  );
};