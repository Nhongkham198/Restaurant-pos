import { functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import type { PaymentDetails, OrderItem } from '../types';

/*
--------------------------------------------------------------------------------
This file acts as the bridge between the frontend React app and the backend
Firebase Cloud Functions. By centralizing function calls here, we keep our
components clean and make it easy to manage our backend API.

This file serves as the definitive "API Contract" for backend developers.
--------------------------------------------------------------------------------

// --- BACKEND DEVELOPER BLUEPRINT ---

// functions/src/index.ts (Example Backend Code)
//
// import * as functions from "firebase-functions";
// import * as admin from "firebase-admin";
//
// admin.initializeApp();
// const db = admin.firestore();

//
// -----------------------------
// --- PLACE ORDER FUNCTION ---
// -----------------------------
//
// export const placeOrder = functions.https.onCall(async (data, context) => {
//   if (!context.auth) { // Or your own authentication check
//     throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
//   }
//
//   const { branchId, items, ...otherOrderData } = data;
//   if (!branchId || !items || items.length === 0) {
//     throw new functions.https.HttpsError("invalid-argument", "Branch ID and items are required.");
//   }
//
//   // --- CRITICAL SECURITY STEP: VALIDATE PRICES ---
//   // NEVER trust prices from the client. Look up each item in the database.
//   const menuItemsRef = db.collection(`branches/${branchId}/menuItems`).doc('data');
//   const menuItemsDoc = await menuItemsRef.get();
//   const allMenuItems = menuItemsDoc.data().value;
//
//   let subtotal = 0;
//   const validatedItems = items.map(clientItem => {
//     const dbItem = allMenuItems.find(mi => mi.id === clientItem.id);
//     if (!dbItem) {
//       throw new functions.https.HttpsError("not-found", `Menu item with ID ${clientItem.id} not found.`);
//     }
//     subtotal += dbItem.price * clientItem.quantity;
//     return {
//       ...dbItem, // Use all data from DB
//       quantity: clientItem.quantity,
//       isTakeaway: clientItem.isTakeaway,
//     };
//   });
//
//   const taxAmount = otherOrderData.taxRate > 0 ? subtotal * (otherOrderData.taxRate / 100) : 0;
//
//   // You need a way to generate order numbers server-side, e.g., using a counter document.
//   const newOrderNumber = await getNextOrderNumber(branchId);
//
//   const newOrder = {
//     ...otherOrderData,
//     id: Date.now(), // Or a more robust ID
//     orderNumber: newOrderNumber,
//     items: validatedItems,
//     taxAmount,
//     status: otherOrderData.sendToKitchen ? 'waiting' : 'served',
//     orderTime: admin.firestore.FieldValue.serverTimestamp(),
//   };
//
//   await db.collection(`branches/${branchId}/activeOrders`).add(newOrder);
//
//   return { success: true, orderNumber: newOrderNumber };
// });

//
// ---------------------------------
// --- CONFIRM PAYMENT FUNCTION ---
// ---------------------------------
//
// export const confirmPayment = functions.https.onCall(async (data, context) => {
//   const { branchId, orderId, paymentDetails } = data;
//
//   // ... validation and authentication ...
//
//   const activeOrderRef = db.collection(`branches/${branchId}/activeOrders`).doc(String(orderId));
//   const completedOrdersColRef = db.collection(`branches/${branchId}/completedOrders`);
//
//   // Use a transaction to ensure atomicity (delete from active, add to completed)
//   return db.runTransaction(async (transaction) => {
//      const activeOrderDoc = await transaction.get(activeOrderRef);
//      if (!activeOrderDoc.exists) {
//        throw new functions.https.HttpsError("not-found", "Active order not found.");
//      }
//
//      const activeOrderData = activeOrderDoc.data();
//      const completedOrder = {
//        ...activeOrderData,
//        completionTime: admin.firestore.FieldValue.serverTimestamp(),
//        paymentDetails,
//      };
//
//      transaction.set(completedOrdersColRef.doc(String(orderId)), completedOrder);
//      transaction.delete(activeOrderRef);
//
//      return { success: true, orderNumber: completedOrder.orderNumber };
//   });
// });

*/


// Types for function payloads and responses
interface PlaceOrderPayload {
    branchId: string;
    tableName: string;
    floor: 'lower' | 'upper';
    customerCount: number;
    items: OrderItem[]; // Use full OrderItem for now to support the fallback logic
    orderType: 'dine-in' | 'takeaway';
    taxRate: number;
    placedBy: string;
    sendToKitchen: boolean;
}

interface PlaceOrderResponse {
    success: boolean;
    orderNumber?: number;
    error?: string;
}

interface ConfirmPaymentPayload {
    branchId: string;
    orderId: number;
    paymentDetails: PaymentDetails;
}

interface ConfirmPaymentResponse {
    success: boolean;
    orderNumber?: number;
    error?: string;
}

// Check if Firebase Functions is initialized
if (!functions) {
    console.error("Firebase Functions is not initialized. Please check your firebaseConfig.");
}

// Create callable function instances
const placeOrderFunction = functions ? httpsCallable<PlaceOrderPayload, PlaceOrderResponse>(functions, 'placeOrder') : null;
const confirmPaymentFunction = functions ? httpsCallable<ConfirmPaymentPayload, ConfirmPaymentResponse>(functions, 'confirmPayment') : null;


// Exported service object
export const functionsService = {
    /**
     * Calls the backend function to create a new order.
     */
    placeOrder: async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
        if (!placeOrderFunction) {
             console.error("Attempted to call 'placeOrder' but Firebase Functions is not initialized.");
            // Return a failure that will trigger the frontend fallback logic.
            return { success: false, error: "Firebase Functions not initialized." };
        }
        try {
            const result = await placeOrderFunction(payload);
            return result.data;
        } catch (error) {
            console.error("Error calling placeOrder function:", error);
            const httpsError = error as { code: string, message: string };
            // Propagate the error to be caught by the calling function, triggering the fallback.
            throw new Error(httpsError.message || 'An unexpected error occurred calling the function.');
        }
    },

    /**
     * Calls the backend function to confirm payment and move an order from active to completed.
     */
    confirmPayment: async (payload: ConfirmPaymentPayload): Promise<ConfirmPaymentResponse> => {
        if (!confirmPaymentFunction) {
             console.error("Attempted to call 'confirmPayment' but Firebase Functions is not initialized.");
            return { success: false, error: "Firebase Functions not initialized." };
        }
        try {
            const result = await confirmPaymentFunction(payload);
            return result.data;
        } catch (error) {
            console.error("Error calling confirmPayment function:", error);
            const httpsError = error as { code: string, message: string };
            // Propagate the error to be caught by the calling function, triggering the fallback.
            throw new Error(httpsError.message || 'An unexpected error occurred calling the function.');
        }
    },

};