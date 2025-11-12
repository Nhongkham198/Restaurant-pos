
import React from 'react';
import type { OrderItem } from '../types';

interface OrderListItemProps {
    item: OrderItem;
    onQuantityChange: (cartItemId: string, newQuantity: number) => void;
    onRemoveItem: (cartItemId: string) => void;
    onToggleTakeaway: (cartItemId: string) => void;
}

export const OrderListItem: React.FC<OrderListItemProps> = ({ item, onQuantityChange, onRemoveItem, onToggleTakeaway }) => {
    
    const itemBgClass = item.isTakeaway ? 'bg-purple-800' : 'bg-gray-800';

    const optionsText = item.selectedOptions.map(opt => opt.name).join(', ');

    return (
        <div className={`flex items-center p-2 rounded-lg transition-colors ${itemBgClass}`}>
            <div className="flex-grow">
                <p className="font-semibold text-white">{item.name}</p>
                {optionsText && <p className="text-xs text-gray-400 pl-1">{optionsText}</p>}
                <p className="text-sm text-gray-400">{item.finalPrice.toLocaleString()} ฿</p>
            </div>
            <div className="flex items-center gap-2 text-white">
                <button
                    onClick={() => onToggleTakeaway(item.cartItemId)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        item.isTakeaway
                            ? 'bg-purple-500 hover:bg-purple-600'
                            : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                    title="สั่งกลับบ้าน"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z" clipRule="evenodd" />
                    </svg>
                </button>
                <button
                    onClick={() => onQuantityChange(item.cartItemId, item.quantity - 1)}
                    className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-lg font-bold flex items-center justify-center"
                >
                    -
                </button>
                <span className="w-8 text-center font-bold text-lg">{item.quantity}</span>
                <button
                    onClick={() => onQuantityChange(item.cartItemId, item.quantity + 1)}
                    className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-lg font-bold flex items-center justify-center"
                >
                    +
                </button>
                 <button
                    onClick={() => onRemoveItem(item.cartItemId)}
                    className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center"
                    title="ลบรายการ"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    );
};