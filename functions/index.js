// functions/index.js (To be deployed to Firebase Cloud Functions)

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * This Cloud Function triggers when the 'activeOrders' document for any branch is updated.
 * It detects when a new order is added and sends a high-priority push notification
 * to all kitchen staff of that branch who have a registered Android device.
 */
exports.sendHighPriorityOrderNotification = functions.region('asia-southeast1').firestore
    .document('branches/{branchId}/activeOrders/data')
    .onUpdate(async (change, context) => {
        // Get the array of orders before and after the change.
        const ordersBefore = change.before.data().value || [];
        const ordersAfter = change.after.data().value || [];

        // Find the newly added order. We assume only one order is added at a time from the POS.
        if (ordersAfter.length <= ordersBefore.length) {
            console.log('No new order detected. Exiting function.');
            return null;
        }
        
        // A simple way to find the new order is to find one that doesn't exist in the 'before' list.
        const ordersBeforeIds = new Set(ordersBefore.map(o => o.id));
        const newOrder = ordersAfter.find(o => !ordersBeforeIds.has(o.id));

        if (!newOrder) {
            console.log('Could not determine the new order. Exiting function.');
            return null;
        }

        console.log(`New order detected: #${newOrder.orderNumber} for Table ${newOrder.tableName} in branch ${context.params.branchId}`);

        // Get all users from the 'users/data' document.
        const usersDoc = await admin.firestore().collection('users').doc('data').get();
        if (!usersDoc.exists) {
            console.error('Users document not found!');
            return null;
        }
        const allUsers = usersDoc.data().value || [];

        // Filter for kitchen staff in the relevant branch who have an FCM token.
        const branchIdNumber = parseInt(context.params.branchId, 10);
        const kitchenStaffTokens = allUsers
            .filter(user => 
                user.role === 'kitchen' &&
                user.fcmToken &&
                user.allowedBranchIds &&
                user.allowedBranchIds.includes(branchIdNumber)
            )
            .map(user => user.fcmToken);

        if (kitchenStaffTokens.length === 0) {
            console.log('No kitchen staff with registered devices found for this branch.');
            return null;
        }
        
        console.log(`Found ${kitchenStaffTokens.length} kitchen staff tokens to notify.`);

        // Construct the high-priority message payload.
        const message = {
            notification: {
                title: '🔔 มีออเดอร์ใหม่!',
                body: `โต๊ะ ${newOrder.tableName} (ออเดอร์ #${String(newOrder.orderNumber).padStart(3, '0')})`
            },
            android: {
                priority: 'high' // This is the crucial part for high-priority delivery.
            },
            tokens: kitchenStaffTokens
        };

        // Send the message using the FCM Admin SDK.
        try {
            const response = await admin.messaging().sendMulticast(message);
            console.log('Successfully sent message:', response);
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(kitchenStaffTokens[idx]);
                    }
                });
                console.log('List of tokens that caused failures: ' + failedTokens);
                // Here you could add logic to clean up invalid tokens from the user documents.
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
        
        return null;
    });
