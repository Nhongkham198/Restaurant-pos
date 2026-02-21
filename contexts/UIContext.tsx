import React, { createContext, useContext, useState, ReactNode } from 'react';
import { View, MenuItem, OrderItem, ActiveOrder, CompletedOrder } from '../types';

interface ModalState {
    isMenuItem: boolean;
    isOrderSuccess: boolean;
    isSplitBill: boolean;
    isTableBill: boolean;
    isPayment: boolean;
    isPaymentSuccess: boolean;
    isSettings: boolean;
    isEditCompleted: boolean;
    isUserManager: boolean;
    isBranchManager: boolean;
    isMoveTable: boolean;
    isCancelOrder: boolean;
    isCashBill: boolean;
    isSplitCompleted: boolean;
    isCustomization: boolean;
    isLeaveRequest: boolean;
    isMenuSearch: boolean;
    isMergeBill: boolean;
}

interface UIContextType {
    // View State
    currentView: View;
    setCurrentView: React.Dispatch<React.SetStateAction<View>>;
    isEditMode: boolean;
    setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
    isAdminSidebarCollapsed: boolean;
    setIsAdminSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    isOrderSidebarVisible: boolean;
    setIsOrderSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;

    // Modal State
    modalState: ModalState;
    setModalState: React.Dispatch<React.SetStateAction<ModalState>>;
    
    // Modal Data
    itemToEdit: MenuItem | null;
    setItemToEdit: React.Dispatch<React.SetStateAction<MenuItem | null>>;
    itemToCustomize: MenuItem | null;
    setItemToCustomize: React.Dispatch<React.SetStateAction<MenuItem | null>>;
    orderItemToEdit: OrderItem | null;
    setOrderItemToEdit: React.Dispatch<React.SetStateAction<OrderItem | null>>;
    orderForModal: ActiveOrder | CompletedOrder | null;
    setOrderForModal: React.Dispatch<React.SetStateAction<ActiveOrder | CompletedOrder | null>>;
    leaveRequestInitialDate: Date | null;
    setLeaveRequestInitialDate: React.Dispatch<React.SetStateAction<Date | null>>;

    // Helper Functions
    openModal: (modalName: keyof ModalState) => void;
    closeModal: (modalName: keyof ModalState) => void;
    closeAllModals: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // --- VIEW & EDIT MODE STATE ---
    const [currentView, setCurrentView] = useState<View>(() => {
        const storedView = localStorage.getItem('currentView');
        if (storedView && ['pos', 'kitchen', 'tables', 'dashboard', 'history', 'stock', 'leave', 'stock-analytics', 'leave-analytics', 'maintenance'].includes(storedView)) {
            return storedView as View;
        }
        return 'pos';
    });
    const [isEditMode, setIsEditMode] = useState(false);
    const [isAdminSidebarCollapsed, setIsAdminSidebarCollapsed] = useState(false);
    const [isOrderSidebarVisible, setIsOrderSidebarVisible] = useState(true);

    // --- MODAL STATES ---
    const [modalState, setModalState] = useState<ModalState>({
        isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false,
        isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false,
        isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false,
        isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false,
        isMenuSearch: false, isMergeBill: false
    });

    const [itemToEdit, setItemToEdit] = useState<MenuItem | null>(null);
    const [itemToCustomize, setItemToCustomize] = useState<MenuItem | null>(null);
    const [orderItemToEdit, setOrderItemToEdit] = useState<OrderItem | null>(null); 
    const [orderForModal, setOrderForModal] = useState<ActiveOrder | CompletedOrder | null>(null);
    const [leaveRequestInitialDate, setLeaveRequestInitialDate] = useState<Date | null>(null);

    const openModal = (modalName: keyof ModalState) => {
        setModalState(prev => ({ ...prev, [modalName]: true }));
    };

    const closeModal = (modalName: keyof ModalState) => {
        setModalState(prev => ({ ...prev, [modalName]: false }));
    };

    const closeAllModals = () => {
        setModalState({
            isMenuItem: false, isOrderSuccess: false, isSplitBill: false, isTableBill: false,
            isPayment: false, isPaymentSuccess: false, isSettings: false, isEditCompleted: false,
            isUserManager: false, isBranchManager: false, isMoveTable: false, isCancelOrder: false,
            isCashBill: false, isSplitCompleted: false, isCustomization: false, isLeaveRequest: false,
            isMenuSearch: false, isMergeBill: false
        });
    };

    return (
        <UIContext.Provider value={{
            currentView, setCurrentView,
            isEditMode, setIsEditMode,
            isAdminSidebarCollapsed, setIsAdminSidebarCollapsed,
            isOrderSidebarVisible, setIsOrderSidebarVisible,
            modalState, setModalState,
            itemToEdit, setItemToEdit,
            itemToCustomize, setItemToCustomize,
            orderItemToEdit, setOrderItemToEdit,
            orderForModal, setOrderForModal,
            leaveRequestInitialDate, setLeaveRequestInitialDate,
            openModal, closeModal, closeAllModals
        }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUI = () => {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
};
