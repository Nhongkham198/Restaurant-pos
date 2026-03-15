
export interface LineConfig {
    messagingToken?: string;
    userId?: string;
    notifyToken?: string;
}

export const sendLineMessage = async (config: LineConfig, message: string) => {
    console.log('[LineService] Attempting to send LINE notification...', { 
        hasMessagingToken: !!config.messagingToken, 
        hasUserId: !!config.userId,
        hasNotifyToken: !!config.notifyToken 
    });

    // 1. Try LINE Messaging API (Bot)
    if (config.messagingToken && config.userId) {
        try {
            const response = await fetch('https://api.line.me/v2/bot/message/push', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.messagingToken}`,
                },
                body: JSON.stringify({
                    to: config.userId,
                    messages: [
                        {
                            type: 'text',
                            text: message
                        }
                    ]
                }),
            });

            if (response.ok) {
                console.log('[LineService] Messaging API: Message sent successfully');
            } else {
                const errorData = await response.json();
                console.error('[LineService] Messaging API Error:', errorData);
            }
        } catch (error) {
            console.error('[LineService] Messaging API Network error:', error);
        }
    }

    // 2. Try LINE Notify (Alternative)
    if (config.notifyToken) {
        try {
            // Note: Direct calls to LINE Notify from browser often fail due to CORS.
            // We'll try, but we primarily rely on Cloud Functions for this.
            const formData = new URLSearchParams();
            formData.append('message', message);

            const response = await fetch('https://notify-api.line.me/api/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${config.notifyToken}`,
                },
                body: formData,
                mode: 'no-cors' // This allows the request to be sent, but we won't see the response
            });
            
            console.log('[LineService] LINE Notify request sent (mode: no-cors).');
        } catch (error) {
            console.error('[LineService] LINE Notify error:', error);
        }
    }
};

export const formatLineOrderMessage = (order: any) => {
    const totalAmount = order.items.reduce((sum: number, item: any) => sum + (item.finalPrice * item.quantity), 0).toFixed(2);
    const itemsList = order.items.map((item: any) => {
        let itemText = `- ${item.name} x ${item.quantity}`;
        if (item.selectedOptions && item.selectedOptions.length > 0) {
            const optionsText = item.selectedOptions.map((opt: any) => opt.name).join(', ');
            itemText += ` (${optionsText})`;
        }
        if (item.notes) {
            itemText += ` [Note: ${item.notes}]`;
        }
        return itemText;
    }).join('\n');
    
    const displayOrderNumber = order.manualOrderNumber ? `#${order.manualOrderNumber}` : `#${order.orderNumber}`;

    let message = `🔔 มีออเดอร์ใหม่!\n` +
                  `โต๊ะ: ${order.tableName}\n` +
                  `ออเดอร์: ${displayOrderNumber}\n` +
                  `รายการ:\n${itemsList}\n` +
                  `ยอดรวม: ${totalAmount} บาท`;

    if (order.customerPhone || order.phone) {
        message += `\n📞 เบอร์โทร: ${order.customerPhone || order.phone}`;
    }

    if ((order.latitude && order.longitude) || (order.lat && order.lng)) {
        const lat = order.latitude || order.lat;
        const lng = order.longitude || order.lng;
        message += `\n📍 พิกัด: https://www.google.com/maps?q=${lat},${lng}`;
    }

    return message;
};
