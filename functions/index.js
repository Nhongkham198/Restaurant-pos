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

        // Filter for kitchen staff, collect all their tokens from the `fcmTokens` array.
        const branchIdNumber = parseInt(context.params.branchId, 10);
        const allKitchenStaffTokens = allUsers
            .filter(user => 
                user.role === 'kitchen' &&
                user.fcmTokens && Array.isArray(user.fcmTokens) && user.fcmTokens.length > 0 &&
                user.allowedBranchIds &&
                user.allowedBranchIds.includes(branchIdNumber)
            )
            .flatMap(user => user.fcmTokens); // Use flatMap to get all tokens into a single array.

        // Remove duplicate tokens to avoid sending multiple notifications to the same device.
        const kitchenStaffTokens = [...new Set(allKitchenStaffTokens)];

        if (kitchenStaffTokens.length === 0) {
            console.log('No kitchen staff with registered devices found for this branch.');
            return null;
        }
        
        console.log(`Found ${kitchenStaffTokens.length} kitchen staff tokens to notify.`);

        // Construct the high-priority message payload.
        // We include a 'data' payload for the service worker to have more control.
        const notificationTitle = '🔔 มีออเดอร์ใหม่!';
        const notificationBody = `โต๊ะ ${newOrder.tableName} (ออเดอร์ #${String(newOrder.orderNumber).padStart(3, '0')})`;

        const message = {
            // Basic notification for simple display (iOS, etc.)
            notification: {
                title: notificationTitle,
                body: notificationBody,
            },
            // Custom data payload for our Service Worker to build a rich notification
            data: {
                title: notificationTitle,
                body: notificationBody,
                icon: '/icon.svg',
                // The crucial part for sound and vibration
                // This URL must be publicly accessible. Using a default sound stored in Firebase Storage.
                sound: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/sounds%2Fdefault-notification.mp3?alt=media',
                vibrate: '[200, 100, 200]' // A standard vibration pattern: vibrate 200ms, pause 100ms, vibrate 200ms
            },
            android: {
                priority: 'high' // This is the crucial part for high-priority delivery.
            },
            tokens: kitchenStaffTokens
        };

        // Send the message using the FCM Admin SDK.
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