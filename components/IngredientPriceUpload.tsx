
import React, { useRef } from 'react';
import Swal from 'sweetalert2';

interface IngredientPriceUploadProps {
    onUpload: (data: any[], filename: string) => void;
}

export const IngredientPriceUpload: React.FC<IngredientPriceUploadProps> = ({ onUpload }) => {
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
                
                // Basic validation and trimming
                const cleanedJson = json.map(item => ({
                    ...item,
                    name: typeof item.name === 'string' ? item.name.trim() : item.name
                }));

                if (cleanedJson.length > 0) {
                    const firstItem = cleanedJson[0];
                    if (!firstItem.name || firstItem.pricePerUnit === undefined) {
                        throw new Error('รูปแบบข้อมูลไม่ถูกต้อง (ต้องมี name และ pricePerUnit)');
                    }
                }

                onUpload(cleanedJson, file.name);
                Swal.fire({
                    icon: 'success',
                    title: 'อัปโหลดไฟล์ราคาสำเร็จ',
                    text: `พบข้อมูลทั้งหมด ${json.length} รายการ`,
                    timer: 2000,
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
