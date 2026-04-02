
export interface TelegramConfig {
    botToken: string;
    chatId: string;
}

export const sendTelegramMessage = async (config: TelegramConfig, message: string) => {
    if (!config.botToken || !config.chatId) {
        console.warn('[TelegramService] Missing botToken or chatId. Notification skipped.');
        return;
    }

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: config.chatId,
                text: message,
                parse_mode: 'HTML',
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[TelegramService] Error sending message:', errorData);
        } else {
            console.log('[TelegramService] Message sent successfully');
        }
    } catch (error) {
        console.error('[TelegramService] Network error sending Telegram message:', error);
    }
};

export const formatOrderMessage = (order: any) => {
    const totalAmount = Math.round(order.items.reduce((sum: number, item: any) => sum + (item.finalPrice * item.quantity), 0));
    const timeStr = new Date(order.orderTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });
    
    const tableDisplay = order.floor && order.floor !== 'Unknown' && order.floor !== 'Delivery' 
        ? `${order.tableName} (${order.floor})` 
        : order.tableName;

    let message = `🔔 <b>ออเดอร์ใหม่! #${order.orderNumber}</b>\n`;
    message += `📍 โต๊ะ: ${tableDisplay}\n`;
    message += `👤 ลูกค้า: ${order.customerName || 'ทั่วไป'}\n`;
    message += `🕒 เวลา: ${timeStr}\n`;
    message += `--------------------------\n`;
    
    order.items.forEach((item: any) => {
        message += `• ${item.name} x${item.quantity}\n`;
        if (item.selectedOptions && item.selectedOptions.length > 0) {
            message += `(<i>${item.selectedOptions.map((o: any) => o.name).join(', ')}</i>)\n`;
        }
    });
    
    message += `--------------------------\n`;
    message += `💰 ยอดรวม: <b>฿${totalAmount}</b>`;
    
    if (order.customerPhone) {
        message += `\n📞 เบอร์โทร: ${order.customerPhone}`;
    }
    
    if (order.latitude && order.longitude) {
        message += `\n📍 พิกัด: <a href="https://www.google.com/maps?q=${order.latitude},${order.longitude}">เปิดใน Google Maps</a>`;
    }

    if (order.nearbyLocations) {
        message += `\n🏠 สถานที่ใกล้เคียง: ${order.nearbyLocations}`;
    }
    
    return message;
}

export const formatStaffCallMessage = (call: any) => {
    let message = `<b>🙋 พนักงานครับ/ค่ะ!</b>\n`;
    message += `📍 โต๊ะ: ${call.tableName}\n`;
    message += `👤 ลูกค้า: ${call.customerName || 'ทั่วไป'}\n`;
    message += `🕒 เวลา: ${new Date(call.timestamp).toLocaleTimeString('th-TH')}\n`;
    return message;
};

export const formatLeaveRequestMessage = (request: any) => {
    const typeMap: Record<string, string> = {
        'sick': 'ลาป่วย',
        'personal': 'ลากิจ',
        'vacation': 'ลาไม่รับเงินเดือน',
        'leave-without-pay': 'ลาไม่รับเงินเดือน',
        'other': 'อื่นๆ'
    };

    let message = `<b>📅 คำขอลาหยุดใหม่</b>\n`;
    message += `👤 พนักงาน: ${request.employeeName}\n`;
    message += `📝 ประเภท: ${typeMap[request.type] || request.type}\n`;
    message += `🗓️ วันที่: ${new Date(request.startDate).toLocaleDateString('th-TH')} - ${new Date(request.endDate).toLocaleDateString('th-TH')}\n`;
    if (request.isHalfDay) message += `⏳ (ครึ่งวัน)\n`;
    message += `💬 เหตุผล: ${request.reason}\n`;
    message += `🕒 ส่งเมื่อ: ${new Date(request.submittedAt || Date.now()).toLocaleString('th-TH')}\n`;
    return message;
};
