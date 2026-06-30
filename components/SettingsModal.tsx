
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { PrinterConfig, ReceiptPrintSettings, KitchenPrinterSettings, CashierPrinterSettings, MenuItem, DeliveryProvider, PrinterStatus, PrinterConnectionType, DeliveryPriceHistoryEntry } from '../types';
import { printerService } from '../services/printerService';
import Swal from 'sweetalert2';
import { MenuItemImage } from './MenuItemImage';
import { functions, storage, db, auth } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (
        logoUrl: string | null,
        appLogoUrl: string | null,
        qrCodeUrl: string | null,
        notificationSoundUrl: string | null,
        staffCallSoundUrl: string | null,
        printerConfig: PrinterConfig | null,
        openingTime: string | null,
        closingTime: string | null,
        restaurantAddress: string,
        restaurantPhone: string,
        taxId: string,
        signatureUrl: string | null,
        telegramBotToken: string | null,
        telegramChatId: string | null,
        lineOaUrl: string,
        facebookPageUrl: string,
        qrPopupEnabled: boolean,
        qrPopupImageUrl: string | null,
        qrPopupMessage: string
    ) => void;
    currentLogoUrl: string | null;
    currentAppLogoUrl: string | null;
    currentQrCodeUrl: string | null;
    currentNotificationSoundUrl: string | null;
    currentStaffCallSoundUrl: string | null;
    currentPrinterConfig: PrinterConfig | null;
    currentOpeningTime: string | null;
    currentClosingTime: string | null;
    onSavePrinterConfig: (config: PrinterConfig | null) => void;
    menuItems: MenuItem[];
    currentRecommendedMenuItemIds: number[];
    onSaveRecommendedItems: (ids: number[]) => void;
    recommendedItemsLimit: number;
    onSaveRecommendedItemsLimit: (limit: number) => void;
    deliveryProviders: DeliveryProvider[];
    onSaveDeliveryProviders: (providers: DeliveryProvider[]) => void;
    currentRestaurantAddress: string;
    currentRestaurantPhone: string;
    currentTaxId: string;
    currentSignatureUrl: string | null;
    currentLineOaUrl: string;
    currentFacebookPageUrl: string;
    currentFacebookAppId: string;
    currentFacebookAppSecret: string;
    onSaveFacebookConfig: (appId: string, appSecret: string) => void;
    currentLineNotifyToken: string; // Deprecated
    onSaveLineNotifyToken: (token: string) => void; // Deprecated
    currentLineMessagingToken: string;
    onSaveLineMessagingToken: (token: string) => void;
    currentLineUserId: string;
    onSaveLineUserId: (id: string) => void;
    currentTelegramBotToken: string;
    onSaveTelegramBotToken: (token: string) => void;
    currentTelegramChatId: string;
    onSaveTelegramChatId: (id: string) => void;
    currentQrPopupEnabled: boolean;
    currentQrPopupImageUrl: string | null;
    currentQrPopupMessage: string;
    branches: any[];
}

const DEFAULT_RECEIPT_OPTIONS: ReceiptPrintSettings = {
    showLogo: true,
    showRestaurantName: true,
    showAddress: true,
    address: '',
    showPhoneNumber: true,
    phoneNumber: '',
    showTable: true,
    showStaff: true,
    showDateTime: true,
    showOrderId: true,
    showItems: true,
    showSubtotal: true,
    showTax: true,
    showTotal: true,
    showPaymentMethod: true,
    showThankYouMessage: true,
    thankYouMessage: 'ขอบคุณที่ใช้บริการ',
    showQrCode: true,
};

