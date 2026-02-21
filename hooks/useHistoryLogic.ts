import { useData } from '../contexts/DataContext';

export const useHistoryLogic = () => {
    const { 
        currentUser,
        newCompletedOrders,
        newCompletedOrdersActions,
        newCancelledOrders,
        newCancelledOrdersActions,
        setLegacyCompletedOrders,
        setLegacyCancelledOrders,
        setPrintHistory
    } = useData();

    const handleDeleteHistory = async (completedIds: number[], cancelledIds: number[], printIds: number[]) => { 
        if (!currentUser) return; 
        const username = currentUser.username; 
        const isAdmin = currentUser.role === 'admin'; 
        
        if (completedIds.length > 0) { 
            const newIds = completedIds.filter(id => newCompletedOrders.some(o => o.id === id)); 
            const legacyIds = completedIds.filter(id => !newIds.includes(id)); 
            for (const id of newIds) { 
                if (isAdmin) { 
                    await newCompletedOrdersActions.remove(id); 
                } else { 
                    await newCompletedOrdersActions.update(id, { isDeleted: true, deletedBy: username }); 
                } 
            } 
            if (legacyIds.length > 0) { 
                setLegacyCompletedOrders(prev => { 
                    if (isAdmin) return prev.filter(o => !legacyIds.includes(o.id)); 
                    return prev.map(o => legacyIds.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o); 
                }); 
            } 
        } 
        
        if (cancelledIds.length > 0) { 
            const newIds = cancelledIds.filter(id => newCancelledOrders.some(o => o.id === id)); 
            const legacyIds = cancelledIds.filter(id => !newIds.includes(id)); 
            for (const id of newIds) { 
                if (isAdmin) { 
                    await newCancelledOrdersActions.remove(id); 
                } else { 
                    await newCancelledOrdersActions.update(id, { isDeleted: true, deletedBy: username }); 
                } 
            } 
            if (legacyIds.length > 0) { 
                setLegacyCancelledOrders(prev => { 
                    if (isAdmin) return prev.filter(o => !legacyIds.includes(o.id)); 
                    return prev.map(o => legacyIds.includes(o.id) ? { ...o, isDeleted: true, deletedBy: username } : o); 
                }); 
            } 
        } 
        
        if (printIds.length > 0) { 
            setPrintHistory(prev => { 
                if (isAdmin) return prev.filter(p => !printIds.includes(p.id)); 
                return prev.map(p => printIds.includes(p.id) ? { ...p, isDeleted: true, deletedBy: username } : p); 
            }); 
        } 
    };

    return {
        handleDeleteHistory
    };
};
