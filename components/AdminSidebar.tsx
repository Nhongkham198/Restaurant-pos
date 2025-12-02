





import React, { useState, ReactNode, useRef } from 'react';
import type { User, View } from '../types';
import Swal from 'sweetalert2';

interface AdminSidebarProps {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    logoUrl: string | null;
    restaurantName: string;
    branchName: string;
    currentUser: User;
    onViewChange: (view: View) => void;
    currentView: View;
    onToggleEditMode: () => void;
    isEditMode: boolean;
    onOpenSettings: () => void;
    onOpenUserManager: () => void;
    onManageBranches: () => void;
    onChangeBranch: () => void;
    onLogout: () => void;
    kitchenBadgeCount: number;
    tablesBadgeCount: number;
    leaveBadgeCount: number; // Added leave badge count
    onUpdateCurrentUser: (updates: Partial<User>) => void;
    onUpdateLogoUrl: (newUrl: string) => void;
    onUpdateRestaurantName: (newName: string) => void;
}

const NavItem: React.FC<{
    icon: ReactNode;
    text: string;
    isCollapsed: boolean;
    isActive?: boolean;
    onClick?: () => void;
    children?: ReactNode;
    isOpen?: boolean;
    onToggle?: () => void;
    badge?: number;
}> = ({ icon, text, isCollapsed, isActive, onClick, children, isOpen, onToggle, badge }) => {
    const hasChildren = !!children;

    const baseClasses = "flex items-center p-3 my-1 rounded-lg transition-colors duration-200 w-full text-left relative";
    const activeClasses = isActive ? "bg-green-600 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white";
    const content = (
        <>
            <span className="flex-shrink-0 w-6 h-6">{icon}</span>
            <span className={`flex-1 ml-3 whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>{text}</span>
            {hasChildren && !isCollapsed && (
                <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
            )}
             {badge !== undefined && badge > 0 && (
                 <span className={`absolute top-2 right-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white transition-opacity duration-200 ${isCollapsed ? 'opacity-100' : 'opacity-100'}`}>
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </>
    );

    return (
        <li>
            {hasChildren ? (
                <button onClick={onToggle} className={`${baseClasses} ${activeClasses}`}>
                    {content}
                </button>
            ) : (
                <a href="#" onClick={(e) => { e.preventDefault(); onClick?.(); }} className={`${baseClasses} ${activeClasses}`}>
                    {content}
                </a>
            )}
            {hasChildren && isOpen && !isCollapsed && (
                <ul className="pl-6 py-1 space-y-1 bg-gray-900/50">
                    {children}
                </ul>
            )}
        </li>
    );
};


const AdminSidebar: React.FC<AdminSidebarProps> = ({
    isCollapsed,
    onToggleCollapse,
    logoUrl,
    restaurantName,
    branchName,
    currentUser,
    onViewChange,
    currentView,
    onToggleEditMode,
    isEditMode,
    onOpenSettings,
    onOpenUserManager,
    onManageBranches,
    onChangeBranch,
    onLogout,
    kitchenBadgeCount,
    tablesBadgeCount,
    leaveBadgeCount,
    onUpdateCurrentUser,
    onUpdateLogoUrl,
    onUpdateRestaurantName,
}) => {
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
      'food': true
    });
    const logoInputRef = useRef<HTMLInputElement>(null);

    const toggleMenu = (key: string) => {
        setOpenMenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleProfilePictureEdit = () => {
        Swal.fire({
            title: 'เปลี่ยนรูปโปรไฟล์',
            text: 'กรุณาวาง URL ของรูปภาพใหม่:',
            input: 'url',
            inputValue: currentUser.profilePictureUrl || '',
            inputPlaceholder: 'https://example.com/image.png',
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
        }).then((result) => {
            if (result.isConfirmed && typeof result.value === 'string') {
                onUpdateCurrentUser({ profilePictureUrl: result.value });
            }
        });
    };
    
    const handleLogoEdit = () => {
        logoInputRef.current?.click();
    };

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const newUrl = event.target?.result as string;
                if (newUrl) {
                    onUpdateLogoUrl(newUrl);
                }
            };
            reader.readAsDataURL(file);
        } else if (file) {
            Swal.fire('ผิดพลาด', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น (PNG, JPG, etc.)', 'error');
        }
    };


    return (
        <aside className={`fixed top-0 left-0 z-40 h-screen bg-gray-800 border-r border-gray-700 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'} hidden md:block`}>
            <div className="flex flex-col h-full">
                {/* Header */}
                 <div className={`flex items-center p-4 border-b border-gray-700 h-16 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {!isCollapsed && (
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="relative group flex-shrink-0">
                                {logoUrl ? (
                                    <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-md object-cover" />
                                ) : (
                                    <div className="h-10 w-10 bg-gray-700 rounded-md flex items-center justify-center">
                                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                )}
                                {isEditMode && (
                                    <button onClick={handleLogoEdit} className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center rounded-md transition-opacity cursor-pointer" title="เปลี่ยนโลโก้">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white opacity-0 group-hover:opacity-100" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                    </button>
                                )}
                            </div>
                            <div className="overflow-hidden">
                                {isEditMode ? (
                                    <input
                                        type="text"
                                        value={restaurantName}
                                        onChange={(e) => onUpdateRestaurantName(e.target.value)}
                                        className="text-base font-semibold text-white leading-tight block truncate bg-gray-700 p-1 -m-1 rounded-md w-full focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                    />
                                ) : (
                                    <span className="text-base font-semibold text-white leading-tight block truncate">{restaurantName}</span>
                                )}
                                <p className="text-xs text-gray-400 truncate">{branchName}</p>
                            </div>
                        </div>
                    )}
                    <button onClick={onToggleCollapse} className="p-2 text-gray-400 rounded-lg hover:bg-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                </div>
                
                {/* User Profile */}
                <div className="p-4 border-b border-gray-700">
                    <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="relative group">
                            <img className="h-12 w-12 rounded-full object-cover" src={currentUser.profilePictureUrl || "https://img.icons8.com/fluency/48/user-male-circle.png"} alt="User"/>
                            {isEditMode && (
                                <button onClick={handleProfilePictureEdit} className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center rounded-full transition-opacity cursor-pointer" title="เปลี่ยนรูปโปรไฟล์">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white opacity-0 group-hover:opacity-100" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        {!isCollapsed && (
                            <div>
                                <p className="font-semibold text-white">{currentUser.username}</p>
                                <p className="text-sm text-red-400 font-semibold">ผู้ดูแลระบบ</p>
                            </div>
                        )}
                    </div>
                </div>

                 <input
                    type="file"
                    ref={logoInputRef}
                    onChange={handleLogoFileChange}
                    accept="image/*"
                    className="hidden"
                />
                 
                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 overflow-y-auto overflow-x-hidden">
                    <ul className="space-y-1">
                         <NavItem
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
                            text="Dashboard"
                            isCollapsed={isCollapsed}
                            isActive={currentView === 'dashboard'}
                            onClick={() => onViewChange('dashboard')}
                        />
                        <NavItem
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h2a1 1 0 100-2H9z" clipRule="evenodd" /></svg>}
                            text="POS"
                            isCollapsed={isCollapsed}
                             isActive={currentView === 'pos'}
                            onClick={() => onViewChange('pos')}
                        />
                        <NavItem
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h10a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2zm3 0a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>}
                            text="ห้องครัว"
                            isCollapsed={isCollapsed}
                            isActive={currentView === 'kitchen'}
                            onClick={() => onViewChange('kitchen')}
                            badge={kitchenBadgeCount}
                        />
                         <NavItem
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                            text="ผังโต๊ะ"
                            isCollapsed={isCollapsed}
                            isActive={currentView === 'tables'}
                            onClick={() => onViewChange('tables')}
                            badge={tablesBadgeCount}
                        />
                        {currentUser.role !== 'auditor' && (
                            <NavItem
                                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.125-1.274-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.125-1.274.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm-3 12a3 3 0 110-6 3 3 0 010 6z" /></svg>}
                                text="จัดการผู้ใช้"
                                isCollapsed={isCollapsed}
                                onClick={onOpenUserManager}
                            />
                        )}
                        {currentUser.role === 'admin' && (
                            <NavItem
                                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4.5A1.5 1.5 0 013.5 3h13A1.5 1.5 0 0118 4.5v2.755a3 3 0 01-1.5 2.599V15.5A1.5 1.5 0 0115 17h-1.5a1.5 1.5 0 01-1.5-1.5v-2.348a3 3 0 01-1.5-2.599V7.255a3 3 0 01-1.5 2.599V15.5A1.5 1.5 0 017.5 17H6a1.5 1.5 0 01-1.5-1.5v-5.146A3 3 0 013 7.255V4.5z" /></svg>}
                                text="จัดการสาขา"
                                isCollapsed={isCollapsed}
                                onClick={onManageBranches}
                            />
                        )}
                         <NavItem
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            text="ประวัติการขาย"
                            isCollapsed={isCollapsed}
                             isActive={currentView === 'history'}
                            onClick={() => onViewChange('history')}
                        />
                         <NavItem
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
                            text="สต็อก"
                            isCollapsed={isCollapsed}
                            isActive={currentView === 'stock'}
                            onClick={() => onViewChange('stock')}
                        />
                        <NavItem
                            icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                            text="วันลาพนักงาน"
                            isCollapsed={isCollapsed}
                            isActive={currentView === 'leave'}
                            onClick={() => onViewChange('leave')}
                            badge={leaveBadgeCount}
                        />
                    </ul>
                     {/* Edit Mode Toggle */}
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <ul className="space-y-1">
                            <li>
                                <button
                                    onClick={onToggleEditMode}
                                    className={`flex items-center p-3 my-1 rounded-lg w-full text-left transition-colors duration-200 ${
                                        isEditMode
                                            ? 'bg-yellow-500 text-white shadow-lg'
                                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }`}
                                >
                                    <span className="flex-shrink-0 w-6 h-6">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                    </span>
                                    <span className={`flex-1 ml-3 whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
                                        {isEditMode ? 'ปิดโหมดแก้ไข' : 'โหมดแก้ไข'}
                                    </span>
                                </button>
                            </li>
                        </ul>
                    </div>
                </nav>
                
                 {/* Footer */}
                <div className="mt-auto p-4 border-t border-gray-700">
                    <NavItem
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                        text="ตั้งค่า"
                        isCollapsed={isCollapsed}
                        onClick={onOpenSettings}
                    />
                     <NavItem
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
                        text="ออกจากระบบ"
                        isCollapsed={isCollapsed}
                        onClick={onLogout}
                    />
                </div>
            </div>
        </aside>
    );
};

export default AdminSidebar;