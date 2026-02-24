import React, { useState, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { JobApplication, EmploymentContract, TimeRecord, PayrollRecord, LeaveRequest } from '../types';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

type HRTab = 'application' | 'contract' | 'time' | 'payroll' | 'leave';

import { User } from '../types';

interface HRManagementViewProps {
    isEditMode?: boolean;
    onOpenUserManager?: (userData: Partial<User>) => void;
    initialTab?: HRTab;
}

const HRManagementView: React.FC<HRManagementViewProps> = ({ isEditMode = false, onOpenUserManager, initialTab = 'application' }) => {
    const { 
        jobApplications, setJobApplications,
        employmentContracts, setEmploymentContracts,
        timeRecords, setTimeRecords,
        payrollRecords, setPayrollRecords,
        leaveRequests, setLeaveRequests,
        users, branchId
    } = useData();

    const [activeTab, setActiveTab] = useState<HRTab>(initialTab);
    
    // Sync activeTab with initialTab if it changes
    React.useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const [selectedItems, setSelectedItems] = useState<number[]>([]);

    // Reset selection when tab changes
    useMemo(() => {
        setSelectedItems([]);
    }, [activeTab]);

    const toggleSelection = (id: number) => {
        setSelectedItems(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleDeleteSelected = () => {
        if (selectedItems.length === 0) return;

        Swal.fire({
            title: 'ยืนยันการลบ?',
            text: `คุณต้องการลบรายการที่เลือก ${selectedItems.length} รายการใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'ลบ',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                switch (activeTab) {
                    case 'application':
                        setJobApplications(prev => prev.filter(item => !selectedItems.includes(item.id)));
                        break;
                    case 'contract':
                        setEmploymentContracts(prev => prev.filter(item => !selectedItems.includes(item.id)));
                        break;
                    case 'time':
                        setTimeRecords(prev => prev.filter(item => !selectedItems.includes(item.id)));
                        break;
                    case 'payroll':
                        setPayrollRecords(prev => prev.filter(item => !selectedItems.includes(item.id)));
                        break;
                    case 'leave':
                        setLeaveRequests(prev => prev.filter(item => !selectedItems.includes(item.id)));
                        break;
                }
                setSelectedItems([]);
                Swal.fire('ลบสำเร็จ', 'รายการที่เลือกถูกลบแล้ว', 'success');
            }
        });
    };

    const handleCreateUserFromApp = (app: JobApplication) => {
        if (onOpenUserManager) {
            onOpenUserManager({
                username: app.fullName.split(' ')[0].toLowerCase(), // Suggest username
                role: 'staff',
                // You might want to map other fields if User type supports them
            });
        }
    };

    // --- EXPORT FUNCTION ---
    const exportToExcel = (data: any[], fileName: string) => {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
    };

    // --- JOB APPLICATION LOGIC ---
    const handleAddApplication = () => {
        Swal.fire({
            title: 'เพิ่มใบสมัครงาน',
            html: `
                <input id="swal-fullname" class="swal2-input" placeholder="ชื่อ-นามสกุล">
                <input id="swal-position" class="swal2-input" placeholder="ตำแหน่งที่สมัคร">
                <input id="swal-phone" class="swal2-input" placeholder="เบอร์โทรศัพท์">
                <input id="swal-salary" type="number" class="swal2-input" placeholder="เงินเดือนที่คาดหวัง">
            `,
            focusConfirm: false,
            preConfirm: () => {
                return {
                    fullName: (document.getElementById('swal-fullname') as HTMLInputElement).value,
                    position: (document.getElementById('swal-position') as HTMLInputElement).value,
                    phoneNumber: (document.getElementById('swal-phone') as HTMLInputElement).value,
                    expectedSalary: Number((document.getElementById('swal-salary') as HTMLInputElement).value)
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const newApp: JobApplication = {
                    id: Date.now(),
                    ...result.value,
                    status: 'pending',
                    applicationDate: Date.now()
                };
                setJobApplications(prev => [...prev, newApp]);
                Swal.fire('สำเร็จ', 'บันทึกใบสมัครเรียบร้อย', 'success');
            }
        });
    };

    // --- IMPORT EXCEL LOGIC ---
    const handleImportExcel = async () => {
        const { value: file } = await Swal.fire({
            title: 'นำเข้าข้อมูล Excel',
            text: 'กรุณาเลือกไฟล์ Excel (.xlsx, .xls)',
            input: 'file',
            inputAttributes: {
                'accept': '.xlsx, .xls',
                'aria-label': 'Upload your Excel file'
            },
            showCancelButton: true,
            confirmButtonText: 'อัปโหลด',
            cancelButtonText: 'ยกเลิก'
        });

        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(sheet);
                    
                    // Basic mapping - assumes columns like "Name", "Position", "Phone", "Salary"
                    const newApps = json.map((row: any) => ({
                        id: Date.now() + Math.random(),
                        fullName: row['Name'] || row['ชื่อ-นามสกุล'] || row['ชื่อ'] || 'Unknown',
                        position: row['Position'] || row['ตำแหน่ง'] || 'Staff',
                        phoneNumber: row['Phone'] || row['เบอร์โทร'] || row['เบอร์โทรศัพท์'] || '',
                        expectedSalary: Number(row['Salary'] || row['เงินเดือน'] || row['เงินเดือนที่ขอ'] || 0),
                        status: 'pending',
                        applicationDate: Date.now()
                    }));

                    if (newApps.length > 0) {
                        setJobApplications(prev => [...prev, ...newApps] as JobApplication[]);
                        Swal.fire('สำเร็จ', `นำเข้าข้อมูล ${newApps.length} รายการเรียบร้อย`, 'success');
                    } else {
                        Swal.fire('ไม่พบข้อมูล', 'ไม่พบข้อมูลในไฟล์ Excel หรือรูปแบบไม่ถูกต้อง', 'warning');
                    }
                } catch (error) {
                    console.error("Excel Import Error:", error);
                    Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการอ่านไฟล์', 'error');
                }
            };
            reader.readAsBinaryString(file);
        }
    };

    // --- CONTRACT LOGIC ---
    const handleCreateContract = () => {
        // Filter approved/hired applications to suggest
        const approvedApps = jobApplications.filter(app => app.status === 'approved' || app.status === 'hired');
        const options = approvedApps.map(app => `<option value="${app.id}" data-pos="${app.position}" data-salary="${app.expectedSalary}">${app.fullName}</option>`).join('');

        Swal.fire({
            title: 'สร้างสัญญาจ้าง',
            html: `
                <div class="text-left mb-2 text-sm text-gray-600">เลือกพนักงานจากใบสมัคร (ที่ผ่านการอนุมัติ):</div>
                <select id="swal-emp-select" class="swal2-input mb-3">
                    <option value="">-- เลือกพนักงาน --</option>
                    ${options}
                    <option value="manual">-- ระบุเอง --</option>
                </select>
                <input id="swal-emp-name" class="swal2-input" placeholder="ชื่อพนักงาน" style="display:none;">
                <input id="swal-emp-pos" class="swal2-input" placeholder="ตำแหน่ง">
                <input id="swal-emp-salary" type="number" class="swal2-input" placeholder="เงินเดือน">
                <select id="swal-contract-type" class="swal2-input">
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="temporary">ชั่วคราว</option>
                </select>
            `,
            didOpen: () => {
                const select = document.getElementById('swal-emp-select') as HTMLSelectElement;
                const nameInput = document.getElementById('swal-emp-name') as HTMLInputElement;
                const posInput = document.getElementById('swal-emp-pos') as HTMLInputElement;
                const salaryInput = document.getElementById('swal-emp-salary') as HTMLInputElement;

                select.addEventListener('change', () => {
                    const val = select.value;
                    if (val === 'manual') {
                        nameInput.style.display = 'block';
                        nameInput.value = '';
                        posInput.value = '';
                        salaryInput.value = '';
                        nameInput.focus();
                    } else if (val) {
                        nameInput.style.display = 'none';
                        const option = select.options[select.selectedIndex];
                        nameInput.value = option.text;
                        posInput.value = option.getAttribute('data-pos') || '';
                        salaryInput.value = option.getAttribute('data-salary') || '';
                    } else {
                        nameInput.style.display = 'none';
                        nameInput.value = '';
                        posInput.value = '';
                        salaryInput.value = '';
                    }
                });
            },
            preConfirm: () => {
                const select = document.getElementById('swal-emp-select') as HTMLSelectElement;
                const nameInput = document.getElementById('swal-emp-name') as HTMLInputElement;
                
                let finalName = nameInput.value;
                if (select.value && select.value !== 'manual') {
                     finalName = select.options[select.selectedIndex].text;
                }

                if (!finalName) {
                    Swal.showValidationMessage('กรุณาระบุชื่อพนักงาน');
                    return false;
                }

                return {
                    employeeName: finalName,
                    position: (document.getElementById('swal-emp-pos') as HTMLInputElement).value,
                    salary: Number((document.getElementById('swal-emp-salary') as HTMLInputElement).value),
                    contractType: (document.getElementById('swal-contract-type') as HTMLSelectElement).value as any
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const newContract: EmploymentContract = {
                    id: Date.now(),
                    ...result.value,
                    startDate: Date.now(),
                    content: `สัญญาจ้างงาน... (Generated Content)`,
                    createdDate: Date.now()
                };
                setEmploymentContracts(prev => [...prev, newContract]);
                Swal.fire('สำเร็จ', 'สร้างสัญญาจ้างเรียบร้อย', 'success');
            }
        });
    };

    // --- TIME ATTENDANCE LOGIC ---
    const handleClockIn = () => {
        Swal.fire({
            title: 'ลงเวลาเข้างาน',
            input: 'text',
            inputLabel: 'ชื่อพนักงาน',
            showCancelButton: true
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                const newRecord: TimeRecord = {
                    id: Date.now(),
                    employeeName: result.value,
                    date: new Date().setHours(0,0,0,0),
                    clockIn: Date.now(),
                    status: 'on-time'
                };
                setTimeRecords(prev => [...prev, newRecord]);
                Swal.fire('สำเร็จ', 'ลงเวลาเข้างานเรียบร้อย', 'success');
            }
        });
    };

    const handleClockOut = (record: TimeRecord) => {
        const updatedRecord = { ...record, clockOut: Date.now() };
        // Calculate hours
        const hours = (updatedRecord.clockOut - updatedRecord.clockIn) / (1000 * 60 * 60);
        updatedRecord.totalHours = parseFloat(hours.toFixed(2));
        
        setTimeRecords(prev => prev.map(r => r.id === record.id ? updatedRecord : r));
        Swal.fire('สำเร็จ', 'ลงเวลาออกงานเรียบร้อย', 'success');
    };

    // --- CONTRACT LOGIC ---
    const handleViewContract = (contract: EmploymentContract) => {
        Swal.fire({
            title: 'สัญญาจ้างงาน',
            html: `
                <div style="text-align: left;">
                    <p><strong>พนักงาน:</strong> ${contract.employeeName}</p>
                    <p><strong>ตำแหน่ง:</strong> ${contract.position}</p>
                    <p><strong>เงินเดือน:</strong> ${contract.salary.toLocaleString()} บาท</p>
                    <p><strong>วันที่เริ่มงาน:</strong> ${new Date(contract.startDate).toLocaleDateString('th-TH')}</p>
                    <hr style="margin: 10px 0;">
                    <p><strong>เนื้อหาสัญญา:</strong></p>
                    <p>ข้าพเจ้า ${contract.employeeName} ตกลงทำงานในตำแหน่ง ${contract.position}...</p>
                    <p>(นี่คือตัวอย่างสัญญาแบบย่อ 1 หน้า)</p>
                </div>
            `,
            width: '600px'
        });
    };


    // --- PAYROLL LOGIC ---
    const handleAddPayroll = () => {
        // Filter contracts to suggest employees
        const options = employmentContracts.map(c => `<option value="${c.id}" data-salary="${c.salary}" data-name="${c.employeeName}">${c.employeeName}</option>`).join('');

        Swal.fire({
            title: 'บันทึกเงินเดือน',
            html: `
                <div class="text-left mb-2 text-sm text-gray-600">เลือกพนักงาน (จากสัญญาจ้าง):</div>
                <select id="swal-pay-emp-select" class="swal2-input mb-3">
                    <option value="">-- เลือกพนักงาน --</option>
                    ${options}
                </select>
                <input id="swal-pay-date" type="date" class="swal2-input">
                <input id="swal-pay-base" type="number" class="swal2-input" placeholder="เงินเดือนพื้นฐาน">
                <div id="swal-pay-calc-info" class="text-left text-sm text-gray-500 mt-2 hidden"></div>
            `,
            didOpen: () => {
                 const select = document.getElementById('swal-pay-emp-select') as HTMLSelectElement;
                 const baseInput = document.getElementById('swal-pay-base') as HTMLInputElement;
                 const dateInput = document.getElementById('swal-pay-date') as HTMLInputElement;
                 const infoDiv = document.getElementById('swal-pay-calc-info') as HTMLDivElement;
                 
                 const calculateDeductions = () => {
                     const option = select.options[select.selectedIndex];
                     const salary = Number(option.getAttribute('data-salary'));
                     const empName = option.getAttribute('data-name');
                     const dateVal = dateInput.value;

                     if (salary && dateVal && empName) {
                         const payDate = new Date(dateVal);
                         // Find start and end of the week for the pay date
                         const startOfWeek = new Date(payDate);
                         startOfWeek.setDate(payDate.getDate() - payDate.getDay()); // Sunday
                         const endOfWeek = new Date(startOfWeek);
                         endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday

                         // Check for unpaid leave in this week
                         const unpaidLeaves = leaveRequests.filter(l => 
                             l.employeeName === empName && 
                             l.type === 'leave-without-pay' && 
                             l.status === 'approved'
                         );

                         let totalUnpaidDays = 0;
                         
                         unpaidLeaves.forEach(l => {
                             const leaveStart = new Date(l.startDate);
                             const leaveEnd = new Date(l.endDate);

                             // Check overlap with the pay week
                             if (leaveStart <= endOfWeek && leaveEnd >= startOfWeek) {
                                 const overlapStart = leaveStart < startOfWeek ? startOfWeek : leaveStart;
                                 const overlapEnd = leaveEnd > endOfWeek ? endOfWeek : leaveEnd;
                                 const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                                 const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
                                 totalUnpaidDays += diffDays;
                             }
                         });

                         if (totalUnpaidDays > 0) {
                             const dailyRate = salary / 24;
                             const weeklySalary = salary / 4;
                             const deduction = dailyRate * totalUnpaidDays;
                             const netPay = Math.max(0, weeklySalary - deduction); // Ensure not negative

                             infoDiv.innerHTML = `
                                 <p class="text-red-500 font-bold">พบการลาไม่รับเงินเดือน ${totalUnpaidDays} วัน (ในสัปดาห์นี้)</p>
                                 <p class="text-xs text-gray-500">สูตร: (เงินเดือน / 24) x วันลา</p>
                                 <p>ค่าจ้างรายวัน: ${dailyRate.toFixed(2)} บาท</p>
                                 <p>เงินเดือนรายสัปดาห์: ${weeklySalary.toFixed(2)} บาท</p>
                                 <p>หัก: ${totalUnpaidDays} วัน x ${dailyRate.toFixed(2)} = ${deduction.toFixed(2)} บาท</p>
                                 <p class="font-bold text-green-600 text-lg mt-1">ยอดจ่ายสุทธิ: ${netPay.toFixed(2)} บาท</p>
                             `;
                             infoDiv.classList.remove('hidden');
                             baseInput.value = netPay.toFixed(2);
                         } else {
                             infoDiv.classList.add('hidden');
                             baseInput.value = (salary / 4).toFixed(2);
                         }
                     } else if (salary) {
                         baseInput.value = (salary / 4).toFixed(2); // Default if date not selected yet
                     }
                 };

                 select.addEventListener('change', calculateDeductions);
                 dateInput.addEventListener('change', calculateDeductions);
            },
            preConfirm: () => {
                const select = document.getElementById('swal-pay-emp-select') as HTMLSelectElement;
                const employeeName = select.options[select.selectedIndex]?.text;
                const date = (document.getElementById('swal-pay-date') as HTMLInputElement).value;
                const baseSalary = Number((document.getElementById('swal-pay-base') as HTMLInputElement).value);

                if (!select.value) {
                    Swal.showValidationMessage('กรุณาเลือกพนักงาน');
                    return false;
                }
                if (!date) {
                    Swal.showValidationMessage('กรุณาเลือกวันที่');
                    return false;
                }

                return {
                    employeeName: employeeName,
                    month: date, // Storing full date in 'month' field to avoid type changes
                    baseSalary: baseSalary
                };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const val = result.value;
                const newPayroll: PayrollRecord = {
                    id: Date.now(),
                    employeeName: val.employeeName,
                    month: val.month,
                    baseSalary: val.baseSalary,
                    otHours: 0,
                    otRate: 0,
                    deductions: 0,
                    bonuses: 0,
                    totalNetSalary: val.baseSalary, // Simplified calculation
                    status: 'pending'
                };
                setPayrollRecords(prev => [...prev, newPayroll]);
                Swal.fire('สำเร็จ', 'บันทึกเงินเดือนเรียบร้อย', 'success');
            }
        });
    };

    return (
        <div className="bg-gray-900 min-h-screen text-white w-full">
            <div className="p-6">
                <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
                    <span className="text-blue-500">👥</span> จัดการบุคคล (HR Management)
                </h1>

            {/* Tabs */}
            <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
                {[
                    { id: 'application', label: '📄 ใบสมัครงาน' },
                    { id: 'contract', label: '📝 สัญญาจ้าง' },
                    { id: 'time', label: '⏰ บันทึกเวลา' },
                    { id: 'payroll', label: '💰 เงินเดือน' },
                    { id: 'leave', label: '✈️ การลา' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as HRTab)}
                        className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                            activeTab === tab.id 
                            ? 'bg-blue-600 text-white shadow-lg' 
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="bg-gray-800 rounded-xl p-6 shadow-xl border border-gray-700">
                
                {/* --- JOB APPLICATION TAB --- */}
                {activeTab === 'application' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">รายการใบสมัครงาน</h2>
                            <div className="flex gap-2">
                                {isEditMode && selectedItems.length > 0 && (
                                    <button onClick={handleDeleteSelected} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                        🗑️ ลบที่เลือก ({selectedItems.length})
                                    </button>
                                )}
                                <button onClick={handleAddApplication} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm">
                                    + เพิ่มใบสมัคร
                                </button>
                                <button onClick={handleImportExcel} className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                    📥 Import Excel
                                </button>
                                <button onClick={() => onOpenUserManager?.({})} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                    👤 เพิ่มผู้ใช้ใหม่
                                </button>
                                <button onClick={() => exportToExcel(jobApplications, 'Job_Applications')} className="bg-green-800 hover:bg-green-900 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                    📊 Export Excel
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-gray-300">
                                <thead className="bg-gray-700 text-gray-100 uppercase text-sm">
                                    <tr>
                                        {isEditMode && <th className="p-3 w-10"><input type="checkbox" onChange={(e) => { if(e.target.checked) setSelectedItems(jobApplications.map(j => j.id)); else setSelectedItems([]); }} checked={selectedItems.length === jobApplications.length && jobApplications.length > 0} /></th>}
                                        <th className="p-3">วันที่สมัคร</th>
                                        <th className="p-3">ชื่อ-นามสกุล</th>
                                        <th className="p-3">ตำแหน่ง</th>
                                        <th className="p-3">เงินเดือนที่ขอ</th>
                                        <th className="p-3">สถานะ</th>
                                        <th className="p-3">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {jobApplications.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 7 : 6} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        jobApplications.map(app => (
                                            <tr key={app.id} className="hover:bg-gray-700/50">
                                                {isEditMode && (
                                                    <td className="p-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedItems.includes(app.id)} 
                                                            onChange={() => toggleSelection(app.id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3">{new Date(app.applicationDate).toLocaleDateString('th-TH')}</td>
                                                <td className="p-3 font-medium text-white">{app.fullName}</td>
                                                <td className="p-3">{app.position}</td>
                                                <td className="p-3">{app.expectedSalary.toLocaleString()}</td>
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <select
                                                            value={app.status}
                                                            onChange={(e) => {
                                                                const newStatus = e.target.value as any;
                                                                setJobApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: newStatus } : a));
                                                                Swal.fire({
                                                                    toast: true,
                                                                    position: 'top-end',
                                                                    icon: 'success',
                                                                    title: 'อัปเดตสถานะแล้ว',
                                                                    showConfirmButton: false,
                                                                    timer: 1000
                                                                });
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        >
                                                            <option value="pending">รอพิจารณา</option>
                                                            <option value="approved">อนุมัติ</option>
                                                            <option value="rejected">ไม่อนุมัติ</option>
                                                        </select>
                                                    ) : (
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            (app.status === 'hired' || app.status === 'approved') ? 'bg-green-900 text-green-300' :
                                                            app.status === 'rejected' ? 'bg-red-900 text-red-300' :
                                                            'bg-yellow-900 text-yellow-300'
                                                        }`}>
                                                            {app.status === 'hired' ? 'รับเข้าทำงาน' : app.status === 'approved' ? 'อนุมัติ' : app.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 flex gap-2">
                                                    <button onClick={() => handleCreateUserFromApp(app)} className="text-blue-400 hover:text-blue-300 text-xs border border-blue-500 px-2 py-1 rounded">
                                                        สร้าง User
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- CONTRACT TAB --- */}
                {activeTab === 'contract' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">สัญญาจ้างงาน</h2>
                            <div className="flex gap-2">
                                {isEditMode && selectedItems.length > 0 && (
                                    <button onClick={handleDeleteSelected} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                        🗑️ ลบที่เลือก ({selectedItems.length})
                                    </button>
                                )}
                                <button onClick={handleCreateContract} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm">
                                    + สร้างสัญญา
                                </button>
                                <button onClick={() => exportToExcel(employmentContracts, 'Contracts')} className="bg-green-800 hover:bg-green-900 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                    📊 Export Excel
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-gray-300">
                                <thead className="bg-gray-700 text-gray-100 uppercase text-sm">
                                    <tr>
                                        {isEditMode && <th className="p-3 w-10"><input type="checkbox" onChange={(e) => { if(e.target.checked) setSelectedItems(employmentContracts.map(c => c.id)); else setSelectedItems([]); }} checked={selectedItems.length === employmentContracts.length && employmentContracts.length > 0} /></th>}
                                        <th className="p-3">วันที่เริ่มงาน</th>
                                        <th className="p-3">พนักงาน</th>
                                        <th className="p-3">ตำแหน่ง</th>
                                        <th className="p-3">ประเภท</th>
                                        <th className="p-3">เงินเดือน</th>
                                        <th className="p-3">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {employmentContracts.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 7 : 6} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        employmentContracts.map(c => (
                                            <tr key={c.id} className="hover:bg-gray-700/50">
                                                {isEditMode && (
                                                    <td className="p-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedItems.includes(c.id)} 
                                                            onChange={() => toggleSelection(c.id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3">{new Date(c.startDate).toLocaleDateString('th-TH')}</td>
                                                <td className="p-3 font-medium text-white">{c.employeeName}</td>
                                                <td className="p-3">{c.position}</td>
                                                <td className="p-3">{c.contractType}</td>
                                                <td className="p-3">{c.salary.toLocaleString()}</td>
                                                <td className="p-3">
                                                    <button 
                                                        onClick={() => handleViewContract(c)}
                                                        className="text-blue-400 hover:text-blue-300 text-sm underline"
                                                    >
                                                        ดูสัญญา
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- TIME ATTENDANCE TAB --- */}
                {activeTab === 'time' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">บันทึกเวลาเข้า-ออกงาน</h2>
                            <div className="flex gap-2">
                                {isEditMode && selectedItems.length > 0 && (
                                    <button onClick={handleDeleteSelected} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                        🗑️ ลบที่เลือก ({selectedItems.length})
                                    </button>
                                )}
                                <button onClick={handleClockIn} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm">
                                    🕒 ลงเวลาเข้างาน
                                </button>
                                <button onClick={() => exportToExcel(timeRecords, 'Time_Attendance')} className="bg-green-800 hover:bg-green-900 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                    📊 Export Excel
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-gray-300">
                                <thead className="bg-gray-700 text-gray-100 uppercase text-sm">
                                    <tr>
                                        {isEditMode && <th className="p-3 w-10"><input type="checkbox" onChange={(e) => { if(e.target.checked) setSelectedItems(timeRecords.map(t => t.id)); else setSelectedItems([]); }} checked={selectedItems.length === timeRecords.length && timeRecords.length > 0} /></th>}
                                        <th className="p-3">วันที่</th>
                                        <th className="p-3">พนักงาน</th>
                                        <th className="p-3">เวลาเข้า</th>
                                        <th className="p-3">เวลาออก</th>
                                        <th className="p-3">สถานะ</th>
                                        <th className="p-3">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {timeRecords.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 7 : 6} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        timeRecords.map(t => (
                                            <tr key={t.id} className="hover:bg-gray-700/50">
                                                {isEditMode && (
                                                    <td className="p-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedItems.includes(t.id)} 
                                                            onChange={() => toggleSelection(t.id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3">{new Date(t.date).toLocaleDateString('th-TH')}</td>
                                                <td className="p-3 font-medium text-white">{t.employeeName}</td>
                                                <td className="p-3">{new Date(t.clockIn).toLocaleTimeString('th-TH')}</td>
                                                <td className="p-3">{t.clockOut ? new Date(t.clockOut).toLocaleTimeString('th-TH') : '-'}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-xs ${
                                                        t.status === 'late' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'
                                                    }`}>
                                                        {t.status}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {!t.clockOut && (
                                                        <button 
                                                            onClick={() => handleClockOut(t)}
                                                            className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded"
                                                        >
                                                            ลงเวลาออก
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- PAYROLL TAB --- */}
                {activeTab === 'payroll' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">ข้อมูลเงินเดือน</h2>
                            <div className="flex gap-2">
                                {isEditMode && selectedItems.length > 0 && (
                                    <button onClick={handleDeleteSelected} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                        🗑️ ลบที่เลือก ({selectedItems.length})
                                    </button>
                                )}
                                <button onClick={handleAddPayroll} className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm text-black font-medium">
                                    💰 บันทึกเงินเดือน
                                </button>
                                <button onClick={() => exportToExcel(payrollRecords, 'Payroll')} className="bg-green-800 hover:bg-green-900 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                    📊 Export Excel
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-gray-300">
                                <thead className="bg-gray-700 text-gray-100 uppercase text-sm">
                                    <tr>
                                        {isEditMode && <th className="p-3 w-10"><input type="checkbox" onChange={(e) => { if(e.target.checked) setSelectedItems(payrollRecords.map(p => p.id)); else setSelectedItems([]); }} checked={selectedItems.length === payrollRecords.length && payrollRecords.length > 0} /></th>}
                                        <th className="p-3">วันที่จ่าย</th>
                                        <th className="p-3">พนักงาน</th>
                                        <th className="p-3">เงินเดือนฐาน</th>
                                        <th className="p-3">สุทธิ</th>
                                        <th className="p-3">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {payrollRecords.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 6 : 5} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        payrollRecords.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-700/50">
                                                {isEditMode && (
                                                    <td className="p-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedItems.includes(p.id)} 
                                                            onChange={() => toggleSelection(p.id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3">{new Date(p.month).toLocaleDateString('th-TH')}</td>
                                                <td className="p-3 font-medium text-white">{p.employeeName}</td>
                                                <td className="p-3">{p.baseSalary.toLocaleString()}</td>
                                                <td className="p-3 font-bold text-green-400">{p.totalNetSalary.toLocaleString()}</td>
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <select
                                                            value={p.status}
                                                            onChange={(e) => {
                                                                const newStatus = e.target.value as any;
                                                                setPayrollRecords(prev => prev.map(item => item.id === p.id ? { ...item, status: newStatus } : item));
                                                                Swal.fire({
                                                                    toast: true,
                                                                    position: 'top-end',
                                                                    icon: 'success',
                                                                    title: 'อัปเดตสถานะแล้ว',
                                                                    showConfirmButton: false,
                                                                    timer: 1000
                                                                });
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        >
                                                            <option value="pending">รอดำเนินการ</option>
                                                            <option value="paid">จ่ายแล้ว</option>
                                                        </select>
                                                    ) : (
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            p.status === 'paid' ? 'bg-green-900 text-green-300' : 'bg-gray-600 text-gray-300'
                                                        }`}>
                                                            {p.status === 'paid' ? 'จ่ายแล้ว' : 'รอดำเนินการ'}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- LEAVE TAB --- */}
                {activeTab === 'leave' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold">ประวัติการลา</h2>
                            <div className="flex gap-2">
                                {isEditMode && selectedItems.length > 0 && (
                                    <button onClick={handleDeleteSelected} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                        🗑️ ลบที่เลือก ({selectedItems.length})
                                    </button>
                                )}
                                <button onClick={() => exportToExcel(leaveRequests, 'Leave_Requests')} className="bg-green-800 hover:bg-green-900 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                                    📊 Export Excel
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-gray-300">
                                <thead className="bg-gray-700 text-gray-100 uppercase text-sm">
                                    <tr>
                                        {isEditMode && <th className="p-3 w-10"><input type="checkbox" onChange={(e) => { if(e.target.checked) setSelectedItems(leaveRequests.map(l => l.id)); else setSelectedItems([]); }} checked={selectedItems.length === leaveRequests.length && leaveRequests.length > 0} /></th>}
                                        <th className="p-3">วันที่ลา</th>
                                        <th className="p-3">พนักงาน</th>
                                        <th className="p-3">ประเภท</th>
                                        <th className="p-3">เหตุผล</th>
                                        <th className="p-3">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {leaveRequests.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 6 : 5} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        leaveRequests.map(l => (
                                            <tr key={l.id} className="hover:bg-gray-700/50">
                                                {isEditMode && (
                                                    <td className="p-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedItems.includes(l.id)} 
                                                            onChange={() => toggleSelection(l.id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3">
                                                    {new Date(l.startDate).toLocaleDateString('th-TH')} - {new Date(l.endDate).toLocaleDateString('th-TH')}
                                                </td>
                                                <td className="p-3 font-medium text-white">{l.username}</td>
                                                <td className="p-3">{l.type}</td>
                                                <td className="p-3">{l.reason}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-xs ${
                                                        l.status === 'approved' ? 'bg-green-900 text-green-300' :
                                                        l.status === 'rejected' ? 'bg-red-900 text-red-300' :
                                                        'bg-yellow-900 text-yellow-300'
                                                    }`}>
                                                        {l.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>
        </div>
    </div>
    );
};

export default HRManagementView;
