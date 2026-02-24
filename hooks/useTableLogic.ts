import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import Swal from 'sweetalert2';
import { Table } from '../types';

export const useTableLogic = () => {
    const { 
        tables, 
        setTables, 
        floors, 
        setFloors, 
        activeOrders, 
        activeOrdersActions
    } = useData();
    
    const { handleModalClose, selectedSidebarFloor, setSelectedSidebarFloor } = useUI();

    const handleAddTable = (floor: string) => { 
        const newId = Math.max(0, ...tables.map(t => t.id)) + 1; 
        const tablesOnFloor = tables.filter(t => t.floor === floor); 
        const newTableName = `T${tablesOnFloor.length + 1}`; 
        setTables(prev => [...prev, { id: newId, name: newTableName, floor: floor, activePin: null, reservation: null }]); 
    };

    const handleRemoveLastTable = (floor: string) => { 
        const tablesOnFloor = tables.filter(t => t.floor === floor).sort((a,b) => a.id - b.id); 
        if (tablesOnFloor.length > 0) { 
            const lastTable = tablesOnFloor[tablesOnFloor.length - 1]; 
            if (activeOrders.some(o => o.tableId === lastTable.id)) { 
                Swal.fire('ไม่สามารถลบได้', `โต๊ะ ${lastTable.name} กำลังมีออเดอร์อยู่`, 'error'); 
                return; 
            } 
            setTables(prev => prev.filter(t => t.id !== lastTable.id)); 
        } 
    };

    const handleAddFloor = () => { 
        Swal.fire({ 
            title: 'เพิ่มชั้นใหม่', 
            input: 'text', 
            showCancelButton: true, 
            confirmButtonText: 'เพิ่ม' 
        }).then((result) => { 
            if (result.isConfirmed && result.value && !floors.includes(result.value)) 
                setFloors(prev => [...prev, result.value]); 
        }); 
    };

    const handleRemoveFloor = (floor: string) => { 
        if (tables.some(t => t.floor === floor)) { 
            Swal.fire('ไม่สามารถลบได้', `ชั้น "${floor}" ยังมีโต๊ะอยู่`, 'error'); 
            return; 
        } 
        Swal.fire({ 
            title: `ลบชั้น "${floor}"?`, 
            icon: 'warning', 
            showCancelButton: true, 
            confirmButtonText: 'ลบเลย' 
        }).then((result) => { 
            if (result.isConfirmed) { 
                setFloors(prev => prev.filter(f => f !== floor)); 
                if (selectedSidebarFloor === floor) setSelectedSidebarFloor(floors[0] || ''); 
            } 
        }); 
    };

    const handleConfirmMoveTable = async (orderId: number, newTableId: number, onClose: () => void) => { 
        if (!navigator.onLine) return; 
        const newTable = tables.find(t => t.id === newTableId); 
        if (!newTable) return; 
        await activeOrdersActions.update(orderId, { tableId: newTable.id, tableName: newTable.name, floor: newTable.floor }); 
        Swal.fire({ icon: 'success', title: 'ย้ายโต๊ะสำเร็จ', timer: 1500, showConfirmButton: false }); 
        onClose(); // Close the modal
    };

    const handleGeneratePin = (tableId: number) => { 
        const pin = String(Math.floor(100 + Math.random() * 900)); 
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, activePin: pin } : t)); 
    };

    return {
        handleAddTable,
        handleRemoveLastTable,
        handleAddFloor,
        handleRemoveFloor,
        handleConfirmMoveTable,
        handleGeneratePin
    };
};
