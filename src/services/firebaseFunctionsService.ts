import { functions } from '../firebaseConfig';
import type { PaymentDetails, OrderItem, LeaveRequest, StockItem } from '../types';

/*
--------------------------------------------------------------------------------
This file acts as the bridge between the frontend React app and the backend
Firebase Cloud Functions. By centralizing function calls here, we keep our
components clean and make it easy to manage our backend API.

This file serves as the definitive "API Contract" for backend developers.
--------------------------------------------------------------------------------
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

// --- Leave Management Payloads ---
export interface SubmitLeaveRequestPayload {
    userId: number;
    username: string;
    branchId: number;
    startDate: number;
    endDate: number;
    type: 'sick' | 'personal' | 'vacation' | 'leave-without-pay' | 'other';
    reason: string;
    isHalfDay?: boolean;
}

interface UpdateLeaveStatusPayload {
    requestId: number;
    status: 'approved' | 'rejected';
    approverId: number;
}

interface DeleteLeaveRequestPayload {
    requestId: number;
}

// --- Stock Management Payloads ---
interface AddStockItemPayload {
    name: string;
    category: string;
    quantity: number;
    unit: string;
    reorderPoint: number;
    branchId: number; // Assuming stock is branch-specific or global
}

interface UpdateStockItemPayload {
    itemId: number;
    name: string;
    category: string;
    unit: string;
    reorderPoint: number;
}

interface AdjustStockQuantityPayload {
    itemId: number;
    adjustment: number; // Positive to add, negative to subtract
}

interface DeleteStockItemPayload {
    itemId: number;
}

interface GenericResponse {
    success: boolean;
    error?: string;
}

// Check if Firebase Functions is initialized
if (!functions) {
    console.error("Firebase Functions is not initialized. Please check your firebaseConfig.");
}

// Create callable function instances
// FIX: Use Firebase v8 compatibility syntax for httpsCallable
const placeOrderFunction = functions ? functions.httpsCallable('placeOrder') : null;
const confirmPaymentFunction = functions ? functions.httpsCallable('confirmPayment') : null;

// Leave Management Functions
const submitLeaveRequestFunction = functions ? functions.httpsCallable('submitLeaveRequest') : null;
const updateLeaveStatusFunction = functions ? functions.httpsCallable('updateLeaveStatus') : null;
const deleteLeaveRequestFunction = functions ? functions.httpsCallable('deleteLeaveRequest') : null;

// Stock Management Functions
const addStockItemFunction = functions ? functions.httpsCallable('addStockItem') : null;
const updateStockItemFunction = functions ? functions.httpsCallable('updateStockItem') : null;
const adjustStockQuantityFunction = functions ? functions.httpsCallable('adjustStockQuantity') : null;
const deleteStockItemFunction = functions ? functions.httpsCallable('deleteStockItem') : null;


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
            return result.data as PlaceOrderResponse;
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
            return result.data as ConfirmPaymentResponse;
        } catch (error) {
            console.error("Error calling confirmPayment function:", error);
            const httpsError = error as { code: string, message: string };
            throw new Error(httpsError.message || 'An unexpected error occurred calling the function.');
        }
    },

    /**
     * Submits a leave request to the backend.
     */
    submitLeaveRequest: async (payload: SubmitLeaveRequestPayload): Promise<GenericResponse> => {
        if (!submitLeaveRequestFunction) {
            return { success: false, error: "Functions not initialized" };
        }
        try {
            const result = await submitLeaveRequestFunction(payload);
            return result.data as GenericResponse;
        } catch (error: any) {
            console.error("Error submitting leave request:", error);
            throw new Error(error.message || "Backend error");
        }
    },

    /**
     * Updates the status of a leave request.
     */
    updateLeaveStatus: async (payload: UpdateLeaveStatusPayload): Promise<GenericResponse> => {
        if (!updateLeaveStatusFunction) {
            return { success: false, error: "Functions not initialized" };
        }
        try {
            const result = await updateLeaveStatusFunction(payload);
            return result.data as GenericResponse;
        } catch (error: any) {
            console.error("Error updating leave status:", error);
            throw new Error(error.message || "Backend error");
        }
    },

    /**
     * Deletes a leave request.
     */
    deleteLeaveRequest: async (payload: DeleteLeaveRequestPayload): Promise<GenericResponse> => {
        if (!deleteLeaveRequestFunction) {
            return { success: false, error: "Functions not initialized" };
        }
        try {
            const result = await deleteLeaveRequestFunction(payload);
            return result.data as GenericResponse;
        } catch (error: any) {
            console.error("Error deleting leave request:", error);
            throw new Error(error.message || "Backend error");
        }
    },

    // --- Stock Functions ---

    addStockItem: async (payload: AddStockItemPayload): Promise<GenericResponse> => {
        if (!addStockItemFunction) return { success: false, error: "Functions not initialized" };
        try {
            const result = await addStockItemFunction(payload);
            return result.data as GenericResponse;
        } catch (error: any) { throw new Error(error.message || "Backend error"); }
    },

    updateStockItem: async (payload: UpdateStockItemPayload): Promise<GenericResponse> => {
        if (!updateStockItemFunction) return { success: false, error: "Functions not initialized" };
        try {
            const result = await updateStockItemFunction(payload);
            return result.data as GenericResponse;
        } catch (error: any) { throw new Error(error.message || "Backend error"); }
    },

    adjustStockQuantity: async (payload: AdjustStockQuantityPayload): Promise<GenericResponse> => {
        if (!adjustStockQuantityFunction) return { success: false, error: "Functions not initialized" };
        try {
            const result = await adjustStockQuantityFunction(payload);
            return result.data as GenericResponse;
        } catch (error: any) { throw new Error(error.message || "Backend error"); }
    },

    deleteStockItem: async (payload: DeleteStockItemPayload): Promise<GenericResponse> => {
        if (!deleteStockItemFunction) return { success: false, error: "Functions not initialized" };
        try {
            const result = await deleteStockItemFunction(payload);
            return result.data as GenericResponse;
        } catch (error: any) { throw new Error(error.message || "Backend error"); }
    }

<<<<<<< HEAD
};
=======
};
>>>>>>> f73113c3cdad676b71adb671543960d98f7459e8
