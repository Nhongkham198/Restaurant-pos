
// functions/index.js (To be deployed to Firebase Cloud Functions)

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Only initialize once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * This Cloud Function triggers when a NEW document is created in the 'activeOrders' collection.
 * UPDATED: Listens to the specific document path for the new collection-based architecture.
 */
exports.sendHighPriorityOrderNotification = functions.region('asia-southeast1').firestore
    .document('branches/{branchId}/activeOrders/{orderId}')
    .onCreate(async (snap, context) => {
        // Get the newly created order data directly
        const newOrder = snap.data();

        if (!newOrder) {
            console.log('No order data found.');
            return null;
        }

        console.log(`New order detected: #${newOrder.orderNumber} for Table ${newOrder.tableName} in branch ${context.params.branchId}`);

        // Get all users from the 'users/data' document to find tokens.
        const usersDoc = await admin.firestore().collection('users').doc('data').get();
        if (!usersDoc.exists) {
            console.error('Users document not found!');
            return null;
        }
        const allUsers = usersDoc.data().value || [];

        // Filter for kitchen staff, collect all their tokens from the `fcmTokens` array.
        const branchIdNumber = parseInt(context.params.branchId, 10);
        const targetRoles = ['kitchen']; // Send only to Kitchen
        const allStaffTokens = allUsers
            .filter(user => 
                targetRoles.includes(user.role) && 
                user.fcmTokens && Array.isArray(user.fcmTokens) && user.fcmTokens.length > 0 &&
                user.allowedBranchIds &&
                user.allowedBranchIds.includes(branchIdNumber)
            )
            .flatMap(user => user.fcmTokens); 

        // Remove duplicate tokens
        const staffTokens = [...new Set(allStaffTokens)];

        if (staffTokens.length === 0) {
            console.log('No Kitchen staff with registered devices found for this branch.');
            return null;
        }
        
        console.log(`Found ${staffTokens.length} Kitchen staff tokens to notify.`);

        // Construct the high-priority message payload.
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
                // Ensure this sound URL is valid and accessible
                sound: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/sounds%2Fdefault-notification.mp3?alt=media',
                vibrate: '[200, 100, 200]',
                url: '/?view=kitchen' // Open kitchen view on click
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'high_importance_channel',
                    sound: 'default'
                }
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

        // --- NEW: Send LINE Notification for Staff Call ---
        try {
            const [tokenDoc, userIdDoc] = await Promise.all([
                admin.firestore().doc(`branches/${context.params.branchId}/lineMessagingToken/data`).get(),
                admin.firestore().doc(`branches/${context.params.branchId}/lineUserId/data`).get()
            ]);

            const lineToken = tokenDoc.exists ? tokenDoc.data().value : null;
            const lineUserId = userIdDoc.exists ? userIdDoc.data().value : null;

            if (lineToken && lineUserId) {
                const https = require('https');
                const lineMessage = JSON.stringify({
                    to: lineUserId,
                    messages: [{ type: 'text', text: `🔔 ลูกค้าเรียกพนักงาน!\nโต๊ะ: ${newCall.tableName}\nคุณ: ${newCall.customerName}\nต้องการความช่วยเหลือ` }]
                });

                const options = {
                    hostname: 'api.line.me',
                    path: '/v2/bot/message/push',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${lineToken}`,
                        'Content-Length': Buffer.byteLength(lineMessage)
                    }
                };

                await new Promise((resolve) => {
                    const req = https.request(options, (res) => {
                        res.on('data', () => {});
                        res.on('end', () => resolve());
                    });
                    req.on('error', () => resolve());
                    req.write(lineMessage);
                    req.end();
                });
            }
        } catch (error) {
            console.error('Failed to send LINE staff call notification:', error);
        }

        return null;
    });

/**
 * Scheduled function to delete old slip images (older than 2 days).
 * NOTE: This function requires the Firebase "Blaze" (Pay-as-you-go) plan because it uses Cloud Scheduler.
 * It runs every day at 3:00 AM.
 * 
 * UPDATE: Also cleans up Base64 strings in Firestore 'completedOrders_v2' documents (New Collection).
 */
exports.cleanupOldData = functions.region('asia-southeast1').pubsub.schedule('0 4 * * *')
  .timeZone('Asia/Bangkok')
  .onRun(async (context) => {
    // ... (existing code)
    return null;
});

/**
 * Triggered when a new order is created in 'activeOrders'.
 * Sends a LINE Messaging API Push Message if configured.
 * Replaces the discontinued LINE Notify.
 */
exports.sendLineOrderNotification = functions.region('asia-southeast1').firestore
    .document('branches/{branchId}/activeOrders/{orderId}')
    .onCreate(async (snap, context) => {
        const newOrder = snap.data();
        const branchId = context.params.branchId;

        if (!newOrder) return null;

        // 1. Get Branch Config (LINE Token & User ID) from sub-documents
        // Based on useFirestoreSync logic: branches/{branchId}/{collectionKey}/data
        const [tokenDoc, userIdDoc] = await Promise.all([
            admin.firestore().doc(`branches/${branchId}/lineMessagingToken/data`).get(),
            admin.firestore().doc(`branches/${branchId}/lineUserId/data`).get()
        ]);

        const lineToken = tokenDoc.exists ? tokenDoc.data().value : null;
        const lineUserId = userIdDoc.exists ? userIdDoc.data().value : null;

        if (!lineToken || !lineUserId) {
            console.log(`LINE Messaging API not configured for branch ${branchId}. (Token: ${!!lineToken}, ID: ${!!lineUserId})`);
            return null;
        }

        console.log(`Sending LINE notification for Order #${newOrder.orderNumber} to ${lineUserId}`);

        // 2. Construct Message
        const totalAmount = newOrder.items.reduce((sum, item) => sum + (item.finalPrice * item.quantity), 0).toFixed(2);
        const itemCount = newOrder.items.length;
        
        const messageText = `🔔 มีออเดอร์ใหม่!\n` +
                            `โต๊ะ: ${newOrder.tableName}\n` +
                            `ออเดอร์: #${newOrder.orderNumber}\n` +
                            `จำนวน: ${itemCount} รายการ\n` +
                            `ยอดรวม: ${totalAmount} บาท`;

        // 3. Send Request to LINE Messaging API using built-in https module
        try {
            const https = require('https');
            const postData = JSON.stringify({
                to: lineUserId,
                messages: [
                    {
                        type: 'text',
                        text: messageText
                    }
                ]
            });

            const options = {
                hostname: 'api.line.me',
                path: '/v2/bot/message/push',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${lineToken}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            await new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log('LINE notification sent successfully.');
                            resolve();
                        } else {
                            console.error('LINE API Error:', body);
                            resolve(); // Resolve anyway to not crash the function
                        }
                    });
                });

                req.on('error', (e) => {
                    console.error('Failed to send LINE notification:', e.message);
                    resolve();
                });

                req.write(postData);
                req.end();
            });
        } catch (error) {
            console.error('Failed to send LINE notification:', error);
        }

        return null;
    });

