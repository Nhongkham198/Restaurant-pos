import { useData } from '../contexts/DataContext';
import Swal from 'sweetalert2';
import { MenuItem } from '../types';

export const useMenuLogic = () => {
    const { 
        menuItems, 
        setMenuItems, 
        categories, 
        setCategories 
    } = useData();
    
    const handleSaveMenuItem = (itemData: Omit<MenuItem, 'id'> & { id?: number }) => { 
        setMenuItems(prev => { 
            if (itemData.id) return prev.map(item => item.id === itemData.id ? { ...item, ...itemData } as MenuItem : item); 
            const newId = Math.max(0, ...prev.map(i => i.id)) + 1; 
            return [...prev, { ...itemData, id: newId }]; 
        }); 
        Swal.fire({ 
            toast: true, 
            position: 'top-end', 
            icon: 'success', 
            title: 'บันทึกเมนูสำเร็จ', 
            showConfirmButton: false, 
            timer: 1500 
        }); 
    };

    const handleDeleteMenuItem = (id: number) => { 
        Swal.fire({ 
            title: 'ยืนยันการลบ?', 
            text: "คุณต้องการลบเมนูนี้ใช่หรือไม่?", 
            icon: 'warning', 
            showCancelButton: true, 
            confirmButtonColor: '#d33', 
            confirmButtonText: 'ใช่, ลบเลย!' 
        }).then((result) => { 
            if (result.isConfirmed) setMenuItems(prev => prev.filter(item => item.id !== id)); 
        }); 
    };

    const handleAddCategory = (name: string) => { 
        if (!categories.includes(name)) setCategories(prev => [...prev, name]); 
    };

    const handleUpdateCategory = (oldName: string, newName: string) => { 
        setCategories(prev => Array.from(new Set(prev.map(c => c === oldName ? newName : c)))); 
        setMenuItems(prev => prev.map(item => item.category === oldName ? { ...item, category: newName } : item)); 
    };

    const handleDeleteCategory = (name: string) => { 
        setCategories(prev => prev.filter(c => c !== name)); 
    };

    const handleToggleAvailability = (id: number) => { 
        setMenuItems(prev => prev.map(i => i.id === id ? { ...i, isAvailable: i.isAvailable === false ? true : false } : i)); 
    };

    const handleToggleVisibility = (id: number) => { 
        setMenuItems(prev => prev.map(i => i.id === id ? { ...i, isVisible: i.isVisible === false ? true : false } : i)); 
    };

    return {
        handleSaveMenuItem,
        handleDeleteMenuItem,
        handleAddCategory,
        handleUpdateCategory,
        handleDeleteCategory,
        handleToggleAvailability,
        handleToggleVisibility
    };
};
