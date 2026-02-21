import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { MenuItem, OrderItem } from '../types';

export const useOrderPreparationLogic = () => {
    const { 
        setCurrentOrderItems,
        setCurrentCustomerName,
        setCurrentCustomerCount,
        setSelectedTableId
    } = useData();

    const { 
        setModalState, 
        setItemToCustomize, 
        setOrderItemToEdit, 
        orderItemToEdit,
        handleModalClose
    } = useUI();

    const handleClearOrder = () => { 
        setCurrentOrderItems([]); 
        setCurrentCustomerName(''); 
        setCurrentCustomerCount(1); 
        setSelectedTableId(null); 
    };

    const handleAddItemToOrder = (item: MenuItem) => { 
        setItemToCustomize(item); 
        setModalState(prev => ({ ...prev, isCustomization: true, isMenuSearch: false })); 
    };

    const handleConfirmCustomization = (itemToAdd: OrderItem) => { 
        setCurrentOrderItems(prevItems => { 
            const existingItemIndex = prevItems.findIndex(i => i.cartItemId === (orderItemToEdit?.cartItemId || itemToAdd.cartItemId)); 
            if (orderItemToEdit) { 
                const newItems = [...prevItems]; 
                newItems[existingItemIndex] = { ...itemToAdd, quantity: orderItemToEdit.quantity }; 
                return newItems; 
            } else { 
                if (existingItemIndex !== -1) { 
                    const newItems = [...prevItems]; 
                    newItems[existingItemIndex].quantity += itemToAdd.quantity; 
                    return newItems; 
                } else { 
                    return [...prevItems, itemToAdd]; 
                } 
            } 
        }); 
        handleModalClose(); 
    };

    const handleUpdateOrderItem = (itemToUpdate: OrderItem) => { 
        setItemToCustomize(itemToUpdate); 
        setOrderItemToEdit(itemToUpdate); 
        setModalState(prev => ({ ...prev, isCustomization: true })); 
    };

    const handleQuantityChange = (cartItemId: string, newQuantity: number) => { 
        setCurrentOrderItems(prevItems => { 
            if (newQuantity <= 0) return prevItems.filter(i => i.cartItemId !== cartItemId); 
            return prevItems.map(i => i.cartItemId === cartItemId ? { ...i, quantity: newQuantity } : i); 
        }); 
    };

    const handleRemoveItem = (cartItemId: string) => { 
        setCurrentOrderItems(prevItems => prevItems.filter(i => i.cartItemId !== cartItemId)); 
    };

    return {
        handleClearOrder,
        handleAddItemToOrder,
        handleConfirmCustomization,
        handleUpdateOrderItem,
        handleQuantityChange,
        handleRemoveItem
    };
};