/**
 * HTTPS Callable function to test LINE Notification settings.
 * Call this from the frontend to verify Token and User/Group ID.
 */
exports.testLineNotification = functions.region('asia-southeast1').https.onCall(async (data, context) => {
    const { token, targetId } = data;

    if (!token || !targetId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing token or targetId');
    }

    try {
        // Use built-in https module to avoid dependency issues with axios/fetch
        const https = require('https');
        
        const postData = JSON.stringify({
            to: targetId,
            messages: [
                {
                    type: 'text',
                    text: '✅ ทดสอบการเชื่อมต่อสำเร็จ!\nบอทพร้อมแจ้งเตือนออเดอร์แล้วครับ'
                }
            ]
        });

        const options = {
            hostname: 'api.line.me',
            path: '/v2/bot/message/push',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true });
                    } else {
                        console.error('LINE API Error:', body);
                        resolve({ success: false, error: body });
                    }
                });
            });

            req.on('error', (e) => {
                console.error('Request Error:', e.message);
                resolve({ success: false, error: e.message });
            });

            req.write(postData);
            req.end();
        });

    } catch (error) {
        console.error('Test Notification Failed:', error);
        return { success: false, error: error.message };
    }
});

/**
 * Webhook for LINE Messaging API.
 * Use this to get Group ID when the bot joins a group.
 * Set Webhook URL in LINE Developers to: https://asia-southeast1-<YOUR_PROJECT_ID>.cloudfunctions.net/lineWebhook
 */
exports.lineWebhook = functions.region('asia-southeast1').https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const events = req.body.events || [];
    for (const event of events) {
        console.log('Received LINE Event:', JSON.stringify(event));
        
        if (event.type === 'join' || event.type === 'memberJoined' || event.type === 'message') {
            const source = event.source;
            if (source.type === 'group') {
                console.log(`📢 Group ID found: ${source.groupId}`);
            } else if (source.type === 'room') {
                console.log(`📢 Room ID found: ${source.roomId}`);
            } else if (source.type === 'user') {
                console.log(`📢 User ID found: ${source.userId}`);
            }
        }
    }

    res.status(200).send('OK');
});
