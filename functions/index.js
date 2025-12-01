// functions/index.js (To be deployed to Firebase Cloud Functions)

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

// --- Google Sheet Configuration (USER MUST EDIT THIS) ---
const SPREADSHEET_ID = '1aBUMvmYLZMfn1ycjWROgrjldeMddGzgT7WooHSB3CN4'; 
const SHEET_NAME = 'Sheet1'; 

admin.initializeApp();

/**
 * This Cloud Function triggers when the 'activeOrders' document for any branch is updated.
 * It detects when a new order is added and sends a high-priority push notification
 * to all kitchen staff of that branch who have a registered Android device.
 */
exports.sendHighPriorityOrderNotification = functions.region('asia-southeast1').firestore
    .document('branches/{branchId}/activeOrders/data')
    .onUpdate(async (change, context) => {
        const ordersBefore = change.before.data().value || [];
        const ordersAfter = change.after.data().value || [];

        if (ordersAfter.length <= ordersBefore.length) {
            console.log('No new order detected. Exiting function.');
            return null;
        }
        
        const ordersBeforeIds = new Set(ordersBefore.map(o => o.id));
        const newOrder = ordersAfter.find(o => !ordersBeforeIds.has(o.id));

        if (!newOrder) {
            console.log('Could not determine the new order. Exiting function.');
            return null;
        }

        console.log(`New order detected: #${newOrder.orderNumber} for Table ${newOrder.tableName} in branch ${context.params.branchId}`);

        const usersDoc = await admin.firestore().collection('users').doc('data').get();
        if (!usersDoc.exists) {
            console.error('Users document not found!');
            return null;
        }
        const allUsers = usersDoc.data().value || [];

        const branchIdNumber = parseInt(context.params.branchId, 10);
        const allKitchenStaffTokens = allUsers
            .filter(user => 
                user.role === 'kitchen' &&
                user.fcmTokens && Array.isArray(user.fcmTokens) && user.fcmTokens.length > 0 &&
                user.allowedBranchIds &&
                user.allowedBranchIds.includes(branchIdNumber)
            )
            .flatMap(user => user.fcmTokens);

        const kitchenStaffTokens = [...new Set(allKitchenStaffTokens)];

        if (kitchenStaffTokens.length === 0) {
            console.log('No kitchen staff with registered devices found for this branch.');
            return null;
        }
        
        console.log(`Found ${kitchenStaffTokens.length} kitchen staff tokens to notify.`);

        const notificationTitle = '🔔 มีออเดอร์ใหม่!';
        const notificationBody = `โต๊ะ ${newOrder.tableName} (ออเดอร์ #${String(newOrder.orderNumber).padStart(3, '0')})`;

        const message = {
            notification: {
                title: notificationTitle,
                body: notificationBody,
            },
            data: {
                title: notificationTitle,
                body: notificationBody,
                icon: '/icon.svg',
                sound: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/sounds%2Fdefault-notification.mp3?alt=media',
                vibrate: '[200, 100, 200]'
            },
            android: {
                priority: 'high'
            },
            tokens: kitchenStaffTokens
        };

        try {
            const response = await admin.messaging().sendMulticast(message);
            console.log('Successfully sent message:', response.successCount, 'successes,', response.failureCount, 'failures');
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(kitchenStaffTokens[idx]);
                    }
                });
                console.log('List of tokens that caused failures: ' + failedTokens);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
        
        return null;
    });

/**
 * REBUILT: This single Cloud Function triggers on any update to completed orders.
 * It intelligently detects CREATION (SALE), MODIFICATION (EDIT), and DELETION (DELETE)
 * and logs the appropriate action to Google Sheets.
 */
exports.logSalesAndEditsToSheet = functions.region('asia-southeast1').firestore
    .document('branches/{branchId}/completedOrders/data')
    .onUpdate(async (change, context) => {

        const ordersBefore = change.before.exists ? change.before.data().value || [] : [];
        const ordersAfter = change.after.exists ? change.after.data().value || [] : [];
        
        // --- AUTHENTICATION ---
        let sheets;
        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: './service-account.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            sheets = google.sheets({ version: 'v4', auth });
        } catch (error) {
            console.error('Google Sheets: Authentication failed!', error.message);
            return; // Stop execution if auth fails
        }

        // --- HELPER FUNCTION TO WRITE A ROW ---
        const writeToSheet = async (order, action) => {
            try {
                const totalAmount = order.items.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0) + order.taxAmount;
                const logTimestamp = (action === 'SALE' || action === 'DELETE') ? (order.completionTime || Date.now()) : Date.now();
                
                const timestamp = new Date(logTimestamp).toLocaleString('th-TH', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
                
                const itemsString = order.items.map(item => `${item.quantity}x ${item.name}`).join(', ');

                const values = [
                    action,
                    timestamp,
                    order.orderNumber,
                    order.tableName,
                    order.customerName || '',
                    totalAmount,
                    order.paymentDetails?.method || (action === 'DELETE' ? 'N/A' : ''),
                    order.placedBy,
                    itemsString
                ];

                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [values] },
                });
                
                console.log(`Google Sheets: Successfully logged action '${action}' for order #${order.orderNumber}.`);
            } catch (error) {
                console.error(`Google Sheets: Error logging action '${action}' for order #${order.orderNumber}:`, error.message);
            }
        };

        const beforeMap = new Map(ordersBefore.map(o => [o.id, o]));
        const afterMap = new Map(ordersAfter.map(o => [o.id, o]));
        const promises = [];

        // 1. Check for NEW SALES and EDITS by iterating through the new state
        for (const orderAfter of ordersAfter) {
            const orderBefore = beforeMap.get(orderAfter.id);
            if (!orderBefore) {
                console.log(`Google Sheets: Detected SALE for order #${orderAfter.orderNumber}.`);
                promises.push(writeToSheet(orderAfter, 'SALE'));
            } else if (JSON.stringify(orderBefore) !== JSON.stringify(orderAfter)) {
                console.log(`Google Sheets: Detected EDIT for order #${orderAfter.orderNumber}.`);
                promises.push(writeToSheet(orderAfter, 'EDIT'));
            }
        }

        // 2. Check for DELETIONS by iterating through the old state
        for (const orderBefore of ordersBefore) {
            if (!afterMap.has(orderBefore.id)) {
                console.log(`Google Sheets: Detected DELETE for order #${orderBefore.orderNumber}.`);
                promises.push(writeToSheet(orderBefore, 'DELETE'));
            }
        }
        
        if (promises.length > 0) {
            await Promise.all(promises);
            console.log(`Google Sheets: Finished processing ${promises.length} event(s).`);
        } else {
            console.log('Google Sheets: No new sales, edits, or deletions detected.');
        }

        return null;
    });