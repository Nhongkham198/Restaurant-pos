
import React, { useState, useMemo, useRef } from 'react';
import type { MaintenanceItem, MaintenanceLog, User } from '../types';
import Swal from 'sweetalert2';

// Declare XLSX for Excel operations
declare var XLSX: any;

interface MaintenanceViewProps {
    maintenanceItems: MaintenanceItem[];
    setMaintenanceItems: React.Dispatch<React.SetStateAction<MaintenanceItem[]>>;
    maintenanceLogs: MaintenanceLog[];
    setMaintenanceLogs: React.Dispatch<React.SetStateAction<MaintenanceLog[]>>;
    currentUser: User | null;
}

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
    maintenanceItems,
    setMaintenanceItems,
    maintenanceLogs,
    setMaintenanceLogs,
    currentUser
}) => {
    // --- State ---
    const [selectedTab, setSelectedTab] = useState<'status' | 'all' | 'history'>('status');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Manage Item Modal
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MaintenanceItem | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [newItemImage, setNewItemImage] = useState('');
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemCycle, setNewItemCycle] = useState(1);
    const [newItemLastDate, setNewItemLastDate] = useState('');

    // Perform Maintenance Modal
    const [isPerformModalOpen, setIsPerformModalOpen] = useState(false);
    const [performingItem, setPerformingItem] = useState<MaintenanceItem | null>(null);
    const [performDate, setPerformDate] = useState(new Date().toISOString().slice(0, 10));
    const [performNotes, setPerformNotes] = useState('');
    const [beforeImage, setBeforeImage] = useState<string | null>(null);
    const [afterImage, setAfterImage] = useState<string | null>(null);
    const beforeInputRef = useRef<HTMLInputElement>(null);
    const afterInputRef = useRef<HTMLInputElement>(null);

    // Edit Log Modal (History)
    const [isEditLogModalOpen, setIsEditLogModalOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);
    const [editLogDate, setEditLogDate] = useState('');
    const [editLogPerformedBy, setEditLogPerformedBy] = useState('');
    const [editLogNotes, setEditLogNotes] = useState('');
    const [editBeforeImage, setEditBeforeImage] = useState<string | null>(null);
    const [editAfterImage, setEditAfterImage] = useState<string | null>(null);
    const editBeforeInputRef = useRef<HTMLInputElement>(null);
    const editAfterInputRef = useRef<HTMLInputElement>(null);

    // --- Computed ---
    const itemsWithStatus = useMemo(() => {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        return maintenanceItems.map(item => {
            const lastDate = item.lastMaintenanceDate || 0;
            // Calculate Due Date
            const dueDate = new Date(lastDate);
            if (isNaN(dueDate.getTime())) {
                // Handle invalid date
                return { ...item, status: 'ok', dueTimestamp: 0, daysDiff: 0 } as any;
            }

            dueDate.setMonth(dueDate.getMonth() + item.cycleMonths);
            const dueTimestamp = dueDate.getTime();

            // Status Logic
            let status: 'ok' | 'due_soon' | 'overdue' = 'ok';
            let daysDiff = Math.ceil((dueTimestamp - now) / oneDay);

            if (daysDiff < 0) {
                status = 'overdue';
            } else if (daysDiff <= 7) { // Warn 7 days in advance
                status = 'due_soon';
            }

            return { ...item, status, dueTimestamp, daysDiff };
        }).sort((a, b) => {
            // Sort by priority: Overdue > Due Soon > OK
            const priority = { overdue: 0, due_soon: 1, ok: 2 };
            if (priority[a.status] !== priority[b.status]) {
                return priority[a.status] - priority[b.status];
            }
            return a.daysDiff - b.daysDiff;
        });
    }, [maintenanceItems]);

    const itemsDueOrOverdue = useMemo(() => {
        return itemsWithStatus.filter(i => i.status !== 'ok');
    }, [itemsWithStatus]);

    const canManage = useMemo(() => {
        if (!currentUser) return false;
        return ['admin', 'branch-admin'].includes(currentUser.role);
    }, [currentUser]);

    // --- Handlers ---

    // Excel Export
    const handleExportExcel = () => {
        // Sheet 1: Machines
        const machinesData = maintenanceItems.map(item => {
            let dateStr = '';
            try {
                if (item.lastMaintenanceDate) {
                    const d = new Date(item.lastMaintenanceDate);
                    if (!isNaN(d.getTime())) {
                        dateStr = d.toISOString().slice(0, 10);
                    }
                }
            } catch (e) {
                console.error('Invalid date for item:', item.name);
            }

            return {
                ID: item.id,
                Name: item.name,
                Description: item.description || '',
                CycleMonths: item.cycleMonths,
                LastMaintenanceDate: dateStr,
                ImageURL: item.imageUrl
            };
        });

        // Sheet 2: History
        const historyData = maintenanceLogs.map(log => {
            const item = maintenanceItems.find(i => i.id === log.itemId);
            let dateStr = '';
            try {
                if (log.maintenanceDate) {
                    const d = new Date(log.maintenanceDate);
                    if (!isNaN(d.getTime())) {
                        dateStr = d.toISOString().slice(0, 10);
                    }
                }
            } catch (e) {
                console.error('Invalid date for log:', log.id);
            }

            return {
                LogID: log.id,
                MachineName: item ? item.name : `Unknown (ID: ${log.itemId})`,
                Date: dateStr,
                PerformedBy: log.performedBy,
                Notes: log.notes || '',
                BeforeImage: log.beforeImage ? 'Has Image' : '',
                AfterImage: log.afterImage ? 'Has Image' : ''
            };
        });

        const wb = XLSX.utils.book_new();
        const wsMachines = XLSX.utils.json_to_sheet(machinesData);
        const wsHistory = XLSX.utils.json_to_sheet(historyData);

        XLSX.utils.book_append_sheet(wb, wsMachines, "Machines");
        XLSX.utils.book_append_sheet(wb, wsHistory, "History");

        const fileName = `Maintenance_Data_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // Excel Import
    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                
                // Process Machines Sheet
                let newItems: MaintenanceItem[] = [...maintenanceItems];
                if (workbook.SheetNames.includes("Machines")) {
                    const wsMachines = workbook.Sheets["Machines"];
                    const machinesJson: any[] = XLSX.utils.sheet_to_json(wsMachines);
                    
                    const importedItems = machinesJson.map((row: any) => ({
                        id: Number(row.ID) || Date.now(),
                        name: row.Name,
                        description: row.Description,
                        imageUrl: row.ImageURL,
                        cycleMonths: Number(row.CycleMonths) || 1,
                        lastMaintenanceDate: row.LastMaintenanceDate ? new Date(row.LastMaintenanceDate).getTime() : null
                    }));

                    // Simple merge strategy: replace items with same ID, add new ones
                    const itemMap = new Map(newItems.map(i => [i.id, i]));
                    importedItems.forEach(item => itemMap.set(item.id, item));
                    newItems = Array.from(itemMap.values());
                }

                // Process History Sheet (Optional, usually we append logs)
                let newLogs: MaintenanceLog[] = [...maintenanceLogs];
                // Note: Importing logs back is tricky without full ID matching, skipping complex log import for safety
                // or just append if user desires. For now, let's focus on machine definitions as primary import.

                setMaintenanceItems(newItems);
                Swal.fire('นำเข้าสำเร็จ', 'ข้อมูลเครื่องจักรถูกอัปเดตเรียบร้อยแล้ว', 'success');

            } catch (error) {
                console.error(error);
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ Excel ได้', 'error');
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    // 1. Manage Item (Add/Edit)
    const handleOpenManageModal = (item: MaintenanceItem | null) => {
        if (item) {
            setEditingItem(item);
            setNewItemName(item.name);
            setNewItemImage(item.imageUrl);
            setNewItemDesc(item.description || '');
            setNewItemCycle(item.cycleMonths);
            
            let dateStr = new Date().toISOString().slice(0, 10);
            if (item.lastMaintenanceDate) {
                const d = new Date(item.lastMaintenanceDate);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toISOString().slice(0, 10);
                }
            }
            setNewItemLastDate(dateStr);
        } else {
            setEditingItem(null);
            setNewItemName('');
            setNewItemImage('');
            setNewItemDesc('');
            setNewItemCycle(1);
            setNewItemLastDate(new Date().toISOString().slice(0, 10));
        }
        setIsManageModalOpen(true);
    };

    const handleSaveItem = () => {
        if (!newItemName || !newItemImage) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกชื่อและ URL รูปภาพ', 'warning');
            return;
        }

        const lastDateTimestamp = newItemLastDate 
            ? new Date(newItemLastDate).getTime() 
            : Date.now();

        if (editingItem) {
            setMaintenanceItems(prev => prev.map(i => i.id === editingItem.id ? {
                ...i,
                name: newItemName,
                imageUrl: newItemImage,
                description: newItemDesc,
                cycleMonths: newItemCycle,
                lastMaintenanceDate: lastDateTimestamp
            } : i));
        } else {
            const newItem: MaintenanceItem = {
                id: Date.now(),
                name: newItemName,
                imageUrl: newItemImage,
                description: newItemDesc,
                cycleMonths: newItemCycle,
                lastMaintenanceDate: lastDateTimestamp
            };
            setMaintenanceItems(prev => [...prev, newItem]);
        }
        setIsManageModalOpen(false);
    };

    const handleDeleteItem = (id: number) => {
        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: 'คุณต้องการลบเครื่องจักรนี้ใช่หรือไม่?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ลบเลย'
        }).then((result) => {
            if (result.isConfirmed) {
                setMaintenanceItems(prev => prev.filter(i => i.id !== id));
                Swal.fire('ลบแล้ว', 'ลบข้อมูลสำเร็จ', 'success');
            }
        });
    };

    // 2. Perform Maintenance
    const handleOpenPerformModal = (item: MaintenanceItem) => {
        setPerformingItem(item);
        setPerformDate(new Date().toISOString().slice(0, 10));
        setPerformNotes('');
        setBeforeImage(null);
        setAfterImage(null);
        setIsPerformModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await fileToBase64(file);
                if (type === 'before') setBeforeImage(base64);
                else setAfterImage(base64);
            } catch (error) {
                console.error("Image error", error);
            }
        }
    };

    const handleSaveLog = () => {
        if (!performingItem) return;
        if (!beforeImage || !afterImage) {
            Swal.fire('รูปภาพไม่ครบ', 'กรุณาถ่ายรูป Before และ After', 'warning');
            return;
        }

        const logDate = new Date(performDate).getTime();

        const newLog: MaintenanceLog = {
            id: Date.now(),
            itemId: performingItem.id,
            maintenanceDate: logDate,
            performedBy: currentUser?.username || 'Unknown',
            notes: performNotes,
            beforeImage: beforeImage,
            afterImage: afterImage
        };

        setMaintenanceLogs(prev => [newLog, ...prev]);

        setMaintenanceItems(prev => prev.map(i => i.id === performingItem.id ? {
            ...i,
            lastMaintenanceDate: logDate
        } : i));

        setIsPerformModalOpen(false);
        Swal.fire('บันทึกสำเร็จ', 'บันทึกการบำรุงรักษาแล้ว', 'success');
    };

    // 3. Edit History Log (Admin Only)
    const handleOpenEditLogModal = (log: MaintenanceLog) => {
        setEditingLog(log);
        setEditLogDate(new Date(log.maintenanceDate).toISOString().slice(0, 10));
        setEditLogPerformedBy(log.performedBy);
        setEditLogNotes(log.notes || '');
        setEditBeforeImage(log.beforeImage || null);
        setEditAfterImage(log.afterImage || null);
        setIsEditLogModalOpen(true);
    };

    const handleUpdateLog = () => {
        if (!editingLog) return;

        const updatedLog: MaintenanceLog = {
            ...editingLog,
            maintenanceDate: new Date(editLogDate).getTime(),
            performedBy: editLogPerformedBy,
            notes: editLogNotes,
            beforeImage: editBeforeImage || undefined,
            afterImage: editAfterImage || undefined
        };

        setMaintenanceLogs(prev => prev.map(l => l.id === editingLog.id ? updatedLog : l));
        
        // Optionally update the item's last maintenance date if this was the latest log
        // (Simplified: not implementing complex date recalculation for simplicity, assume manual update is enough)

        setIsEditLogModalOpen(false);
        Swal.fire('บันทึกสำเร็จ', 'แก้ไขประวัติการบำรุงรักษาเรียบร้อย', 'success');
    };

    const handleDeleteLog = (id: number) => {
        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: 'คุณต้องการลบประวัตินี้ใช่หรือไม่?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ลบเลย'
        }).then((result) => {
            if (result.isConfirmed) {
                setMaintenanceLogs(prev => prev.filter(l => l.id !== id));
                Swal.fire('ลบแล้ว', 'ลบประวัติสำเร็จ', 'success');
            }
        });
    };

    const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await fileToBase64(file);
                if (type === 'before') setEditBeforeImage(base64);
                else setEditAfterImage(base64);
            } catch (error) {
                console.error("Image error", error);
            }
        }
    };

    // --- Render Components ---

    const StatusBadge = ({ status, days }: { status: string, days: number }) => {
        if (status === 'overdue') return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">เกินกำหนด {Math.abs(days)} วัน</span>;
        if (status === 'due_soon') return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full">ครบกำหนดใน {days} วัน</span>;
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">ปกติ</span>;
    };

    return (
        <div className="flex flex-col h-full w-full bg-gray-50 overflow-hidden">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImportExcel} 
                className="hidden" 
                accept=".xlsx, .xls" 
            />

            {/* Header */}
            <div className="p-4 bg-white border-b flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    การบำรุงรักษา
                </h1>
                
                {canManage && (
                    <div className="flex gap-2">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 border border-green-600 text-green-600 rounded-lg hover:bg-green-50 font-semibold shadow-sm flex items-center gap-2"
                        >
                            {/* Swapped to Arrow Down (Download style) for Import */}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Import
                        </button>
                        <button 
                            onClick={handleExportExcel}
                            className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold shadow-sm flex items-center gap-2"
                        >
                            {/* Swapped to Arrow Up (Upload style) for Export */}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            Export
                        </button>
                        <button 
                            onClick={() => handleOpenManageModal(null)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-sm flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                            เพิ่มเครื่องจักร
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="px-4 pt-4 flex gap-2 border-b bg-gray-50 flex-shrink-0">
                <button 
                    onClick={() => setSelectedTab('status')}
                    className={`px-4 py-2 font-semibold rounded-t-lg border-x border-t transition-all ${
                        selectedTab === 'status' 
                        ? 'bg-white text-red-600 border-red-300 border-b-4 border-b-red-500' 
                        : 'text-gray-500 hover:bg-gray-200 border-transparent'
                    }`}
                >
                    ถึงกำหนด ({itemsDueOrOverdue.length})
                </button>
                <button 
                    onClick={() => setSelectedTab('all')}
                    className={`px-4 py-2 font-semibold rounded-t-lg border-x border-t transition-all ${
                        selectedTab === 'all' 
                        ? 'bg-white text-blue-600 border-blue-300 border-b-4 border-b-blue-500' 
                        : 'text-gray-500 hover:bg-gray-200 border-transparent'
                    }`}
                >
                    เครื่องจักรทั้งหมด ({maintenanceItems.length})
                </button>
                <button 
                    onClick={() => setSelectedTab('history')}
                    className={`px-4 py-2 font-semibold rounded-t-lg border-x border-t transition-all ${
                        selectedTab === 'history' 
                        ? 'bg-white text-green-600 border-green-300 border-b-4 border-b-green-500' 
                        : 'text-gray-500 hover:bg-gray-200 border-transparent'
                    }`}
                >
                    ประวัติการทำ
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 w-full h-full">
                {selectedTab !== 'history' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                        {(selectedTab === 'status' ? itemsDueOrOverdue : itemsWithStatus).map(item => (
                            <div key={item.id} className={`border rounded-xl shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md h-full ${item.status === 'overdue' ? 'border-red-300 bg-red-50' : item.status === 'due_soon' ? 'border-yellow-300 bg-yellow-50' : 'bg-white'}`}>
                                <div className="h-48 w-full bg-gray-200 relative flex-shrink-0">
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                    <div className="absolute top-2 right-2">
                                        <StatusBadge status={item.status} days={item.daysDiff} />
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-white">
                                        <h3 className="font-bold truncate">{item.name}</h3>
                                        <p className="text-xs opacity-90 truncate">{item.description}</p>
                                    </div>
                                </div>
                                <div className="p-4 flex-1 flex flex-col justify-between">
                                    <div className="text-sm text-gray-600 space-y-2 mb-4">
                                        <div className="flex justify-between border-b pb-1 border-gray-200/50">
                                            <span>รอบ:</span>
                                            <span className="font-medium">{item.cycleMonths} เดือน</span>
                                        </div>
                                        <div className="flex justify-between border-b pb-1 border-gray-200/50">
                                            <span>ทำล่าสุด:</span>
                                            <span className="font-medium">
                                                {item.lastMaintenanceDate && !isNaN(new Date(item.lastMaintenanceDate).getTime()) 
                                                    ? new Date(item.lastMaintenanceDate).toLocaleDateString('th-TH') 
                                                    : '-'}
                                            </span>
                                        </div>
                                        <div className={`flex justify-between font-bold ${item.status === 'overdue' ? 'text-red-600' : 'text-gray-800'}`}>
                                            <span>ครบกำหนด:</span>
                                            <span>
                                                {item.dueTimestamp && !isNaN(new Date(item.dueTimestamp).getTime())
                                                    ? new Date(item.dueTimestamp).toLocaleDateString('th-TH')
                                                    : '-'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleOpenPerformModal(item)}
                                            className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold shadow-sm transition-colors text-sm"
                                        >
                                            บำรุงรักษา
                                        </button>
                                        {canManage && (
                                            <>
                                                <button onClick={() => handleOpenManageModal(item)} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200" title="แก้ไข">
                                                    ✏️
                                                </button>
                                                <button onClick={() => handleDeleteItem(item.id)} className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" title="ลบ">
                                                    🗑️
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(selectedTab === 'status' && itemsDueOrOverdue.length === 0) && (
                            <div className="col-span-full text-center py-10 text-gray-500">
                                <p className="text-lg">🎉 ไม่มีรายการที่ต้องบำรุงรักษาในขณะนี้</p>
                            </div>
                        )}
                         {(selectedTab === 'all' && itemsWithStatus.length === 0) && (
                            <div className="col-span-full text-center py-10 text-gray-500">
                                <p className="text-lg">ยังไม่มีข้อมูลเครื่องจักร</p>
                            </div>
                        )}
                    </div>
                ) : (
                    // History View
                    <div className="space-y-4 max-w-5xl mx-auto">
                        {maintenanceLogs.length === 0 ? (
                            <p className="text-center text-gray-500 py-10">ยังไม่มีประวัติการบำรุงรักษา</p>
                        ) : (
                            maintenanceLogs.sort((a, b) => b.maintenanceDate - a.maintenanceDate).map(log => {
                                const item = maintenanceItems.find(i => i.id === log.itemId);
                                return (
                                    <div key={log.id} className="border rounded-lg p-4 flex flex-col md:flex-row gap-4 bg-white shadow-sm relative">
                                        {/* Admin Edit/Delete Buttons */}
                                        {canManage && (
                                            <div className="absolute top-4 right-4 flex gap-2">
                                                <button onClick={() => handleOpenEditLogModal(log)} className="p-1 text-gray-500 hover:text-blue-600 rounded-full hover:bg-blue-50 transition-colors" title="แก้ไขประวัติ">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                                </button>
                                                <button onClick={() => handleDeleteLog(log.id)} className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-red-50 transition-colors" title="ลบประวัติ">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        )}

                                        <div className="flex-1">
                                            <h4 className="font-bold text-lg text-gray-800 pr-16">{item?.name || 'Unknown Item'}</h4>
                                            <p className="text-sm text-gray-500">
                                                วันที่: {log.maintenanceDate && !isNaN(new Date(log.maintenanceDate).getTime()) 
                                                    ? new Date(log.maintenanceDate).toLocaleString('th-TH') 
                                                    : '-'}
                                            </p>
                                            <p className="text-sm text-gray-500">โดย: {log.performedBy}</p>
                                            {log.notes && <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-3 rounded border whitespace-pre-wrap">{log.notes}</p>}
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="text-center">
                                                <span className="text-xs font-bold text-gray-500 mb-1 block">Before</span>
                                                {log.beforeImage ? (
                                                    <img src={log.beforeImage} alt="Before" className="w-24 h-24 object-cover rounded border bg-gray-100" />
                                                ) : (
                                                    <div className="w-24 h-24 rounded border bg-gray-100 flex items-center justify-center text-xs text-gray-400">No Image</div>
                                                )}
                                            </div>
                                            <div className="text-center">
                                                <span className="text-xs font-bold text-gray-500 mb-1 block">After</span>
                                                {log.afterImage ? (
                                                    <img src={log.afterImage} alt="After" className="w-24 h-24 object-cover rounded border bg-gray-100" />
                                                ) : (
                                                    <div className="w-24 h-24 rounded border bg-gray-100 flex items-center justify-center text-xs text-gray-400">No Image</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Manage Item Modal */}
            {isManageModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsManageModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{editingItem ? 'แก้ไขเครื่องจักร' : 'เพิ่มเครื่องจักรใหม่'}</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">ชื่อเครื่องจักร</label>
                                <input type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)} className="w-full border p-2 rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">URL รูปภาพ</label>
                                <input type="text" value={newItemImage} onChange={e => setNewItemImage(e.target.value)} className="w-full border p-2 rounded" placeholder="https://..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">รายละเอียด (วิธีการดูแล/สิ่งที่ต้องทำ)</label>
                                <textarea 
                                    value={newItemDesc} 
                                    onChange={e => setNewItemDesc(e.target.value)} 
                                    className="w-full border p-2 rounded h-24 text-sm" 
                                    placeholder="ใส่รายละเอียดที่นี่..."
                                ></textarea>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">รอบการบำรุงรักษา (เดือน)</label>
                                    <select value={newItemCycle} onChange={e => setNewItemCycle(Number(e.target.value))} className="w-full border p-2 rounded">
                                        <option value={1}>1 เดือน</option>
                                        <option value={2}>2 เดือน</option>
                                        <option value={3}>3 เดือน</option>
                                        <option value={6}>6 เดือน</option>
                                        <option value={12}>12 เดือน (1 ปี)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">วันที่ทำล่าสุด (เริ่มนับรอบ)</label>
                                    <input 
                                        type="date" 
                                        value={newItemLastDate} 
                                        onChange={e => setNewItemLastDate(e.target.value)} 
                                        className="w-full border p-2 rounded" 
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsManageModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded text-gray-700">ยกเลิก</button>
                            <button onClick={handleSaveItem} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">บันทึก</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Perform Maintenance Modal */}
            {isPerformModalOpen && performingItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsPerformModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-2">บันทึกการบำรุงรักษา</h2>
                        <p className="text-gray-600 mb-4">{performingItem.name}</p>
                        
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">วันที่ทำ</label>
                                    <input type="date" value={performDate} onChange={e => setPerformDate(e.target.value)} className="w-full border p-2 rounded" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">ผู้ปฏิบัติงาน</label>
                                    <input type="text" value={currentUser?.username || '-'} disabled className="w-full border p-2 rounded bg-gray-100" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Before Image */}
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50" onClick={() => beforeInputRef.current?.click()}>
                                    <input type="file" ref={beforeInputRef} onChange={e => handleImageUpload(e, 'before')} className="hidden" accept="image/*" capture="environment" />
                                    {beforeImage ? (
                                        <img src={beforeImage} alt="Before" className="h-32 w-full object-contain mx-auto" />
                                    ) : (
                                        <div className="py-8 text-gray-400">
                                            <span className="block text-2xl mb-1">📷</span>
                                            <span className="text-sm font-bold">ถ่ายรูป Before</span>
                                        </div>
                                    )}
                                </div>
                                {/* After Image */}
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50" onClick={() => afterInputRef.current?.click()}>
                                    <input type="file" ref={afterInputRef} onChange={e => handleImageUpload(e, 'after')} className="hidden" accept="image/*" capture="environment" />
                                    {afterImage ? (
                                        <img src={afterImage} alt="After" className="h-32 w-full object-contain mx-auto" />
                                    ) : (
                                        <div className="py-8 text-gray-400">
                                            <span className="block text-2xl mb-1">✨</span>
                                            <span className="text-sm font-bold">ถ่ายรูป After</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">หมายเหตุ / สิ่งที่พบ</label>
                                <textarea value={performNotes} onChange={e => setPerformNotes(e.target.value)} className="w-full border p-2 rounded h-20" placeholder="เช่น เปลี่ยนอะไหล่, พบสนิม..."></textarea>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsPerformModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded text-gray-700">ยกเลิก</button>
                            <button onClick={handleSaveLog} className="px-4 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700">บันทึกงานเสร็จสิ้น</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Log Modal (Admin Only) */}
            {isEditLogModalOpen && editingLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsEditLogModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-2">แก้ไขประวัติการบำรุงรักษา</h2>
                        
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">วันที่ทำ</label>
                                    <input type="date" value={editLogDate} onChange={e => setEditLogDate(e.target.value)} className="w-full border p-2 rounded" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">ผู้ปฏิบัติงาน</label>
                                    <input type="text" value={editLogPerformedBy} onChange={e => setEditLogPerformedBy(e.target.value)} className="w-full border p-2 rounded" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Edit Before Image */}
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50" onClick={() => editBeforeInputRef.current?.click()}>
                                    <input type="file" ref={editBeforeInputRef} onChange={e => handleEditImageUpload(e, 'before')} className="hidden" accept="image/*" />
                                    {editBeforeImage ? (
                                        <img src={editBeforeImage} alt="Before" className="h-32 w-full object-contain mx-auto" />
                                    ) : (
                                        <div className="py-8 text-gray-400">
                                            <span className="block text-xl mb-1">📷</span>
                                            <span className="text-xs font-bold">No Image</span>
                                        </div>
                                    )}
                                </div>
                                {/* Edit After Image */}
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50" onClick={() => editAfterInputRef.current?.click()}>
                                    <input type="file" ref={editAfterInputRef} onChange={e => handleEditImageUpload(e, 'after')} className="hidden" accept="image/*" />
                                    {editAfterImage ? (
                                        <img src={editAfterImage} alt="After" className="h-32 w-full object-contain mx-auto" />
                                    ) : (
                                        <div className="py-8 text-gray-400">
                                            <span className="block text-xl mb-1">✨</span>
                                            <span className="text-xs font-bold">No Image</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">หมายเหตุ</label>
                                <textarea value={editLogNotes} onChange={e => setEditLogNotes(e.target.value)} className="w-full border p-2 rounded h-20"></textarea>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsEditLogModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded text-gray-700">ยกเลิก</button>
                            <button onClick={handleUpdateLog} className="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">บันทึกการแก้ไข</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
