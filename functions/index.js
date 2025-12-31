
// functions/index.js (To be deployed to Firebase Cloud Functions)

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Only initialize once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

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
        const targetRoles = ['kitchen']; // MODIFIED: Only target kitchen staff
        const allStaffTokens = allUsers
            .filter(user => 
                targetRoles.includes(user.role) && // Send only to Kitchen
                user.fcmTokens && Array.isArray(user.fcmTokens) && user.fcmTokens.length > 0 &&
                user.allowedBranchIds &&
                user.allowedBranchIds.includes(branchIdNumber)
            )
            .flatMap(user => user.fcmTokens); // Use flatMap to get all tokens into a single array.

        // Remove duplicate tokens to avoid sending multiple notifications to the same device.
        const staffTokens = [...new Set(allStaffTokens)];

        if (staffTokens.length === 0) {
            console.log('No Kitchen staff with registered devices found for this branch.');
            return null;
        }
        
        console.log(`Found ${staffTokens.length} Kitchen staff tokens to notify.`);

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
            tokens: staffTokens
        };

        // Send the message using the FCM Admin SDK.
        try {
            const response = await admin.messaging().sendMulticast(message);
            console.log('Successfully sent message:', response.successCount, 'successes,', response.failureCount, 'failures');
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(staffTokens[idx]);
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
 * This Cloud Function triggers when the 'staffCalls' document for any branch is updated.
 * It sends a high-priority notification to POS, Admin, Branch-Admin, and Kitchen staff
 * when a customer requests assistance.
 */
exports.sendStaffCallNotification = functions.region('asia-southeast1').firestore
    .document('branches/{branchId}/staffCalls/data')
    .onUpdate(async (change, context) => {
        const callsBefore = change.before.data().value || [];
        const callsAfter = change.after.data().value || [];

        // Check if a new call was added
        if (callsAfter.length <= callsBefore.length) return null;

        const callsBeforeIds = new Set(callsBefore.map(c => c.id));
        const newCall = callsAfter.find(c => !callsBeforeIds.has(c.id));

        if (!newCall) return null;

        const usersDoc = await admin.firestore().collection('users').doc('data').get();
        if (!usersDoc.exists) return null;
        const allUsers = usersDoc.data().value || [];

        const branchIdNumber = parseInt(context.params.branchId, 10);
        // Roles that should receive staff calls
        const targetRoles = ['pos', 'branch-admin', 'admin', 'kitchen'];

        const staffTokens = allUsers
            .filter(user => 
                targetRoles.includes(user.role) &&
                user.fcmTokens && Array.isArray(user.fcmTokens) && user.fcmTokens.length > 0 &&
                // Admin gets everything, others must match branch
                (user.role === 'admin' || (user.allowedBranchIds && user.allowedBranchIds.includes(branchIdNumber)))
            )
            .flatMap(user => user.fcmTokens);

        const uniqueTokens = [...new Set(staffTokens)];

        if (uniqueTokens.length === 0) return null;

        const title = '🔔 ลูกค้าเรียกพนักงาน!';
        const body = `โต๊ะ ${newCall.tableName} (คุณ ${newCall.customerName}) ต้องการความช่วยเหลือ`;

        const message = {
            notification: {
                title: title,
                body: body,
            },
            data: {
                title: title,
                body: body,
                icon: '/icon.svg',
                sound: 'default',
                vibrate: '[200, 100, 200]'
            },
            android: { priority: 'high' },
            tokens: uniqueTokens
        };

        try {
            await admin.messaging().sendMulticast(message);
            console.log(`Sent staff call notification to ${uniqueTokens.length} devices.`);
        } catch (error) {
            console.error('Error sending staff call notification:', error);
        }
        return null;
    });

/**
 * Scheduled function to delete old slip images (older than 2 days).
 * NOTE: This function requires the Firebase "Blaze" (Pay-as-you-go) plan because it uses Cloud Scheduler.
 * It runs every day at 3:00 AM.
 * 
 * UPDATE: Also cleans up Base64 strings in Firestore 'completedOrders' documents.
 */
exports.cleanupOldData = functions.region('asia-southeast1').pubsub.schedule('0 4 * * *')
  .timeZone('Asia/Bangkok')
  .onRun(async (context) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 2); // 2 days ago
    const cutoffTimestamp = cutoffDate.getTime();

    console.log(`Starting cleanup for data older than ${cutoffDate.toISOString()}`);

    // 1. Cleanup Storage Files (Legacy)
    const bucket = admin.storage().bucket();
    try {
      const [files] = await bucket.getFiles({ prefix: 'slips/' });
      let deletedFiles = 0;
      for (const file of files) {
        const fileDate = new Date(file.metadata.timeCreated);
        if (fileDate < cutoffDate) {
          await file.delete().catch(e => console.error(`Failed to delete file ${file.name}`, e));
          deletedFiles++;
        }
      }
      console.log(`Deleted ${deletedFiles} old storage files.`);
    } catch (error) {
      console.error('Error cleaning storage:', error);
    }

    // 2. Cleanup Base64 strings in Firestore Documents
    // We iterate through all branches to find 'completedOrders' docs
    try {
        const branchesSnapshot = await admin.firestore().collection('branches').get();
        
        for (const branchDoc of branchesSnapshot.docs) {
            const branchId = branchDoc.id;
            const completedOrdersRef = admin.firestore().doc(`branches/${branchId}/completedOrders/data`);
            
            // Transaction to ensure atomic read/write of the large array
            await admin.firestore().runTransaction(async (transaction) => {
                const doc = await transaction.get(completedOrdersRef);
                if (!doc.exists) return;

                const orders = doc.data().value || [];
                let modified = false;
                
                // Map through orders, strip slipImage if old
                const cleanedOrders = orders.map(order => {
                    // Check if order is older than 2 days AND has a slip image
                    if (order.completionTime < cutoffTimestamp && order.paymentDetails && order.paymentDetails.slipImage) {
                        modified = true;
                        return {
                            ...order,
                            paymentDetails: {
                                ...order.paymentDetails,
                                slipImage: null // Clear the heavy string
                            }
                        };
                    }
                    return order;
                });

                if (modified) {
                    transaction.update(completedOrdersRef, { value: cleanedOrders });
                    console.log(`Cleaned up Base64 slips in branch ${branchId}`);
                }
            });
        }
    } catch (error) {
        console.error('Error cleaning Firestore documents:', error);
    }

    return null;
});
