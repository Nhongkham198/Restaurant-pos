
import React, { useRef } from 'react';
import Swal from 'sweetalert2';

interface IngredientPriceUploadProps {
    onUpload: (data: any[], filename: string) => void;
    existingPrices?: any[];
}

// Robust helper to parse and normalize date strings from Gregorian and Thai Buddhist era calendars
const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmedStr = dateStr.trim();
    
    // 1. Try default system browser parsing
    let d = new Date(trimmedStr);
    if (!isNaN(d.getTime())) {
        let year = d.getFullYear();
        if (year > 2400) {
            d.setFullYear(year - 543);
        }
        return d;
    }
    
    // 2. Try parsing slash/dash formats like DD/MM/YYYY or DD-MM-YYYY
    const cleanStr = trimmedStr.replace(/-/g, '/');
    const slashMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const day = parseInt(slashMatch[1], 10);
        const month = parseInt(slashMatch[2], 10) - 1;
        let year = parseInt(slashMatch[3], 10);
        if (year > 2400) {
            year -= 543;
        }
        const parsedDate = new Date(year, month, day);
        if (!isNaN(parsedDate.getTime())) return parsedDate;
    }

    // 3. Try parsing text month formats (Thai language support)
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const thMonthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    
    const parts = trimmedStr.split(/[\s,]+/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const monthStr = parts[1];
        const yearStr = parts[2];
        
        let monthIndex = -1;
        monthIndex = thMonths.findIndex(m => monthStr.includes(m) || m.includes(monthStr));
        if (monthIndex === -1) {
            monthIndex = thMonthsFull.findIndex(m => monthStr.includes(m) || m.includes(monthStr));
        }
        
        if (monthIndex !== -1 && !isNaN(day)) {
            let year = parseInt(yearStr, 10);
            if (year > 2400) {
                year -= 543;
            }
            const parsedDate = new Date(year, monthIndex, day);
            if (!isNaN(parsedDate.getTime())) return parsedDate;
        }
    }

    return null;
};

// Find the newest date object and text in an array of ingredient prices
const findNewestDate = (items: any[]): { dateStr: string; dateObj: Date } | null => {
    let newestObj: Date | null = null;
    let newestStr = '';
    
    for (const item of items) {
        if (item && typeof item.date === 'string' && item.date.trim() !== '') {
            const parsed = parseDateString(item.date);
            if (parsed) {
                if (!newestObj || parsed > newestObj) {
                    newestObj = parsed;
                    newestStr = item.date;
                }
            }
        }
    }
    
    if (newestObj && newestStr) {
        return { dateStr: newestStr, dateObj: newestObj };
    }
    return null;
};

export const IngredientPriceUpload: React.FC<IngredientPriceUploadProps> = ({ onUpload, existingPrices }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (!Array.isArray(json)) {
                    throw new Error('รูปแบบไฟล์ไม่ถูกต้อง (ต้องเป็น Array ของข้อมูล)');
                }
                
                // Compare dates inside the files to alert if uploaded date is older than current date in program
                const uploadedInfo = findNewestDate(json);
                const existingInfo = findNewestDate(existingPrices || []);

                if (uploadedInfo && existingInfo) {
                    const uploadedTime = new Date(uploadedInfo.dateObj.getFullYear(), uploadedInfo.dateObj.getMonth(), uploadedInfo.dateObj.getDate()).getTime();
                    const existingTime = new Date(existingInfo.dateObj.getFullYear(), existingInfo.dateObj.getMonth(), existingInfo.dateObj.getDate()).getTime();

                    if (uploadedTime < existingTime) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'ตรวจพบวันที่เก่ากว่า',
                            text: `ไฟล์ที่เลือกมีข้อมูลระบุวันที่ล่าสุดคือ (${uploadedInfo.dateStr}) ซึ่งเก่ากว่าข้อมูลราคาปัจจุบันในระบบ (${existingInfo.dateStr}) โดยระบบจะยังคงใช้ข้อมูลราคาเดิมในปัจจุบันเป็นตัวอ้างอิงและยกเลิกการแก้ไขนี้`,
                            confirmButtonColor: '#e11d48'
                        });
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        return;
                    }
                }

                // Basic validation and trimming
                const uploadDate = new Date().toLocaleDateString('th-TH', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
                
                const uploadTime = Date.now();

                const cleanedJson = json.map(item => ({
                    ...item,
                    name: typeof item.name === 'string' ? item.name.trim() : item.name,
                    date: item.date || uploadDate, // Use current date if missing in JSON
                    updatedAt: uploadTime // Identical timestamp for notification logic
                }));

                // De-duplication Logic: Keep only the latest entry per ingredient name
                const uniquePricesMap = new Map<string, any>();
                cleanedJson.forEach(item => {
                    const name = item.name;
                    if (!name) return;

                    const existing = uniquePricesMap.get(name);
                    if (!existing) {
                        uniquePricesMap.set(name, item);
                    } else {
                        // Compare dates if available
                        const existingTime = existing.date ? new Date(existing.date).getTime() : 0;
                        const newTime = item.date ? new Date(item.date).getTime() : 0;

                        if (!isNaN(newTime) && !isNaN(existingTime)) {
                            // If dates are valid, take the newer one. 
                            // If same date, the later one in the array usually represents the most recent update in that batch.
                            if (newTime >= existingTime) {
                                uniquePricesMap.set(name, item);
                            }
                        } else {
                            // Fallback: If no valid dates, assume the one appearing later in the JSON file is newer
                            uniquePricesMap.set(name, item);
                        }
                    }
                });

                const finalData = Array.from(uniquePricesMap.values());

                if (finalData.length > 0) {
                    const firstItem = finalData[0];
                    if (!firstItem.name || firstItem.pricePerUnit === undefined) {
                        throw new Error('รูปแบบข้อมูลไม่ถูกต้อง (ต้องมี name และ pricePerUnit)');
                    }
                }

                onUpload(finalData, file.name);
                Swal.fire({
                    icon: 'success',
                    title: 'อัปโหลดไฟล์ราคาสำเร็จ',
                    text: `พบข้อมูลทั้งหมด ${json.length} รายการ (ยุบรวมรายการซ้ำเหลือ ${finalData.length} รายการ)`,
                    timer: 3000,
                    showConfirmButton: false
                });
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: error instanceof Error ? error.message : 'ไม่สามารถอ่านไฟล์ได้',
                });
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="flex items-center gap-2">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".json"
            />
            <button 
                onClick={() => fileInputRef.current?.click()} 
                className="px-4 py-2 bg-pink-600 text-white font-semibold rounded-lg hover:bg-pink-700 whitespace-nowrap text-sm shadow transition-all hover:shadow-md flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                อัปเดตราคาล่าสุด (JSON)
            </button>
        </div>
    );
};