const StatusIndicator: React.FC<{ status: PrinterStatus; label: string }> = ({ status, label }) => {
    let color = 'bg-gray-400';
    let text = 'ไม่ได้ตรวจสอบ';
    if (status === 'checking') { color = 'bg-yellow-500 animate-pulse'; text = 'กำลังตรวจสอบ...'; }
    else if (status === 'success') { color = 'bg-green-500'; text = 'เชื่อมต่อได้'; }
    else if (status === 'error') { color = 'bg-red-500'; text = 'เชื่อมต่อไม่ได้'; }

    return (
        <div className="flex items-center gap-2 text-sm">
            <div className={`w-3 h-3 rounded-full ${color}`}></div>
            <span className="text-gray-600">{label}: {text}</span>
        </div>
    );
};

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'general' | 'printer' | 'menu' | 'delivery' | 'integrations' | 'database'>('general');
    
    // State initialization
    const [storageUsage, setStorageUsage] = useState<Record<string, any> | null>(() => {
        try {
            const cached = localStorage.getItem('cached_db_storage_usage');
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [isCalculatingStorage, setIsCalculatingStorage] = useState(false);
    const [calculationProgressBranch, setCalculationProgressBranch] = useState<string>('');
    const [selectedDetailBranchId, setSelectedDetailBranchId] = useState<string>('');

    const [lastCalculatedTime, setLastCalculatedTime] = useState<string | null>(() => {
        try {
            return localStorage.getItem('cached_db_storage_usage_time');
        } catch {
            return null;
        }
    });

    const [isBackingUp, setIsBackingUp] = useState(false);
    const [backupProgress, setBackupProgress] = useState(0);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [currentProcessName, setCurrentProcessName] = useState('');

    useEffect(() => {
        if (storageUsage && !selectedDetailBranchId) {
            const firstBranchId = Object.keys(storageUsage)[0];
            if (firstBranchId) {
                setSelectedDetailBranchId(firstBranchId);
            }
        }
    }, [storageUsage, selectedDetailBranchId]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleCalculateStorage = async () => {
        setIsCalculatingStorage(true);
        try {
            const branchesToUse = props.branches || [];
            if (branchesToUse.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ไม่พบข้อมูลสาขา',
                    text: 'ระบบไม่สามารถดึงข้อมูลสาขาเพื่อคำนวณพื้นที่จัดเก็บได้'
                });
                return;
            }

            const usageData: Record<string, {
                branchName: string;
                totalSize: number;
                totalDocs: number;
                collections: Array<{
                    key: string;
                    label: string;
                    docCount: number;
                    estimatedSize: number;
                }>
            }> = {};

            const collectionsToMeasure = [
                { key: 'tables', label: 'ผังโต๊ะอาหาร' },
                { key: 'menuItems', label: 'รายการเมนูอาหาร' },
                { key: 'recipes', label: 'สูตรอาหาร/ส่วนผสม' },
                { key: 'stockItems', label: 'วัตถุดิบ/สต็อกสินค้า' },
                { key: 'stockLogs', label: 'บันทึกการปรับสต็อก' },
                { key: 'printHistory', label: 'ประวัติการพิมพ์ใบเสร็จ' },
                { key: 'timeRecords', label: 'บันทึกเวลาเข้า-ออกงาน' },
                { key: 'payrollRecords', label: 'บันทึกการจ่ายเงินเดือน' },
                { key: 'stockTags', label: 'แท็กระบุประเภทวัตถุดิบ' },
                { key: 'maintenanceItems', label: 'รายการซ่อมบำรุง' },
                { key: 'closingChecklistItems', label: 'รายการเช็คลิสต์ปิดร้าน' },
                { key: 'closingChecklistLog', label: 'บันทึกการเช็คลิสต์ปิดร้าน' },
                { key: 'activeOrders', label: 'ออเดอร์ที่กำลังดำเนินอยู่' },
                { key: 'preOrders', label: 'ออเดอร์จองล่วงหน้า' },
                { key: 'completedOrders_v2', label: 'ออเดอร์ที่เสร็จสิ้นแล้ว' },
                { key: 'cancelledOrders_v2', label: 'ออเดอร์ที่ยกเลิกแล้ว' },
                { key: 'deliveryPriceHistory', label: 'ประวัติการปรับราคาค่าส่ง' }
            ];

            for (let i = 0; i < branchesToUse.length; i++) {
                const branch = branchesToUse[i];
                const branchIdStr = branch.id.toString();
                setCalculationProgressBranch(branch.name);

                let branchTotalSize = 0;
                let branchTotalDocs = 0;
                const measuredCollections: any[] = [];

                const fetchPromises = collectionsToMeasure.map(async (col) => {
                    try {
                        const snap = await db.collection(`branches/${branchIdStr}/${col.key}`).get();
                        let colSize = 0;
                        const colDocs = snap.size || 0;

                        snap.docs.forEach((doc: any) => {
                            const data = doc.data();
                            const docStr = JSON.stringify(data);
                            colSize += (docStr.length + 100);
                        });

                        return {
                            key: col.key,
                            label: col.label,
                            docCount: colDocs,
                            estimatedSize: colSize
                        };
                    } catch (err) {
                        console.error(`Error calculating storage for ${col.key} in branch ${branchIdStr}:`, err);
                        return {
                            key: col.key,
                            label: col.label,
                            docCount: 0,
                            estimatedSize: 0
                        };
                    }
                });

                const results = await Promise.all(fetchPromises);

                results.forEach(res => {
                    branchTotalSize += res.estimatedSize;
                    branchTotalDocs += res.docCount;
                    measuredCollections.push(res);
                });

                measuredCollections.sort((a, b) => b.estimatedSize - a.estimatedSize);

                usageData[branchIdStr] = {
                    branchName: branch.name,
                    totalSize: branchTotalSize,
                    totalDocs: branchTotalDocs,
                    collections: measuredCollections
                };
            }

            setStorageUsage(usageData);
            localStorage.setItem('cached_db_storage_usage', JSON.stringify(usageData));
            const nowTimeStr = Date.now().toString();
            localStorage.setItem('cached_db_storage_usage_time', nowTimeStr);
            setLastCalculatedTime(nowTimeStr);

            const firstBranchId = Object.keys(usageData)[0];
            if (firstBranchId) {
                setSelectedDetailBranchId(firstBranchId);
            }

            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'คำนวณการใช้หน่วยความจำเสร็จสมบูรณ์',
                showConfirmButton: false,
                timer: 2000
            });
        } catch (error) {
            console.error("Error calculating storage usage:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถคำนวณการใช้หน่วยความจำฐานข้อมูลได้'
            });
        } finally {
            setIsCalculatingStorage(false);
            setCalculationProgressBranch('');
        }
    };

    const handleBackupBranch = async (branchId: string, branchName: string) => {
        setIsBackingUp(true);
        setBackupProgress(0);
        setCurrentProcessName('เริ่มกระบวนการดึงข้อมูลเพื่อสำรอง...');
        try {
            const backupData: Record<string, any[]> = {};
            const collectionsToBackup = [
                { key: 'tables', label: 'ผังโต๊ะอาหาร' },
                { key: 'menuItems', label: 'รายการเมนูอาหาร' },
                { key: 'recipes', label: 'สูตรอาหาร/ส่วนผสม' },
                { key: 'stockItems', label: 'วัตถุดิบ/สต็อกสินค้า' },
                { key: 'stockLogs', label: 'บันทึกการปรับสต็อก' },
                { key: 'printHistory', label: 'ประวัติการพิมพ์ใบเสร็จ' },
                { key: 'timeRecords', label: 'บันทึกเวลาเข้า-ออกงาน' },
                { key: 'payrollRecords', label: 'บันทึกการจ่ายเงินเดือน' },
                { key: 'stockTags', label: 'แท็กระบุประเภทวัตถุดิบ' },
                { key: 'maintenanceItems', label: 'รายการซ่อมบำรุง' },
                { key: 'closingChecklistItems', label: 'รายการเช็คลิสต์ปิดร้าน' },
                { key: 'closingChecklistLog', label: 'บันทึกการเช็คลิสต์ปิดร้าน' },
                { key: 'activeOrders', label: 'ออเดอร์ที่กำลังดำเนินอยู่' },
                { key: 'preOrders', label: 'ออเดอร์จองล่วงหน้า' },
                { key: 'completedOrders_v2', label: 'ออเดอร์ที่เสร็จสิ้นแล้ว' },
                { key: 'cancelledOrders_v2', label: 'ออเดอร์ที่ยกเลิกแล้ว' },
                { key: 'deliveryPriceHistory', label: 'ประวัติการปรับราคาค่าส่ง' }
            ];

            for (let i = 0; i < collectionsToBackup.length; i++) {
                const col = collectionsToBackup[i];
                setCurrentProcessName(`กำลังดึงข้อมูลตาราง: ${col.label}`);
                
                const snap = await db.collection(`branches/${branchId}/${col.key}`).get();
                const docs: any[] = [];
                snap.forEach((doc: any) => {
                    docs.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                backupData[col.key] = docs;

                const percent = Math.round(((i + 1) / collectionsToBackup.length) * 100);
                setBackupProgress(percent);
            }

            // Generate JSON blob and download
            const fullBackup = {
                backupVersion: "1.0",
                timestamp: new Date().toISOString(),
                branchId: branchId,
                branchName: branchName,
                data: backupData
            };

            const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${branchName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            Swal.fire({
                icon: 'success',
                title: 'สำรองข้อมูลสำเร็จ',
                text: `บันทึกข้อมูลของสาขา ${branchName} ขนาด ${formatBytes(JSON.stringify(fullBackup).length)} เรียบร้อยแล้ว`,
                confirmButtonColor: '#2563eb'
            });
        } catch (error) {
            console.error("Backup error:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถสำรองข้อมูลสาขาได้',
                confirmButtonColor: '#ef4444'
            });
        } finally {
            setIsBackingUp(false);
            setBackupProgress(0);
            setCurrentProcessName('');
        }
    };

    const handleImportBranch = async (e: React.ChangeEvent<HTMLInputElement>, targetBranchId: string, targetBranchName: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset file input value so same file can be selected again
        e.target.value = '';

        try {
            const text = await file.text();
            const backup = JSON.parse(text);

            if (!backup.backupVersion || !backup.data) {
                Swal.fire({
                    icon: 'error',
                    title: 'ไฟล์ไม่ถูกต้อง',
                    text: 'โครงสร้างไฟล์สำรองข้อมูลไม่ถูกต้อง กรุณาเลือกไฟล์สำรองข้อมูล JSON ที่ถูกต้อง',
                    confirmButtonColor: '#ef4444'
                });
                return;
            }

            const confirmResult = await Swal.fire({
                title: 'ยืนยันการนำเข้าข้อมูล?',
                html: `คุณกำลังจะนำเข้าข้อมูลสำรองไปยังสาขา <strong>${targetBranchName}</strong><br/><br/>
                       <span class="text-sm text-red-600 font-semibold">⚠️ คำเตือน: เอกสารเก่าที่มี ID ตรงกันในฐานข้อมูลสาขาปลายทางจะถูกเขียนทับทันที</span>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#d33',
                confirmButtonText: 'ยืนยันการนำเข้า',
                cancelButtonText: 'ยกเลิก'
            });

            if (!confirmResult.isConfirmed) return;

            setIsImporting(true);
            setImportProgress(0);
            setCurrentProcessName('กำลังเตรียมนำเข้าข้อมูล...');

            // Build flat operations list
            const operations: Array<{
                collectionKey: string;
                docId: string;
                data: any;
            }> = [];

            Object.entries(backup.data).forEach(([colKey, docs]: any) => {
                if (Array.isArray(docs)) {
                    docs.forEach((doc: any) => {
                        const { id, ...data } = doc;
                        operations.push({
                            collectionKey: colKey,
                            docId: id,
                            data
                        });
                    });
                }
            });

            const totalCount = operations.length;
            if (totalCount === 0) {
                Swal.fire({
                    icon: 'info',
                    title: 'ไม่มีข้อมูล',
                    text: 'ไม่พบเอกสารใด ๆ ในไฟล์สำรองข้อมูลนี้',
                    confirmButtonColor: '#2563eb'
                });
                setIsImporting(false);
                return;
            }

            // Write in batches of 300 to be fast and safe
            const chunkSize = 300;
            let completedCount = 0;

            for (let i = 0; i < operations.length; i += chunkSize) {
                const chunk = operations.slice(i, i + chunkSize);
                const batch = db.batch();

                chunk.forEach(op => {
                    const ref = db.collection(`branches/${targetBranchId}/${op.collectionKey}`).doc(op.docId);
                    batch.set(ref, op.data);
                });

                await batch.commit();
                completedCount += chunk.length;
                const percent = Math.round((completedCount / totalCount) * 100);
                setImportProgress(percent);
                setCurrentProcessName(`กำลังนำเข้าข้อมูล: ${completedCount}/${totalCount} รายการ...`);
            }

            Swal.fire({
                icon: 'success',
                title: 'นำเข้าข้อมูลสำเร็จ',
                text: `อัปเดตข้อมูลจำนวน ${totalCount} รายการ ลงในสาขา ${targetBranchName} เรียบร้อยแล้ว`,
                confirmButtonColor: '#2563eb'
            });

            // Trigger storage recalculation to show updated size
            handleCalculateStorage();
        } catch (error) {
            console.error("Import error:", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถนำเข้าข้อมูลได้ ไฟล์อาจจะชำรุดเสียหาย หรือมีปัญหาเครือข่าย',
                confirmButtonColor: '#ef4444'
            });
        } finally {
            setIsImporting(false);
            setImportProgress(0);
            setCurrentProcessName('');
        }
    };

    const [settingsForm, setSettingsForm] = useState({
        logoUrl: props.currentLogoUrl,
        appLogoUrl: props.currentAppLogoUrl,
        qrCodeUrl: props.currentQrCodeUrl,
        notificationSoundUrl: props.currentNotificationSoundUrl,
        staffCallSoundUrl: props.currentStaffCallSoundUrl,
        printerConfig: props.currentPrinterConfig || { kitchen: null, cashier: null },
        openingTime: props.currentOpeningTime,
        closingTime: props.currentClosingTime,
        restaurantAddress: props.currentRestaurantAddress,
        restaurantPhone: props.currentRestaurantPhone,
        taxId: props.currentTaxId,
        signatureUrl: props.currentSignatureUrl,
        facebookAppId: props.currentFacebookAppId,
        facebookAppSecret: props.currentFacebookAppSecret,
        lineNotifyToken: props.currentLineNotifyToken, // Deprecated
        lineMessagingToken: props.currentLineMessagingToken,
        lineUserId: props.currentLineUserId,
        telegramBotToken: props.currentTelegramBotToken,
        telegramChatId: props.currentTelegramChatId,
        lineOaUrl: props.currentLineOaUrl,
        facebookPageUrl: props.currentFacebookPageUrl,
        qrPopupEnabled: props.currentQrPopupEnabled,
        qrPopupImageUrl: props.currentQrPopupImageUrl,
        qrPopupMessage: props.currentQrPopupMessage,
    });

    const [printerStatus, setPrinterStatus] = useState<{ kitchen: PrinterStatus; cashier: PrinterStatus }>({
        kitchen: 'idle',
        cashier: 'idle'
    });

    const [tempRecommendedIds, setTempRecommendedIds] = useState<number[]>(props.currentRecommendedMenuItemIds || []);
    const [tempRecommendedItemsLimit, setTempRecommendedItemsLimit] = useState<number>(props.recommendedItemsLimit || 10);
    const [tempDeliveryProviders, setTempDeliveryProviders] = useState<DeliveryProvider[]>(props.deliveryProviders || []);
    const [isUploading, setIsUploading] = useState(false);
    const [showTelegramToken, setShowTelegramToken] = useState(false);
    const [showLineToken, setShowLineToken] = useState(false);

    const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState(false);
    const [priceHistory, setPriceHistory] = useState<DeliveryPriceHistoryEntry[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const fetchPriceHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const branchId = localStorage.getItem('selectedBranch') ? JSON.parse(localStorage.getItem('selectedBranch')!).id : null;
            if (!branchId) return;

            const snapshot = await db.collection('branches').doc(branchId.toString())
                .collection('deliveryPriceHistory')
                .orderBy('timestamp', 'desc')
                .limit(100) // Increased limit for export
                .get();
            
            const history = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            })) as DeliveryPriceHistoryEntry[];
            
            setPriceHistory(history);
        } catch (error) {
            console.error('Error fetching price history:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleExportExcel = () => {
        if (priceHistory.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่พบข้อมูลประวัติสำหรับส่งออก', 'info');
            return;
        }

        const exportData = priceHistory.map(entry => ({
            'วันที่/เวลา': new Date(entry.timestamp).toLocaleString('th-TH'),
            'ค่าย Delivery': entry.providerName,
            'ราคาเดิม (บาท)': entry.oldPrice,
            'ราคาใหม่ (บาท)': entry.newPrice,
            'ผู้แก้ไข': entry.updatedBy
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Delivery Price History');
        
        // Generate filename with current date
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `Delivery_Price_History_${dateStr}.xlsx`);
    };

    // Refs for file inputs
    const logoInputRef = useRef<HTMLInputElement>(null);
    const appLogoInputRef = useRef<HTMLInputElement>(null);
    const qrInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);
    const soundInputRef = useRef<HTMLInputElement>(null);
    const staffSoundInputRef = useRef<HTMLInputElement>(null);

    // Sync state with props when modal opens
    useEffect(() => {
        if (props.isOpen) {
            setSettingsForm({
                logoUrl: props.currentLogoUrl,
                appLogoUrl: props.currentAppLogoUrl,
                qrCodeUrl: props.currentQrCodeUrl,
                notificationSoundUrl: props.currentNotificationSoundUrl,
                staffCallSoundUrl: props.currentStaffCallSoundUrl,
                printerConfig: props.currentPrinterConfig || { kitchen: null, cashier: null },
                openingTime: props.currentOpeningTime,
                closingTime: props.currentClosingTime,
                restaurantAddress: props.currentRestaurantAddress,
                restaurantPhone: props.currentRestaurantPhone,
                taxId: props.currentTaxId,
                signatureUrl: props.currentSignatureUrl,
                facebookAppId: props.currentFacebookAppId,
                facebookAppSecret: props.currentFacebookAppSecret,
                lineNotifyToken: props.currentLineNotifyToken, // Deprecated
                lineMessagingToken: props.currentLineMessagingToken,
                lineUserId: props.currentLineUserId,
                telegramBotToken: props.currentTelegramBotToken,
                telegramChatId: props.currentTelegramChatId,
                lineOaUrl: props.currentLineOaUrl,
                facebookPageUrl: props.currentFacebookPageUrl,
                qrPopupEnabled: props.currentQrPopupEnabled,
                qrPopupImageUrl: props.currentQrPopupImageUrl,
                qrPopupMessage: props.currentQrPopupMessage,
            });
            setTempRecommendedIds(props.currentRecommendedMenuItemIds || []);
            setTempRecommendedItemsLimit(props.recommendedItemsLimit || 10);
            setTempDeliveryProviders(props.deliveryProviders || []);
            setPrinterStatus({ kitchen: 'idle', cashier: 'idle' });
        }
    }, [props.isOpen, props.currentLogoUrl, props.currentAppLogoUrl, props.currentQrCodeUrl, props.currentPrinterConfig, props.currentOpeningTime, props.currentClosingTime, props.currentRecommendedMenuItemIds, props.deliveryProviders, props.currentFacebookAppId, props.currentFacebookAppSecret, props.currentLineNotifyToken, props.currentLineMessagingToken, props.currentLineUserId, props.currentQrPopupEnabled, props.currentQrPopupImageUrl, props.currentQrPopupMessage, props.recommendedItemsLimit]);

    const handleInputChange = (field: string, value: any) => {
        setSettingsForm(prev => ({ ...prev, [field]: value }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        Swal.fire({
            title: 'กำลังอัปโหลดไฟล์...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            let fileToUpload: File | Blob = file;
            
            // Only compress if it's an image
            if (file.type.startsWith('image/')) {
                const options = {
                    maxSizeMB: 0.5,
                    maxWidthOrHeight: 800,
                    useWebWorker: true,
                    fileType: 'image/webp' as any,
                    initialQuality: 0.8
                };
                fileToUpload = await imageCompression(file, options);
            }
            
            const fileName = `settings/${field}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, fileName);
            
            const uploadResult = await uploadBytes(storageRef, fileToUpload);
            const downloadUrl = await getDownloadURL(uploadResult.ref);

            setSettingsForm(prev => ({ ...prev, [field]: downloadUrl }));
            
            Swal.fire({
                icon: 'success',
                title: 'อัปโหลดสำเร็จ',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปโหลดไฟล์ได้', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handlePrinterChange = (type: 'kitchen' | 'cashier', field: string, value: any) => {
        setSettingsForm(prev => {
            const currentConfig = prev.printerConfig?.[type] || {
                connectionType: 'network',
                ipAddress: '',
                paperWidth: '80mm',
                port: '3000',
                targetPrinterIp: '',
                targetPrinterPort: '9100'
            };
            
            // Handle connection type switch to reset specific fields if needed
            if (field === 'connectionType') {
                if (value === 'usb') {
                    // Initialize USB defaults if switching to USB
                    if (!currentConfig.vid) currentConfig.vid = '';
                    if (!currentConfig.pid) currentConfig.pid = '';
                }
            }

            // Ensure receiptOptions exists for cashier
            if (type === 'cashier' && !('receiptOptions' in currentConfig)) {
                (currentConfig as CashierPrinterSettings).receiptOptions = { ...DEFAULT_RECEIPT_OPTIONS };
            }

            return {
                ...prev,
                printerConfig: {
                    ...prev.printerConfig,
                    [type]: {
                        ...currentConfig,
                        [field]: value
                    }
                }
            };
        });
    };

    const handleReceiptOptionChange = (field: keyof ReceiptPrintSettings, value: any) => {
        setSettingsForm(prev => {
            const currentCashier = prev.printerConfig?.cashier || {
                connectionType: 'network',
                ipAddress: '',
                paperWidth: '80mm',
                receiptOptions: { ...DEFAULT_RECEIPT_OPTIONS }
            } as CashierPrinterSettings;

            return {
                ...prev,
                printerConfig: {
                    ...prev.printerConfig,
                    cashier: {
                        ...currentCashier,
                        receiptOptions: {
                            ...currentCashier.receiptOptions,
                            [field]: value
                        }
                    }
                }
            };
        });
    };

    const handleCheckPrinterStatus = async (type: 'kitchen' | 'cashier') => {
        const config = settingsForm.printerConfig[type];
        if (!config || !config.ipAddress) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุ Print Server IP', 'warning');
            return;
        }

        setPrinterStatus(prev => ({ ...prev, [type]: 'checking' }));
        
        try {
            const result = await printerService.checkPrinterStatus(
                config.ipAddress, 
                config.port || '3000',
                config.targetPrinterIp || '',
                config.targetPrinterPort || '9100',
                config.connectionType,
                config.vid,
                config.pid
            );
            
            setPrinterStatus(prev => ({ ...prev, [type]: result.online ? 'success' : 'error' }));
            
            if (!result.online) {
                Swal.fire('เชื่อมต่อไม่ได้', result.message, 'error');
            }
        } catch (error: any) {
            setPrinterStatus(prev => ({ ...prev, [type]: 'error' }));
            Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        }
    };

    const handleScanUsb = async (type: 'kitchen' | 'cashier') => {
        const config = settingsForm.printerConfig[type];
        if (!config || !config.ipAddress) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุ Print Server IP เพื่อสแกน', 'warning');
            return;
        }

        try {
            Swal.fire({ title: 'กำลังสแกน...', didOpen: () => { Swal.showLoading(); } });
            const devices = await printerService.scanUsbDevices(config.ipAddress, config.port || '3000');
            Swal.close();

            if (devices.length === 0) {
                Swal.fire('ไม่พบอุปกรณ์', 'ไม่พบเครื่องพิมพ์ USB ที่เชื่อมต่ออยู่', 'info');
                return;
            }

            const options: Record<string, string> = {};
            devices.forEach((d, idx) => {
                options[`${d.vid}|${d.pid}`] = `Printer ${idx + 1} (VID:${d.vid} PID:${d.pid})`;
            });

            const { value } = await Swal.fire({
                title: 'เลือกอุปกรณ์',
                input: 'select',
                inputOptions: options,
                inputPlaceholder: 'เลือกเครื่องพิมพ์',
                showCancelButton: true,
            });

            if (value) {
                const [vid, pid] = value.split('|');
                handlePrinterChange(type, 'vid', vid);
                handlePrinterChange(type, 'pid', pid);
                Swal.fire('สำเร็จ', `เลือก VID:${vid} PID:${pid} แล้ว`, 'success');
            }

        } catch (error: any) {
            Swal.close();
            Swal.fire('Error', error.message, 'error');
        }
    };

    const handleShowZadigHelp = () => {
        Swal.fire({
            title: 'วิธีแก้ปัญหา USB พิมพ์ไม่ออก (Windows)',
            width: '600px',
            html: `
                <div class="text-left text-sm space-y-4">
                    <div class="bg-red-50 p-3 rounded border border-red-200">
                        <p class="font-bold text-red-600">⚠️ อาการ: กดทดสอบแล้วขึ้น Success แต่เครื่องพิมพ์เงียบ</p>
                        <p class="text-gray-600 mt-1">สาเหตุ: Windows Driver แย่งการทำงาน ทำให้โปรแกรมส่งข้อมูลไปที่เครื่องพิมพ์โดยตรงไม่ได้</p>
                    </div>

                    <div>
                        <h4 class="font-bold text-gray-800 border-b pb-1 mb-2">วิธีแก้ไข (ทำครั้งเดียว):</h4>
                        <ol class="list-decimal pl-5 space-y-2 text-gray-700">
                            <li>
                                <strong>ดาวน์โหลดโปรแกรม Zadig</strong> (ฟรี)
                                <br/><a href="https://zadig.akeo.ie/" target="_blank" class="text-blue-600 underline">คลิกที่นี่เพื่อดาวน์โหลด Zadig</a>
                            </li>
                            <li>เปิดโปรแกรม Zadig ขึ้นมา</li>
                            <li>ไปที่เมนู <strong>Options</strong> > เลือก <strong>List All Devices</strong></li>
                            <li>
                                ในช่องรายการ ให้เลือกชื่อเครื่องพิมพ์ของคุณ
                                <br/><span class="text-xs text-gray-500">(อาจชื่อว่า 'Printer', 'USB Printing Support', หรือชื่อยี่ห้อ)</span>
                            </li>
                            <li>
                                ดูช่องทางขวา (Driver) ให้เลือกเป็น <strong>WinUSB</strong> 
                                <br/><span class="text-xs text-green-600 font-bold">(สำคัญมาก! ต้องเป็น WinUSB เท่านั้น)</span>
                            </li>
                            <li>กดปุ่ม <strong>Replace Driver</strong> หรือ <strong>Install Driver</strong></li>
                            <li>รอจนเสร็จ แล้วกด "ทดสอบพิมพ์" ในหน้านี้ใหม่อีกครั้ง</li>
                        </ol>
                    </div>
                </div>
            `,
            icon: 'info',
            confirmButtonText: 'เข้าใจแล้ว'
        });
    };

    const handleTestPrint = async (type: 'kitchen' | 'cashier') => {
        const printer = settingsForm.printerConfig[type];
        if (!printer) return;
        try {
            await printerService.printTest(
                printer.ipAddress, 
                printer.paperWidth, 
                printer.port || '3000',
                printer.targetPrinterIp,
                printer.targetPrinterPort,
                printer.connectionType,
                printer.vid, 
                printer.pid 
            );
            Swal.fire({ icon: 'success', title: 'ส่งคำสั่งสำเร็จ', text: 'กรุณาตรวจสอบที่เครื่องพิมพ์', timer: 1500, showConfirmButton: false });
        } catch (error: any) {
            Swal.fire({ icon: 'error', title: 'พิมพ์ไม่สำเร็จ', text: error.message });
        }
    };

    const handleTestLineNotification = async () => {
        if (!settingsForm.lineMessagingToken || !settingsForm.lineUserId) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอก Channel Access Token และ User ID ให้ครบถ้วน', 'warning');
            return;
        }

        try {
            Swal.fire({
                title: 'กำลังทดสอบ...',
                text: 'กำลังส่งข้อความทดสอบไปยัง LINE',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const testFunc = functions.httpsCallable('testLineNotification');
            const result = await testFunc({
                token: settingsForm.lineMessagingToken,
                targetId: settingsForm.lineUserId
            });

            const data = result.data as any;
            if (data.success) {
                Swal.fire('สำเร็จ', 'ส่งข้อความทดสอบเรียบร้อยแล้ว กรุณาเช็คที่ LINE ของคุณ', 'success');
            } else {
                Swal.fire('ไม่สำเร็จ', `เกิดข้อผิดพลาด: ${data.error}`, 'error');
            }
        } catch (error: any) {
            console.error('Test failed:', error);
            Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถส่งข้อความได้: ${error.message}`, 'error');
        }
    };

    const handleTestTelegramNotification = async () => {
        if (!settingsForm.telegramBotToken || !settingsForm.telegramChatId) {
            Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอก Bot Token และ Chat ID ให้ครบถ้วน', 'warning');
            return;
        }

        try {
            Swal.fire({
                title: 'กำลังทดสอบ...',
                text: 'กำลังส่งข้อความทดสอบไปยัง Telegram',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const { sendTelegramMessage } = await import('../src/services/telegramService');
            await sendTelegramMessage({
                botToken: settingsForm.telegramBotToken,
                chatId: settingsForm.telegramChatId
            }, '<b>🔔 ทดสอบการแจ้งเตือน Telegram</b>\nระบบ POS ของคุณเชื่อมต่อสำเร็จแล้ว!');

            Swal.fire('สำเร็จ', 'ส่งข้อความทดสอบเรียบร้อยแล้ว กรุณาเช็คที่ Telegram ของคุณ', 'success');
        } catch (error: any) {
            console.error('Test failed:', error);
            Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถส่งข้อความได้: ${error.message}`, 'error');
        }
    };

    const handleSave = async () => {
        // Detect price changes and record history
        try {
            const branchId = localStorage.getItem('selectedBranch') ? JSON.parse(localStorage.getItem('selectedBranch')!).id : null;
            if (branchId) {
                for (const newProvider of tempDeliveryProviders) {
                    const oldProvider = props.deliveryProviders.find(p => p.id === newProvider.id);
                    if (oldProvider && oldProvider.fixedAdCost !== newProvider.fixedAdCost) {
                        // Record change in Firestore
                        await db.collection('branches').doc(branchId.toString())
                            .collection('deliveryPriceHistory').add({
                                providerId: newProvider.id,
                                providerName: newProvider.name,
                                oldPrice: oldProvider.fixedAdCost || 0,
                                newPrice: newProvider.fixedAdCost || 0,
                                timestamp: Date.now(),
                                updatedBy: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin'
                            });
                    }
                }
            }
        } catch (error) {
            console.error('Error recording price history:', error);
        }

        props.onSave(
            settingsForm.logoUrl,
            settingsForm.appLogoUrl,
            settingsForm.qrCodeUrl,
            settingsForm.notificationSoundUrl,
            settingsForm.staffCallSoundUrl,
            settingsForm.printerConfig,
            settingsForm.openingTime,
            settingsForm.closingTime,
            settingsForm.restaurantAddress,
            settingsForm.restaurantPhone,
            settingsForm.taxId,
            settingsForm.signatureUrl,
            settingsForm.telegramBotToken,
            settingsForm.telegramChatId,
            settingsForm.lineOaUrl,
            settingsForm.facebookPageUrl,
            settingsForm.qrPopupEnabled,
            settingsForm.qrPopupImageUrl,
            settingsForm.qrPopupMessage
        );
        props.onSaveRecommendedItems(tempRecommendedIds);
        props.onSaveRecommendedItemsLimit(tempRecommendedItemsLimit);
        props.onSaveDeliveryProviders(tempDeliveryProviders);
        props.onSaveFacebookConfig(settingsForm.facebookAppId, settingsForm.facebookAppSecret);
        props.onSaveLineNotifyToken(settingsForm.lineNotifyToken); // Deprecated
        props.onSaveLineMessagingToken(settingsForm.lineMessagingToken);
        props.onSaveLineUserId(settingsForm.lineUserId);
        props.onSaveTelegramBotToken(settingsForm.telegramBotToken || '');
        props.onSaveTelegramChatId(settingsForm.telegramChatId || '');

        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ',
            text: 'ข้อมูลการตั้งค่าถูกบันทึกเรียบร้อยแล้ว',
            timer: 1500,
            showConfirmButton: false
        });
    };

    const handleRecommendToggle = (itemId: number) => {
        setTempRecommendedIds(prev => {
            if (prev.includes(itemId)) {
                return prev.filter(id => id !== itemId);
            } else {
                if (prev.length >= tempRecommendedItemsLimit) {
                    Swal.fire('เต็มแล้ว', `แนะนำเมนูได้สูงสุด ${tempRecommendedItemsLimit} รายการ`, 'warning');
                    return prev;
                }
                return [...prev, itemId];
            }
        });
    };

    const handleDeliveryToggle = (providerId: string) => {
        setTempDeliveryProviders(prev => prev.map(p => 
            p.id === providerId ? { ...p, isEnabled: !p.isEnabled } : p
        ));
    };

    const handleDeliveryFieldChange = (providerId: string, field: 'iconUrl' | 'color' | 'fixedAdCost', value: any) => {
        setTempDeliveryProviders(prev => prev.map(p => 
            p.id === providerId ? { ...p, [field]: value } : p
        ));
    };

    if (!props.isOpen) return null;

    // ... (Helper render functions: renderImageUpload, renderSoundUpload) ...
    const renderImageUpload = (label: string, value: string | null, field: string, inputRef: React.RefObject<HTMLInputElement>) => (
        <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex gap-4 items-start">
                <div className="w-24 h-24 bg-gray-100 border rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                    {value ? (
                        <img src={value} alt="Preview" className="w-full h-full object-contain" />
                    ) : (
                        <span className="text-xs text-gray-400">ไม่มีรูป</span>
                    )}
                </div>
                <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                        <button onClick={() => inputRef.current?.click()} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 text-sm font-medium transition-colors">เลือกรูปภาพ</button>
                        {value && (
                            <button onClick={() => handleInputChange(field, null)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-100 text-sm font-medium transition-colors">ลบ</button>
                        )}
                    </div>
                    <input type="text" value={value || ''} onChange={e => handleInputChange(field, e.target.value)} placeholder="หรือใส่ URL ของรูปภาพ..." className="w-full text-xs text-gray-500 border border-gray-300 rounded p-1.5 focus:outline-none focus:border-blue-500" />
                    <input type="file" ref={inputRef} onChange={(e) => handleFileChange(e, field)} className="hidden" accept="image/*" />
                </div>
            </div>
        </div>
    );

    const renderSoundUpload = (label: string, value: string | null, field: string, inputRef: React.RefObject<HTMLInputElement>) => (
        <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <button onClick={() => inputRef.current?.click()} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 text-sm font-medium transition-colors">เลือกไฟล์เสียง</button>
                    {value && (
                        <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            มีไฟล์เสียงแล้ว
                        </span>
                    )}
                </div>
                <input type="file" ref={inputRef} onChange={(e) => handleFileChange(e, field)} className="hidden" accept="audio/*" />
                {value && (
                    <audio controls src={value} className="w-full h-8 mt-1" />
                )}
            </div>
        </div>
    );

    const renderPrinterSettings = (type: 'kitchen' | 'cashier') => {
        const conf = settingsForm.printerConfig[type];
        if (!conf) return (
            <div className="text-center py-4">
                <p className="text-gray-500 mb-2">ยังไม่ได้ตั้งค่าเครื่องพิมพ์ {type === 'kitchen' ? 'ครัว' : 'แคชเชียร์'}</p>
                <button 
                    onClick={() => handlePrinterChange(type, 'connectionType', 'network')} // Initialize
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    ตั้งค่าตอนนี้
                </button>
            </div>
        );

        const receiptOpts = (type === 'cashier' && 'receiptOptions' in conf) ? (conf as CashierPrinterSettings).receiptOptions : undefined;
        
        return (
            <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">ประเภทการเชื่อมต่อ</label>
                        <div className="flex gap-4">
                            <button type="button" onClick={() => handlePrinterChange(type, 'connectionType', 'network')} className={`flex-1 py-2 rounded-md font-bold border-2 transition-all ${conf.connectionType === 'network' ? 'bg-blue-600 text-white border-blue-700 shadow-inner' : 'bg-white text-gray-600 border-gray-300'}`}>WiFi / Network</button>
                            <button type="button" onClick={() => handlePrinterChange(type, 'connectionType', 'usb')} className={`flex-1 py-2 rounded-md font-bold border-2 transition-all ${conf.connectionType === 'usb' ? 'bg-orange-600 text-white border-orange-700 shadow-inner' : 'bg-white text-gray-600 border-gray-300'}`}>USB (ต่อตรง)</button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">ขนาดหน้ากว้างกระดาษ</label>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md border-2 cursor-pointer transition-all ${conf.paperWidth === '80mm' ? 'border-blue-600 bg-blue-50 text-blue-800 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}>
                                <input
                                    type="radio"
                                    name={`paperWidth-${type}`}
                                    value="80mm"
                                    checked={conf.paperWidth === '80mm'}
                                    onChange={() => handlePrinterChange(type, 'paperWidth', '80mm')}
                                    className="hidden"
                                />
                                <span>80mm (มาตรฐาน)</span>
                            </label>
                            <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md border-2 cursor-pointer transition-all ${conf.paperWidth === '58mm' ? 'border-blue-600 bg-blue-50 text-blue-800 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}>
                                <input
                                    type="radio"
                                    name={`paperWidth-${type}`}
                                    value="58mm"
                                    checked={conf.paperWidth === '58mm'}
                                    onChange={() => handlePrinterChange(type, 'paperWidth', '58mm')}
                                    className="hidden"
                                />
                                <span>58mm (เล็ก)</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-8 md:col-span-9">
                        <label className="block text-sm font-bold text-blue-700">Print Server IP (เครื่องที่รัน Node.js)</label>
                        <input type="text" value={conf.ipAddress} onChange={(e) => handlePrinterChange(type, 'ipAddress', e.target.value)} placeholder="เช่น 192.168.1.13" className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm text-gray-900" />
                    </div>
                    <div className="col-span-4 md:col-span-3">
                        <label className="block text-sm font-bold text-blue-700">Port</label>
                        <input type="text" value={conf.port} onChange={(e) => handlePrinterChange(type, 'port', e.target.value)} placeholder="3000" className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm text-gray-900" />
                    </div>
                    {conf.connectionType === 'network' && (
                        <div className="col-span-12">
                            <label className="block text-sm font-bold text-green-700">Printer IP (ตัวเครื่องพิมพ์)</label>
                            <input type="text" value={conf.targetPrinterIp || ''} onChange={(e) => handlePrinterChange(type, 'targetPrinterIp', e.target.value)} placeholder="เช่น 192.168.1.200" className="mt-1 block w-full border border-gray-300 p-2 rounded-md shadow-sm text-gray-900" />
                        </div>
                    )}
                    {conf.connectionType === 'usb' && (
                        <div className="col-span-12 bg-orange-50 p-3 rounded-lg border border-orange-200">
                            <div className="flex justify-between items-center mb-3 border-b border-orange-200 pb-2">
                                <label className="block text-sm font-bold text-orange-900">การตั้งค่า USB</label>
                                <button onClick={handleShowZadigHelp} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded shadow-sm flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    คู่มือแก้ปัญหา & ดาวน์โหลด Zadig
                                </button>
                            </div>
                            
                            <p className="text-xs text-gray-700 mb-2 font-medium">ระบุอุปกรณ์ USB (Optional - หากมีหลายเครื่อง)</p>
                            <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="text-xs text-orange-700 block">Vendor ID (VID)</label>
                                    <input type="text" value={conf.vid || ''} onChange={(e) => handlePrinterChange(type, 'vid', e.target.value)} placeholder="0x...." className="mt-1 w-full border border-gray-300 p-2 rounded-md" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-orange-700 block">Product ID (PID)</label>
                                    <input type="text" value={conf.pid || ''} onChange={(e) => handlePrinterChange(type, 'pid', e.target.value)} placeholder="0x...." className="mt-1 w-full border border-gray-300 p-2 rounded-md" />
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => handleScanUsb(type)} 
                                    className="px-4 py-2 bg-orange-600 text-white font-bold rounded-md hover:bg-orange-700 h-10 shadow-sm whitespace-nowrap"
                                >
                                    🔍 สแกนหาอุปกรณ์
                                </button>
                            </div>
                            <div className="mt-3 bg-white p-2 rounded border border-orange-100 text-xs text-gray-600">
                                <p>* หากไม่ระบุ VID/PID ระบบจะพิมพ์ออกเครื่อง USB ตัวแรกที่เจอ</p>
                                <p className="text-red-500 font-bold mt-1">
                                    ** สำคัญ: หากกดทดสอบแล้วขึ้น Success แต่เครื่องไม่พิมพ์ ต้องทำ Zadig (กดปุ่มคู่มือด้านบน)
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {type === 'cashier' && receiptOpts && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        {/* ... (Receipt options rendering) ... */}
                        <h4 className="text-lg font-bold text-gray-800 mb-4">รายละเอียดบนใบเสร็จ</h4>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.keys(DEFAULT_RECEIPT_OPTIONS).map(key => {
                                        if (typeof DEFAULT_RECEIPT_OPTIONS[key as keyof ReceiptPrintSettings] === 'boolean') {
                                            const labelMap: Record<string, string> = {
                                                showLogo: 'โลโก้ร้าน', showRestaurantName: 'ชื่อร้าน', showAddress: 'ที่อยู่',
                                                showPhoneNumber: 'เบอร์โทร', showTable: 'โต๊ะ', showStaff: 'พนักงาน',
                                                showDateTime: 'วัน/เวลา', showOrderId: 'เลขที่ออเดอร์', showItems: 'รายการอาหาร',
                                                showSubtotal: 'ยอดรวม', showTax: 'ภาษี', showTotal: 'ยอดสุทธิ',
                                                showPaymentMethod: 'การชำระเงิน', showThankYouMessage: 'ข้อความขอบคุณ',
                                                showQrCode: 'QR Code รับเงิน'
                                            };
                                            return (
                                                <label key={key} className="flex items-center gap-2 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!receiptOpts[key as keyof ReceiptPrintSettings]} 
                                                        onChange={(e) => handleReceiptOptionChange(key as keyof ReceiptPrintSettings, e.target.checked)} 
                                                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                                                    />
                                                    <span className="text-sm font-medium text-gray-700">{labelMap[key] || key}</span>
                                                </label>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                                <div className="space-y-3 pt-4 border-t border-gray-200">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">ที่อยู่ร้าน (บนใบเสร็จ)</label>
                                        <textarea value={receiptOpts.address} onChange={(e) => handleReceiptOptionChange('address', e.target.value)} rows={2} className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2" placeholder="ที่อยู่..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">เบอร์โทรศัพท์</label>
                                        <input type="text" value={receiptOpts.phoneNumber} onChange={(e) => handleReceiptOptionChange('phoneNumber', e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2" placeholder="02-xxx-xxxx" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">ข้อความขอบคุณ</label>
                                        <input type="text" value={receiptOpts.thankYouMessage} onChange={(e) => handleReceiptOptionChange('thankYouMessage', e.target.value)} className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2" placeholder="ขอบคุณที่ใช้บริการ" />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Preview */}
                            <div className="bg-gray-200 p-4 rounded-xl flex items-center justify-center min-h-[400px]">
                                <div className="bg-white shadow-lg w-[280px] p-4 text-black font-mono text-xs leading-snug flex flex-col items-center">
                                    {receiptOpts.showLogo && settingsForm.logoUrl && <img src={settingsForm.logoUrl} alt="Logo" className="h-12 w-auto object-contain mb-2" crossOrigin="anonymous" />}
                                    {receiptOpts.showRestaurantName && <div className="font-bold text-base mb-1">ร้านอาหารตัวอย่าง</div>}
                                    {receiptOpts.showAddress && <div className="text-center whitespace-pre-wrap mb-1">{receiptOpts.address || settingsForm.restaurantAddress}</div>}
                                    {receiptOpts.showPhoneNumber && <div className="text-center mb-2">Tel: {receiptOpts.phoneNumber || settingsForm.restaurantPhone}</div>}
                                    
                                    <div className="w-full border-b border-dashed border-gray-400 my-2"></div>
                                    <div style={{fontSize: '14px', fontWeight: 'bold', textAlign: 'center', marginBottom: '10px'}}>ใบเสร็จรับเงิน</div>

                                    <div className="w-full text-left space-y-0.5 mb-2">
                                        {receiptOpts.showTable && <div>โต๊ะ: 5</div>}
                                        {receiptOpts.showOrderId && <div>Order: #001</div>}
                                        {receiptOpts.showDateTime && <div>วันที่: {new Date().toLocaleDateString('th-TH')} {new Date().toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}</div>}
                                        {receiptOpts.showStaff && <div>พนักงาน: Admin</div>}
                                    </div>

                                    {receiptOpts.showItems && (
                                        <>
                                            <div className="w-full border-b border-dashed border-gray-400 mb-2"></div>
                                            <div className="w-full space-y-1 mb-2">
                                                <div className="flex justify-between"><span>1. ข้าวกะเพรา</span><span>60.00</span></div>
                                                <div className="flex justify-between"><span>2. น้ำเปล่า</span><span>15.00</span></div>
                                            </div>
                                        </>
                                    )}

                                    <div className="w-full border-b border-dashed border-gray-400 my-2"></div>
                                    <div className="w-full space-y-1">
                                        {receiptOpts.showSubtotal && <div className="flex justify-between"><span>รวมเงิน</span><span>75.00</span></div>}
                                        {receiptOpts.showTax && <div className="flex justify-between"><span>ภาษี (7%)</span><span>5.25</span></div>}
                                        {receiptOpts.showTotal && <div className="flex justify-between font-bold text-sm mt-1"><span>ยอดสุทธิ</span><span>80.25</span></div>}
                                        {receiptOpts.showPaymentMethod && <div className="text-center mt-2">(ชำระโดย: เงินสด)</div>}
                                    </div>
                                    {receiptOpts.showThankYouMessage && <div className="mt-4 text-center font-bold">*** {receiptOpts.thankYouMessage} ***</div>}
                                    {receiptOpts.showQrCode && settingsForm.qrCodeUrl && (
                                        <div className="mt-4 text-center border-t border-dashed border-gray-400 pt-3">
                                            <div className="font-bold text-sm mb-1">สแกนเพื่อชำระเงิน</div>
                                            <img src={settingsForm.qrCodeUrl} alt="QR Code" className="h-24 w-auto object-contain mx-auto" crossOrigin="anonymous"/>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 mt-4">
                    <StatusIndicator status={printerStatus[type]} label="สถานะ" />
                    <button type="button" onClick={() => handleCheckPrinterStatus(type)} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700">ตรวจสอบสถานะ</button>
                    <button type="button" onClick={() => handleTestPrint(type)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">ทดสอบพิมพ์</button>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-gray-800">ตั้งค่าระบบ</h2>
                    <button onClick={props.onClose} className="text-gray-500 hover:text-gray-700">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex border-b bg-white overflow-x-auto scrollbar-hide">
                    {['general', 'printer', 'menu', 'delivery', 'integrations', 'database'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${
                                activeTab === tab ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {tab === 'general' && 'ทั่วไป'}
                            {tab === 'printer' && 'เครื่องพิมพ์'}
                            {tab === 'menu' && 'เมนูแนะนำ'}
                            {tab === 'delivery' && 'Delivery'}
                            {tab === 'integrations' && 'การเชื่อมต่อ'}
                            {tab === 'database' && 'ความจำฐานข้อมูล 💾'}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {activeTab === 'general' && (
                        <div className="space-y-6 max-w-3xl mx-auto">
                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">ข้อมูลร้าน</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">ชื่อร้าน</label>
                                        <input 
                                            type="text" 
                                            value={settingsForm.logoUrl ? 'ใช้โลโก้แทน' : '(แก้ไขที่ Header)'} 
                                            disabled 
                                            className="mt-1 block w-full bg-gray-100 border border-gray-300 rounded-md shadow-sm p-2 text-gray-500" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
                                        <input 
                                            type="text" 
                                            value={settingsForm.restaurantPhone} 
                                            onChange={e => handleInputChange('restaurantPhone', e.target.value)} 
                                            className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" 
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700">ที่อยู่</label>
                                        <textarea 
                                            value={settingsForm.restaurantAddress} 
                                            onChange={e => handleInputChange('restaurantAddress', e.target.value)} 
                                            rows={3} 
                                            className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เลขประจำตัวผู้เสียภาษี</label>
                                        <input 
                                            type="text" 
                                            value={settingsForm.taxId} 
                                            onChange={e => handleInputChange('taxId', e.target.value)} 
                                            className="mt-1 block w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" 
                                        />
                                    </div>
                                    <div className="md:col-span-2 border-t pt-4 mt-2">
                                        <h4 className="text-sm font-bold text-gray-800 mb-3">ช่องทางการติดต่อ (Floating Contact Buttons)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Line OA URL</label>
                                                <input 
                                                    type="text" 
                                                    value={settingsForm.lineOaUrl} 
                                                    onChange={e => handleInputChange('lineOaUrl', e.target.value)} 
                                                    placeholder="https://line.me/ti/p/..."
                                                    className="w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Facebook Page URL</label>
                                                <input 
                                                    type="text" 
                                                    value={settingsForm.facebookPageUrl} 
                                                    onChange={e => handleInputChange('facebookPageUrl', e.target.value)} 
                                                    placeholder="https://www.facebook.com/..."
                                                    className="w-full bg-gray-50 border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2 border-t pt-4 mt-2">
                                        <label className="block text-sm font-bold text-blue-600 mb-1">Telegram Bot (สำหรับแจ้งเตือนออเดอร์/เรียกพนักงาน)</label>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Bot Token (จาก @BotFather)</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type={showTelegramToken ? "text" : "password"} 
                                                        value={settingsForm.telegramBotToken || ''} 
                                                        onChange={e => handleInputChange('telegramBotToken', e.target.value)} 
                                                        placeholder="เช่น 123456789:ABCdef..."
                                                        className="flex-1 bg-white border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono" 
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTelegramToken(!showTelegramToken)}
                                                        className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 text-gray-600 transition-colors flex items-center justify-center text-sm"
                                                        title={showTelegramToken ? "ซ่อนพาสเวิร์ด" : "แสดงพาสเวิร์ด"}
                                                    >
                                                        {showTelegramToken ? '🙈' : '👁️'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (!settingsForm.telegramBotToken) {
                                                                Swal.fire({
                                                                    icon: 'warning',
                                                                    title: 'ไม่มีข้อมูลคัดลอก',
                                                                    text: 'กรุณากรอก Bot Token ก่อนคัดลอก',
                                                                    confirmButtonColor: '#3b82f6'
                                                                });
                                                                return;
                                                            }
                                                            try {
                                                                await navigator.clipboard.writeText(settingsForm.telegramBotToken);
                                                                Swal.fire({
                                                                    icon: 'success',
                                                                    title: 'คัดลอกสำเร็จ!',
                                                                    text: 'คัดลอก Bot Token ไปยังคลิปบอร์ดแล้ว นำไปวางในระบบตั้งค่าสาขาอื่นได้เลย',
                                                                    timer: 2000,
                                                                    showConfirmButton: false
                                                                });
                                                            } catch (err) {
                                                                console.error(err);
                                                                const textarea = document.createElement("textarea");
                                                                textarea.value = settingsForm.telegramBotToken;
                                                                document.body.appendChild(textarea);
                                                                textarea.select();
                                                                try {
                                                                    document.execCommand("copy");
                                                                    Swal.fire({
                                                                        icon: 'success',
                                                                        title: 'คัดลอกสำเร็จ!',
                                                                        text: 'คัดลอก Bot Token ไปยังคลิปบอร์ดแล้ว นำไปวางในระบบตั้งค่าสาขาอื่นได้เลย',
                                                                        timer: 2000,
                                                                        showConfirmButton: false
                                                                    });
                                                                } catch (e) {
                                                                    Swal.fire({
                                                                        icon: 'error',
                                                                        title: 'คัดลอกไม่สำเร็จ',
                                                                        text: 'กรุณาลองเลือกครอบข้อความแล้วคัดลอกด้วยตัวเอง',
                                                                        confirmButtonColor: '#3b82f6'
                                                                    });
                                                                }
                                                                document.body.removeChild(textarea);
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-blue-100 border border-blue-200 text-blue-700 font-bold rounded-md hover:bg-blue-200 transition-colors flex items-center gap-1.5 text-sm"
                                                        title="คัดลอก Token"
                                                    >
                                                        📋 คัดลอก
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600">Chat ID / Group ID (ผู้รับแจ้งเตือน)</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        value={settingsForm.telegramChatId || ''} 
                                                        onChange={e => handleInputChange('telegramChatId', e.target.value)} 
                                                        placeholder="เช่น -100123456789"
                                                        className="flex-1 bg-white border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" 
                                                    />
                                                    <button 
                                                        onClick={handleTestTelegramNotification}
                                                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-bold text-sm shadow-sm transition-colors"
                                                    >
                                                        ทดสอบส่ง
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 border-t pt-4 mt-2">
                                        <label className="block text-sm font-bold text-green-600 mb-1">LINE Messaging API (สำหรับแจ้งเตือนออเดอร์)</label>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">Channel Access Token (Long-lived)</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type={showLineToken ? "text" : "password"} 
                                                        value={settingsForm.lineMessagingToken || ''} 
                                                        onChange={e => handleInputChange('lineMessagingToken', e.target.value)} 
                                                        placeholder="วาง Channel Access Token ที่นี่..."
                                                        className="flex-1 bg-white border border-gray-300 rounded-md shadow-sm p-2 focus:ring-green-500 focus:border-green-500 text-sm font-mono" 
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowLineToken(!showLineToken)}
                                                        className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 text-gray-600 transition-colors flex items-center justify-center text-sm"
                                                        title={showLineToken ? "ซ่อนพาสเวิร์ด" : "แสดงพาสเวิร์ด"}
                                                    >
                                                        {showLineToken ? '🙈' : '👁️'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (!settingsForm.lineMessagingToken) {
                                                                Swal.fire({
                                                                    icon: 'warning',
                                                                    title: 'ไม่มีข้อมูลคัดลอก',
                                                                    text: 'กรุณากรอก LINE Messaging Channel Access Token ก่อนคัดลอก',
                                                                    confirmButtonColor: '#16a34a'
                                                                });
                                                                return;
                                                            }
                                                            try {
                                                                await navigator.clipboard.writeText(settingsForm.lineMessagingToken);
                                                                Swal.fire({
                                                                    icon: 'success',
                                                                    title: 'คัดลอกสำเร็จ!',
                                                                    text: 'คัดลอก LINE Channel Access Token ไปยังคลิปบอร์ดแล้ว นำไปวางในระบบตั้งค่าสาขาอื่นได้เลย',
                                                                    timer: 2000,
                                                                    showConfirmButton: false
                                                                });
                                                            } catch (err) {
                                                                console.error(err);
                                                                const textarea = document.createElement("textarea");
                                                                textarea.value = settingsForm.lineMessagingToken;
                                                                document.body.appendChild(textarea);
                                                                textarea.select();
                                                                try {
                                                                    document.execCommand("copy");
                                                                    Swal.fire({
                                                                        icon: 'success',
                                                                        title: 'คัดลอกสำเร็จ!',
                                                                        text: 'คัดลอก LINE Channel Access Token ไปยังคลิปบอร์ดแล้ว นำไปวางในระบบตั้งค่าสาขาอื่นได้เลย',
                                                                        timer: 2000,
                                                                        showConfirmButton: false
                                                                    });
                                                                } catch (e) {
                                                                    Swal.fire({
                                                                        icon: 'error',
                                                                        title: 'คัดลอกไม่สำเร็จ',
                                                                        text: 'กรุณาลองเลือกครอบข้อความแล้วคัดลอกด้วยตัวเอง',
                                                                        confirmButtonColor: '#16a34a'
                                                                    });
                                                                }
                                                                document.body.removeChild(textarea);
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-green-100 border border-green-200 text-green-700 font-bold rounded-md hover:bg-green-200 transition-colors flex items-center gap-1.5 text-sm"
                                                        title="คัดลอก Token"
                                                    >
                                                        📋 คัดลอก
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600">User ID / Group ID (ผู้รับแจ้งเตือน)</label>
                                                <input 
                                                    type="text" 
                                                    value={settingsForm.lineUserId || ''} 
                                                    onChange={e => handleInputChange('lineUserId', e.target.value)} 
                                                    placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                                    className="w-full bg-white border border-gray-300 rounded-md shadow-sm p-2 focus:ring-green-500 focus:border-green-500" 
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        window.open('https://developers.line.biz/console/', '_blank');
                                                    }}
                                                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 text-sm whitespace-nowrap border border-gray-300"
                                                >
                                                    ไปที่ LINE Developers Console
                                                </button>
                                                <button
                                                    onClick={handleTestLineNotification}
                                                    className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm whitespace-nowrap shadow-sm"
                                                >
                                                    ทดสอบส่งข้อความ
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            * LINE Notify ยุติการให้บริการแล้ว ระบบจึงเปลี่ยนมาใช้ LINE Messaging API แทน
                                            <br/>
                                            * ต้องทำการ Deploy Cloud Functions เพื่อให้การแจ้งเตือนทำงานได้สมบูรณ์
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">รูปภาพและเสียง</h3>
                                <div className="space-y-4">
                                    {renderImageUpload("โลโก้ร้าน (สำหรับใบเสร็จ)", settingsForm.logoUrl, 'logoUrl', logoInputRef)}
                                    {renderImageUpload("App Logo (สำหรับหน้า Login/Admin)", settingsForm.appLogoUrl, 'appLogoUrl', appLogoInputRef)}
                                    {renderImageUpload("QR Code จ่ายเงิน", settingsForm.qrCodeUrl, 'qrCodeUrl', qrInputRef)}
                                    {renderImageUpload("ลายเซ็น (สำหรับใบเสร็จ)", settingsForm.signatureUrl, 'signatureUrl', signatureInputRef)}
                                    
                                    {renderSoundUpload("เสียงแจ้งเตือนออเดอร์ใหม่", settingsForm.notificationSoundUrl, 'notificationSoundUrl', soundInputRef)}
                                    {renderSoundUpload("เสียงแจ้งเตือนเรียกพนักงาน", settingsForm.staffCallSoundUrl, 'staffCallSoundUrl', staffSoundInputRef)}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">ลิงก์สำหรับลูกค้าสั่งอาหาร (ออนไลน์)</h3>
                                <div className="space-y-4">
                                    {(() => {
                                        const urlBranchId = new URLSearchParams(window.location.search).get('branchId');
                                        let currentBranchId = urlBranchId;
                                        if (!currentBranchId) {
                                            try {
                                                const storedBranch = localStorage.getItem('selectedBranch');
                                                if (storedBranch) {
                                                    currentBranchId = JSON.parse(storedBranch).id.toString();
                                                }
                                            } catch (e) {}
                                        }
                                        const takeawayLink = `${window.location.origin}${window.location.pathname}?orderType=takeaway${currentBranchId ? `&branchId=${currentBranchId}` : ''}`;
                                        const deliveryLink = `${window.location.origin}${window.location.pathname}?orderType=delivery${currentBranchId ? `&branchId=${currentBranchId}` : ''}`;

                                        return (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">ลิงก์สั่งกลับบ้าน (Takeaway)</label>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="text" 
                                                            readOnly 
                                                            value={takeawayLink}
                                                            className="flex-1 bg-gray-50 border border-gray-300 rounded-md p-2 text-sm text-gray-600"
                                                        />
                                                        <button 
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(takeawayLink);
                                                                Swal.fire({ icon: 'success', title: 'คัดลอกลิงก์แล้ว', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                                                            }}
                                                            className="px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 font-medium text-sm whitespace-nowrap"
                                                        >
                                                            คัดลอก
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1">นำลิงก์นี้ไปแปะใน Facebook หรือ Line เพื่อให้ลูกค้ากดสั่งอาหารกลับบ้านได้ทันที</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">ลิงก์เดลิเวอรี่ (Delivery)</label>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="text" 
                                                            readOnly 
                                                            value={deliveryLink}
                                                            className="flex-1 bg-gray-50 border border-gray-300 rounded-md p-2 text-sm text-gray-600"
                                                        />
                                                        <button 
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(deliveryLink);
                                                                Swal.fire({ icon: 'success', title: 'คัดลอกลิงก์แล้ว', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                                                            }}
                                                            className="px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 font-medium text-sm whitespace-nowrap"
                                                        >
                                                            คัดลอก
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1">นำลิงก์นี้ไปแปะใน Facebook หรือ Line เพื่อให้ลูกค้ากดสั่งเดลิเวอรี่ (ร้านจัดส่งเอง)</p>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2">เวลาทำการ</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เวลาเปิด</label>
                                        <input type="time" value={settingsForm.openingTime || '10:00'} onChange={e => handleInputChange('openingTime', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">เวลาปิด</label>
                                        <input type="time" value={settingsForm.closingTime || '22:00'} onChange={e => handleInputChange('closingTime', e.target.value)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
                                    <span>🔔</span> ตั้งค่า Pop-up แจ้งข่าวสารลูกค้า
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-100">
                                        <div>
                                            <span className="block font-medium text-gray-800 text-sm">แสดง Pop-up แจ้งข้อมูลข่าวสาร</span>
                                            <span className="block text-xs text-gray-500">แสดง Pop-up ค้างไว้จนกว่าลูกค้าจะกดปิด เมื่อเข้าสู่โปรแกรมด้วยการสแกน QR Code</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={settingsForm.qrPopupEnabled} 
                                                onChange={e => handleInputChange('qrPopupEnabled', e.target.checked)}
                                                className="sr-only peer" 
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">ลิงก์รูปภาพ Pop-up (URL)</label>
                                        <input 
                                            type="text" 
                                            value={settingsForm.qrPopupImageUrl || ''} 
                                            onChange={e => handleInputChange('qrPopupImageUrl', e.target.value)} 
                                            placeholder="https://example.com/image.jpg (ใส่ลิงก์รูปภาพเพื่อแสดงใน Pop-up)"
                                            className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500" 
                                        />
                                        {settingsForm.qrPopupImageUrl && (
                                            <div className="mt-2 border rounded-md p-2 bg-gray-50 flex justify-center">
                                                <img 
                                                    src={settingsForm.qrPopupImageUrl} 
                                                    alt="Preview" 
                                                    className="max-h-40 object-contain rounded" 
                                                    onError={(e) => {
                                                        (e.target as HTMLElement).style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">ข้อความรายละเอียดใน Pop-up</label>
                                        <textarea 
                                            value={settingsForm.qrPopupMessage || ''} 
                                            onChange={e => handleInputChange('qrPopupMessage', e.target.value)} 
                                            rows={3} 
                                            placeholder="ใส่ข้อความประชาสัมพันธ์ เช่น ร้านเปิดโซนใหม่ หรือ มีโปรโมชั่นพิเศษวันนี้..."
                                            className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500" 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'printer' && (
                        <div className="space-y-6 max-w-4xl mx-auto">
                            <div className="bg-white p-6 rounded-lg shadow-sm">
                                <h3 className="text-xl font-bold text-gray-800 border-b pb-4 mb-4 flex items-center gap-2">
                                    <span className="text-2xl">🍳</span> เครื่องพิมพ์ครัว (Kitchen)
                                </h3>
                                {renderPrinterSettings('kitchen')}
                            </div>
                            <div className="bg-white p-6 rounded-lg shadow-sm">
                                <h3 className="text-xl font-bold text-gray-800 border-b pb-4 mb-4 flex items-center gap-2">
                                    <span className="text-2xl">🧾</span> เครื่องพิมพ์ใบเสร็จ (Cashier)
                                </h3>
                                {renderPrinterSettings('cashier')}
                            </div>
                        </div>
                    )}

                    {activeTab === 'menu' && (
                        <div className="bg-white p-6 rounded-lg shadow-sm max-w-4xl mx-auto">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">เลือกเมนูแนะนำ</h3>
                                    <p className="text-xs text-gray-500 mt-1">เลือกเมนูเด่นเพื่อแสดงในหน้าแนะนำของร้าน</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                                        <span className="text-xs font-semibold text-gray-600">ตั้งค่าจำนวนสูงสุด:</span>
                                        <input
                                            type="number"
                                            min="1"
                                            value={tempRecommendedItemsLimit}
                                            onChange={(e) => {
                                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                                setTempRecommendedItemsLimit(val);
                                            }}
                                            className="w-16 text-center text-sm font-bold bg-white border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 text-sm font-bold text-blue-700">
                                        <span>เหลือเลือกได้อีก:</span>
                                        <span className={`px-2 py-0.5 rounded text-white text-xs font-black min-w-[24px] text-center ${tempRecommendedItemsLimit - tempRecommendedIds.length <= 0 ? 'bg-red-500' : 'bg-blue-600'}`}>
                                            {Math.max(0, tempRecommendedItemsLimit - tempRecommendedIds.length)}
                                        </span>
                                        <span>รายการ</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {props.menuItems.map(item => {
                                    const isSelected = tempRecommendedIds.includes(item.id);
                                    return (
                                        <div 
                                            key={item.id} 
                                            onClick={() => handleRecommendToggle(item.id)}
                                            className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${isSelected ? 'border-green-500 shadow-md transform scale-105' : 'border-gray-200 hover:border-blue-300'}`}
                                        >
                                            <div className="aspect-square bg-gray-100">
                                                <MenuItemImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                            </div>
                                            <div className={`p-2 text-xs font-semibold text-center truncate ${isSelected ? 'bg-green-50 text-green-700' : 'bg-white text-gray-700'}`}>
                                                {item.name}
                                            </div>
                                            {isSelected && (
                                                <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'delivery' && (
                        <div className="bg-white p-6 rounded-lg shadow-sm max-w-3xl mx-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-800">จัดการ Delivery Providers</h3>
                                <button 
                                    onClick={() => {
                                        setIsPriceHistoryOpen(true);
                                        fetchPriceHistory();
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-100 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    ประวัติการปรับราคา
                                </button>
                            </div>
                            <div className="space-y-4">
                                {tempDeliveryProviders.map(provider => (
                                    <div key={provider.id} className="p-4 border rounded-lg bg-gray-50 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="w-10 h-10 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
                                                    style={{ backgroundColor: provider.color || '#e5e7eb' }}
                                                >
                                                    {provider.iconUrl ? (
                                                        <img src={provider.iconUrl} alt={provider.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-white font-bold text-lg">{provider.name.charAt(0)}</span>
                                                    )}
                                                </div>
                                                <span className="font-bold text-gray-800 text-lg">{provider.name}</span>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={provider.isEnabled} 
                                                    onChange={() => handleDeliveryToggle(provider.id)} 
                                                    className="sr-only peer" 
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                        
                                        {/* Edit Fields */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-200">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">URL รูปไอคอน</label>
                                                <input 
                                                    type="text" 
                                                    value={provider.iconUrl || ''} 
                                                    onChange={(e) => handleDeliveryFieldChange(provider.id, 'iconUrl', e.target.value)}
                                                    placeholder="https://..."
                                                    className="w-full text-sm border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">สีประจำค่าย</label>
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="color" 
                                                        value={provider.color || '#000000'} 
                                                        onChange={(e) => handleDeliveryFieldChange(provider.id, 'color', e.target.value)}
                                                        className="h-9 w-12 border border-gray-300 rounded cursor-pointer p-0.5 bg-white"
                                                    />
                                                    <input 
                                                        type="text" 
                                                        value={provider.color || ''} 
                                                        onChange={(e) => handleDeliveryFieldChange(provider.id, 'color', e.target.value)}
                                                        placeholder="#RRGGBB"
                                                        className="flex-1 text-sm border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'integrations' && (
                        <div className="bg-white p-6 rounded-lg shadow-sm max-w-3xl mx-auto">
                            <div className="flex items-center gap-3 mb-6 border-b pb-4">
                                <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                </svg>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800">Facebook Setting</h3>
                                    <p className="text-sm text-gray-500">เชื่อมต่อระบบกับ Facebook Page ของร้านคุณ</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                                    <p className="font-bold mb-1">คำแนะนำการตั้งค่า:</p>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li>คุณต้องสร้าง App ใน <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold">Facebook for Developers</a> ก่อน</li>
                                        <li>นำ <strong>App ID</strong> และ <strong>App Secret</strong> มากรอกในช่องด้านล่าง</li>
                                        <li>การเชื่อมต่อนี้จะช่วยให้ระบบ POS สามารถทำงานร่วมกับเพจของคุณได้ในอนาคต (เช่น การบรอดแคสต์ หรือดึงออเดอร์)</li>
                                    </ul>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">
                                            App ID <span className="text-red-500">*</span>
                                        </label>
                                        <input 
                                            type="text" 
                                            value={settingsForm.facebookAppId} 
                                            onChange={e => handleInputChange('facebookAppId', e.target.value)} 
                                            placeholder="ระบุ Facebook App ID"
                                            className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">
                                            Secret Key <span className="text-red-500">*</span>
                                        </label>
                                        <input 
                                            type="password" 
                                            value={settingsForm.facebookAppSecret} 
                                            onChange={e => handleInputChange('facebookAppSecret', e.target.value)} 
                                            placeholder="ระบุ Facebook App Secret"
                                            className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'database' && (
                        <div className="space-y-6 max-w-4xl mx-auto">
                            {/* Header Intro Card */}
                            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-800">หน่วยความจำและการใช้งานฐานข้อมูล (Firestore Storage)</h3>
                                        <p className="text-sm text-gray-500">
                                            คำนวณและวิเคราะห์ขนาดพื้นที่จัดเก็บข้อมูลของแต่ละสาขา โดยไม่คำนวณประวัติการเรียกพนักงาน
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleCalculateStorage}
                                    disabled={isCalculatingStorage || isBackingUp || isImporting}
                                    className={`px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-all ${
                                        isCalculatingStorage || isBackingUp || isImporting
                                        ? 'bg-blue-100 text-blue-400 cursor-not-allowed' 
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                >
                                    {isCalculatingStorage ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            กำลังประมวลผล...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 15H19" />
                                            </svg>
                                            คำนวณพื้นที่ความจำใหม่
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Last Calculated Timestamp Notice */}
                            {lastCalculatedTime && !isCalculatingStorage && !isBackingUp && !isImporting && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-800 flex items-center justify-between gap-2 shadow-sm">
                                    <div className="flex items-center gap-1.5">
                                        <svg className="w-4 h-4 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>วิเคราะห์และจำลองการคำนวณพื้นที่จัดเก็บข้อมูลสำเร็จเมื่อ: <span className="font-bold">{new Date(Number(lastCalculatedTime)).toLocaleString('th-TH')} น.</span></span>
                                    </div>
                                    <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">Cached</span>
                                </div>
                            )}

                            {/* Backup / Import Progress Screen with Percentage */}
                            {(isBackingUp || isImporting) && (
                                <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="relative flex items-center justify-center">
                                        <div className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-indigo-400 opacity-25"></div>
                                        <div className="rounded-full bg-indigo-100 p-4">
                                            <svg className="w-8 h-8 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-bold text-gray-800 text-lg">
                                            {isBackingUp ? 'กำลังดำเนินการสำรองข้อมูลสาขา...' : 'กำลังนำเข้าข้อมูลกลับสู่สาขา...'}
                                        </p>
                                        <p className="text-sm font-medium text-indigo-600 animate-pulse">
                                            {currentProcessName || 'กำลังดาวน์โหลด/อัปโหลด...'}
                                        </p>
                                    </div>
                                    <div className="w-full max-w-md bg-gray-100 rounded-full h-4 overflow-hidden shadow-inner relative flex items-center justify-center">
                                        <div 
                                            className="bg-gradient-to-r from-indigo-500 to-blue-600 h-4 rounded-full transition-all duration-300 absolute left-0 top-0"
                                            style={{ width: `${isBackingUp ? backupProgress : importProgress}%` }}
                                        ></div>
                                        <span className="relative z-10 text-[10px] font-bold text-gray-700 drop-shadow">
                                            {isBackingUp ? backupProgress : importProgress}%
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400">กรุณาอย่าปิดหน้านี้หรือโปรแกรมในขณะที่ระบบกำลังซิงก์ข้อมูล</p>
                                </div>
                            )}

                            {/* Loading State with Progress */}
                            {isCalculatingStorage && (
                                <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="relative flex items-center justify-center">
                                        <div className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-blue-400 opacity-25"></div>
                                        <div className="rounded-full bg-blue-100 p-4">
                                            <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 text-lg">กำลังรวบรวมข้อมูลเอกสารของแต่ละตาราง</p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            กำลังคำนวณสาขา: <span className="font-semibold text-blue-600">{calculationProgressBranch || '...'}</span>
                                        </p>
                                    </div>
                                    <div className="w-64 bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div className="bg-blue-600 h-2 rounded-full animate-pulse w-3/4 mx-auto"></div>
                                    </div>
                                </div>
                            )}

                            {/* No Cache Screen */}
                            {!isCalculatingStorage && !storageUsage && (
                                <div className="bg-white p-12 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="p-4 bg-gray-50 text-gray-400 rounded-full">
                                        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-gray-800">ยังไม่มีข้อมูลการใช้หน่วยความจำ</h4>
                                        <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
                                            การคำนวณพื้นที่ความจำจะสแกนจำนวนเอกสารและคำนวณไบต์ของแต่ละชุดข้อมูลแยกตามสาขาแบบเรียลไทม์
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleCalculateStorage}
                                        className="px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 font-semibold rounded-lg shadow transition-all"
                                    >
                                        เริ่มประมวลผลการใช้ความจำ
                                    </button>
                                </div>
                            )}

                            {/* Main Storage Usage Dashboard */}
                            {!isCalculatingStorage && storageUsage && (
                                <div className="space-y-6">
                                    {/* Summary Cards Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Total Size */}
                                        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4">
                                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">ขนาดฐานข้อมูลรวม</p>
                                                <p className="text-2xl font-bold text-gray-800">
                                                    {formatBytes(Object.values(storageUsage).reduce((acc: number, b: any) => acc + (b.totalSize || 0), 0))}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Total Docs */}
                                        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4">
                                            <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">จำนวนเอกสารรวม</p>
                                                <p className="text-2xl font-bold text-gray-800">
                                                    {Object.values(storageUsage).reduce((acc: number, b: any) => acc + (b.totalDocs || 0), 0).toLocaleString('th-TH')} <span className="text-sm font-normal text-gray-500">เอกสาร</span>
                                                </p>
                                            </div>
                                        </div>

                                        {/* Largest Branch */}
                                        <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4">
                                            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">สาขาที่ข้อมูลเยอะที่สุด</p>
                                                <p className="text-lg font-bold text-gray-800 truncate">
                                                    {(() => {
                                                        const sorted = Object.entries(storageUsage).sort((a: any, b: any) => b[1].totalSize - a[1].totalSize);
                                                        return sorted[0] ? sorted[0][1].branchName : 'ไม่มีข้อมูล';
                                                    })()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Branch Storage Visual Comparison Chart */}
                                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 space-y-4">
                                        <h4 className="text-md font-bold text-gray-800">📊 แผนภูมิเปรียบเทียบขนาดหน่วยความจำระหว่างสาขา</h4>
                                        <div className="space-y-4 pt-2">
                                            {Object.entries(storageUsage).map(([branchId, bData]: any) => {
                                                const totalOfAll = Object.values(storageUsage).reduce((acc: number, b: any) => acc + (b.totalSize || 0), 0) || 1;
                                                const percentageOfTotal = ((bData.totalSize / totalOfAll) * 100).toFixed(1);
                                                
                                                return (
                                                    <div key={branchId} className="space-y-1.5 p-3 rounded-lg border border-gray-50 hover:border-gray-100 hover:bg-gray-50/50 transition-all">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                                                            <span className="font-bold text-gray-800">{bData.branchName}</span>
                                                            <div className="flex items-center gap-2.5 text-xs font-medium flex-wrap">
                                                                <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{percentageOfTotal}% ของทั้งหมด</span>
                                                                <span className="text-gray-500">{formatBytes(bData.totalSize)} ({bData.totalDocs.toLocaleString('th-TH')} เอกสาร)</span>
                                                                
                                                                {/* Backup & Import Buttons */}
                                                                <div className="flex items-center gap-1.5 ml-1 border-l pl-2.5">
                                                                    <button
                                                                        onClick={() => handleBackupBranch(branchId, bData.branchName)}
                                                                        disabled={isBackingUp || isImporting || isCalculatingStorage}
                                                                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:bg-indigo-200 text-xs font-semibold rounded-md border border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        title="สำรองข้อมูลสาขานี้เป็นไฟล์ JSON"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                                        </svg>
                                                                        <span>Backup</span>
                                                                    </button>

                                                                    <label className={`flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-600 hover:bg-teal-100 active:bg-teal-200 text-xs font-semibold rounded-md border border-teal-200 transition-colors cursor-pointer ${(isBackingUp || isImporting || isCalculatingStorage) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                        </svg>
                                                                        <span>Import</span>
                                                                        <input
                                                                            type="file"
                                                                            accept=".json"
                                                                            className="hidden"
                                                                            disabled={isBackingUp || isImporting || isCalculatingStorage}
                                                                            onChange={(e) => handleImportBranch(e, branchId, bData.branchName)}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mt-1">
                                                            <div 
                                                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-1000"
                                                                style={{ width: `${percentageOfTotal}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Detailed Collection Breakdown */}
                                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 space-y-4">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b pb-4">
                                            <div>
                                                <h4 className="text-md font-bold text-gray-800">🔍 รายละเอียดพื้นที่จัดเก็บแต่ละตารางข้อมูล</h4>
                                                <p className="text-xs text-gray-500 mt-0.5">เลือกสาขาด้านขวาเพื่อดูโครงสร้างหน่วยความจำแบบเจาะลึก</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 font-medium">สาขา:</span>
                                                <select
                                                    value={selectedDetailBranchId}
                                                    onChange={e => setSelectedDetailBranchId(e.target.value)}
                                                    className="bg-gray-50 border border-gray-300 rounded-md shadow-sm px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                >
                                                    {Object.entries(storageUsage).map(([branchId, bData]: any) => (
                                                        <option key={branchId} value={branchId}>{bData.branchName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Collection breakdown list */}
                                        {selectedDetailBranchId && storageUsage[selectedDetailBranchId] && (
                                            <div className="space-y-4 pt-2">
                                                <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider pb-2 border-b">
                                                    <div className="col-span-6">ตารางข้อมูล (Collection Name)</div>
                                                    <div className="col-span-3 text-right">จำนวนเอกสาร</div>
                                                    <div className="col-span-3 text-right">ขนาดพื้นที่โดยประมาณ</div>
                                                </div>

                                                <div className="space-y-3 divide-y divide-gray-50 max-h-[400px] overflow-y-auto pr-2">
                                                    {storageUsage[selectedDetailBranchId].collections.map((col: any) => {
                                                        const branchTotal = storageUsage[selectedDetailBranchId].totalSize || 1;
                                                        const colPercentage = ((col.estimatedSize / branchTotal) * 100).toFixed(1);

                                                        return (
                                                            <div key={col.key} className="grid grid-cols-12 gap-2 text-sm pt-3 items-center">
                                                                <div className="col-span-6 space-y-1">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-semibold text-gray-800">{col.label}</span>
                                                                        <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                                                            {col.key}
                                                                        </span>
                                                                    </div>
                                                                    {/* Miniature progress bar inside table */}
                                                                    <div className="w-full max-w-xs bg-gray-100 rounded-full h-1">
                                                                        <div 
                                                                            className="bg-indigo-500 h-1 rounded-full"
                                                                            style={{ width: `${colPercentage}%` }}
                                                                        ></div>
                                                                    </div>
                                                                </div>
                                                                <div className="col-span-3 text-right font-semibold text-gray-700">
                                                                    {col.docCount.toLocaleString('th-TH')} <span className="text-xs text-gray-400 font-normal">รายการ</span>
                                                                </div>
                                                                <div className="col-span-3 text-right">
                                                                    <div className="font-bold text-gray-900">{formatBytes(col.estimatedSize)}</div>
                                                                    <div className="text-xs text-gray-400">{colPercentage}% ของสาขา</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Exclude notice */}
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 flex items-start gap-2.5">
                                        <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <div>
                                            <span className="font-bold">ข้อมูลอ้างอิง:</span> ขนาดความจุจัดเก็บถูกวิเคราะห์เชิงพื้นที่ของวัตถุ JSON และค่าขนาด Firestore (ประมาณ +100 ไบต์ต่อเอกสารตามสเปก) เพื่อจำลองผลที่ใกล้เคียงการใช้งานจริง โดยไม่นำข้อมูล <span className="font-bold text-red-600">ประวัติการเรียกพนักงาน (staffCalls/staffMessages)</span> มาร่วมประมวลผลตามเงื่อนไขความสำคัญของคุณเรียบร้อยแล้ว
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={props.onClose} className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300">ยกเลิก</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-md">บันทึกทั้งหมด</button>
                </div>

                {isPriceHistoryOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
                        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                                <h3 className="text-lg font-bold text-gray-800">ประวัติการปรับราคาโฆษณา</h3>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={handleExportExcel}
                                        className="bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1.5 rounded-md border border-green-200 text-sm font-medium flex items-center gap-1.5 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        Export Excel
                                    </button>
                                    <button onClick={() => setIsPriceHistoryOpen(false)} className="text-gray-500 hover:text-gray-700 p-1">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                {isLoadingHistory ? (
                                    <div className="flex justify-center py-10">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </div>
                                ) : priceHistory.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500">ไม่พบประวัติการปรับราคา</div>
                                ) : (
                                    <div className="space-y-3">
                                        {priceHistory.map((entry) => (
                                            <div key={entry.id} className="p-3 border rounded-lg bg-white shadow-sm flex justify-between items-center">
                                                <div>
                                                    <div className="font-bold text-gray-800">{entry.providerName}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {new Date(entry.timestamp).toLocaleString('th-TH')} • โดย {entry.updatedBy}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-400 line-through text-xs">{entry.oldPrice}฿</span>
                                                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                                        <span className="text-green-600 font-bold">{entry.newPrice}฿</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end">
                                <button onClick={() => setIsPriceHistoryOpen(false)} className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300">ปิด</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};