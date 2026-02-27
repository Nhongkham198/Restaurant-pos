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
        users, setUsers, branchId,
        jobPositions, setJobPositions
    } = useData();

    const [activeTab, setActiveTab] = useState<HRTab>(initialTab);
    
    const handleManagePositions = () => {
        const positionList = jobPositions.map(p => `<li>${p} <button class='swal-delete-pos' data-pos='${p}'>🗑️</button></li>`).join('');
        Swal.fire({
            title: 'จัดการตำแหน่ง',
            html: `
                <input id='swal-new-pos' class='swal2-input' placeholder='เพิ่มตำแหน่งใหม่'>
                <button id='swal-add-pos' class='swal2-confirm swal2-styled'>เพิ่ม</button>
                <ul class='text-left mt-4'>${positionList}</ul>
            `,
            didOpen: () => {
                document.getElementById('swal-add-pos')?.addEventListener('click', () => {
                    const newPos = (document.getElementById('swal-new-pos') as HTMLInputElement).value;
                    if (newPos && !jobPositions.includes(newPos)) {
                        setJobPositions(prev => [...prev, newPos]);
                        Swal.close();
                        handleManagePositions(); // Re-open to show updated list
                    }
                });
                document.querySelectorAll('.swal-delete-pos').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const posToDelete = (e.currentTarget as HTMLElement).dataset.pos;
                        setJobPositions(prev => prev.filter(p => p !== posToDelete));
                        Swal.close();
                        handleManagePositions(); // Re-open to show updated list
                    });
                });
            },
            showConfirmButton: false
        });
    };

    // Sync activeTab with initialTab if it changes
    React.useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const [selectedItems, setSelectedItems] = useState<number[]>([]);

    const handleOpenLeaveQuotaModal = () => {
        const employeeOptions = users
            .filter(u => u.role === 'staff' || u.role === 'kitchen' || u.role === 'branch-admin')
            .map(u => `<option value="${u.id}">${u.username}</option>`)
            .join('');

        Swal.fire({
            title: 'ตั้งค่าโควต้าวันลา',
            html: `
                <select id="swal-employee-select" class="swal2-input">${employeeOptions}</select>
                <input id="swal-sick-days" type="number" class="swal2-input" placeholder="วันลาป่วย">
                <input id="swal-personal-days" type="number" class="swal2-input" placeholder="วันลากิจ">
                <input id="swal-vacation-days" type="number" class="swal2-input" placeholder="วันลาพักร้อน">
            `,
            focusConfirm: false,
            preConfirm: () => {
                return {
                    userId: parseInt((document.getElementById('swal-employee-select') as HTMLSelectElement).value),
                    sick: parseInt((document.getElementById('swal-sick-days') as HTMLInputElement).value) || 0,
                    personal: parseInt((document.getElementById('swal-personal-days') as HTMLInputElement).value) || 0,
                    vacation: parseInt((document.getElementById('swal-vacation-days') as HTMLInputElement).value) || 0,
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const { userId, ...quotas } = result.value;
                setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, leaveQuotas: quotas } : u));
                Swal.fire('สำเร็จ', 'ตั้งค่าโควต้าวันลาเรียบร้อยแล้ว', 'success');
            }
        });
    };

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
        const unlinkedUsers = users.filter(u => {
            const isLinked = jobApplications.some(j => j.userId === u.id);
            return !isLinked || app.userId === u.id;
        });
        const userOptions = unlinkedUsers.map(u => `<option value="${u.id}" ${app.userId === u.id ? 'selected' : ''}>${u.username}</option>`).join('');

        const isLinked = !!app.userId;

        Swal.fire({
            title: 'สร้างหรือเชื่อมต่อผู้ใช้',
            html: `
                <p>คุณต้องการทำอะไรสำหรับ <strong>${app.fullName}</strong>?</p>
                <select id="swal-user-action" class="swal2-input">
                    <option value="create">สร้างผู้ใช้ใหม่</option>
                    <option value="link">เชื่อมต่อกับผู้ใช้ที่มีอยู่</option>
                    ${isLinked ? '<option value="unlink">ยกเลิกการเชื่อมต่อ</option>' : ''}
                </select>
                <select id="swal-existing-user" class="swal2-input" style="display:none;">
                    <option value="">-- เลือกผู้ใช้ --</option>
                    ${userOptions}
                </select>
            `,
            didOpen: () => {
                document.getElementById('swal-user-action')?.addEventListener('change', (e) => {
                    const select = e.target as HTMLSelectElement;
                    const existingUserSelect = document.getElementById('swal-existing-user') as HTMLSelectElement;
                    existingUserSelect.style.display = select.value === 'link' ? 'block' : 'none';
                });
            },
            preConfirm: () => {
                const action = (document.getElementById('swal-user-action') as HTMLSelectElement).value;
                const userId = (document.getElementById('swal-existing-user') as HTMLSelectElement).value;
                if (action === 'link' && !userId) {
                    Swal.showValidationMessage('กรุณาเลือกผู้ใช้');
                    return false;
                }
                return { action, userId: parseInt(userId) };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const { action, userId } = result.value;
                if (action === 'link') {
                    setJobApplications(prev => prev.map(j => j.id === app.id ? { ...j, userId: userId, status: 'hired' } : j));
                    Swal.fire('สำเร็จ', 'เชื่อมต่อผู้ใช้และอัปเดตสถานะเป็น \'รับเข้าทำงาน\' เรียบร้อย', 'success');
                } else if (action === 'unlink') {
                    setJobApplications(prev => prev.map(j => {
                        if (j.id === app.id) {
                            const { userId, ...rest } = j;
                            return { ...rest, status: 'approved' };
                        }
                        return j;
                    }));
                    Swal.fire('สำเร็จ', 'ยกเลิกการเชื่อมต่อผู้ใช้เรียบร้อย', 'success');
                } else { // action === 'create'
                    const newUserId = Date.now();
                    const tempPassword = `pass${String(newUserId).slice(-4)}`;
                    const newUsername = app.fullName.split(' ')[0].toLowerCase() + String(newUserId).slice(-2);

                    const newUser: User = {
                        id: newUserId,
                        username: newUsername,
                        password: tempPassword, // This should be handled more securely in a real app
                        role: 'staff',
                        leaveQuotas: { sick: 0, personal: 0, vacation: 0 }
                    };

                    const newContract: EmploymentContract = {
                        id: Date.now() + 1,
                        userId: newUserId,
                        employeeName: app.fullName,
                        position: app.position,
                        startDate: Date.now(),
                        salary: app.expectedSalary,
                        contractType: 'full-time',
                        content: `สัญญาจ้างงานสำหรับ ${app.fullName} (อัตโนมัติ)`,
                        createdDate: Date.now(),
                    };

                    setUsers(prev => [...prev, newUser]);
                    setEmploymentContracts(prev => [...prev, newContract]);
                    setJobApplications(prev => prev.map(j => j.id === app.id ? { ...j, userId: newUserId, status: 'hired' } : j));

                    Swal.fire({
                        icon: 'success',
                        title: 'สร้างผู้ใช้และสัญญาสำเร็จ',
                        html: `
                            <p>ผู้ใช้ใหม่ถูกสร้างขึ้นสำหรับ <strong>${app.fullName}</strong></p>
                            <p>Username: <strong>${newUsername}</strong></p>
                            <p>Temporary Password: <strong>${tempPassword}</strong></p>
                            <p>และได้สร้างสัญญาจ้างงานแล้ว</p>
                        `,
                    });
                }
            }
        });
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
                let applicationId = null;
                if (select.value && select.value !== 'manual') {
                     finalName = select.options[select.selectedIndex].text;
                     applicationId = parseInt(select.value);
                }

                if (!finalName) {
                    Swal.showValidationMessage('กรุณาระบุชื่อพนักงาน');
                    return false;
                }

                // Find the associated user
                let userId = 0;
                if (applicationId) {
                    const jobApp = jobApplications.find(app => app.id === applicationId);
                    if (jobApp && jobApp.userId) {
                        userId = jobApp.userId;
                    }
                }

                // Fallback: Try to find by name matching if manual entry or no userId in jobApp
                if (!userId && finalName) {
                     // Try to match first name with username
                     const firstName = finalName.split(' ')[0].trim().toLowerCase();
                     const user = users.find(u => u.username.toLowerCase() === firstName);
                     if (user) userId = user.id;
                }

                return {
                    userId: userId,
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
    const handleAddLeaveRequest = () => {
        const employeeOptions = users
            .filter(u => u.role !== 'admin' && u.role !== 'auditor') // Filter for employees
            .map(u => `<option value="${u.id}">${u.username}</option>`)
            .join('');

        Swal.fire({
            title: 'เพิ่มใบลา',
            html: `
                <select id="swal-leave-employee" class="swal2-input">${employeeOptions}</select>
                <div class="flex gap-2">
                    <input id="swal-leave-start" type="date" class="swal2-input">
                    <input id="swal-leave-end" type="date" class="swal2-input">
                </div>
                <select id="swal-leave-type" class="swal2-input">
                    <option value="sick">ลาป่วย</option>
                    <option value="personal">ลากิจ</option>
                    <option value="vacation">ลาพักร้อน</option>
                    <option value="leave-without-pay">ลาไม่รับเงินเดือน</option>
                    <option value="other">อื่นๆ</option>
                </select>
                <textarea id="swal-leave-reason" class="swal2-textarea" placeholder="เหตุผลการลา"></textarea>
            `,
            focusConfirm: false,
            preConfirm: () => {
                const userId = parseInt((document.getElementById('swal-leave-employee') as HTMLSelectElement).value);
                const user = users.find(u => u.id === userId);
                const startDate = (document.getElementById('swal-leave-start') as HTMLInputElement).value;
                const endDate = (document.getElementById('swal-leave-end') as HTMLInputElement).value;

                if (!userId || !startDate || !endDate) {
                    Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
                    return false;
                }

                return {
                    userId: userId,
                    employeeName: user?.username || `User #${userId}`, // Use username as the primary name for the request
                    username: user?.username || `User #${userId}`,
                    startDate: new Date(startDate).getTime(),
                    endDate: new Date(endDate).getTime(),
                    type: (document.getElementById('swal-leave-type') as HTMLSelectElement).value as any,
                    reason: (document.getElementById('swal-leave-reason') as HTMLTextAreaElement).value,
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const newLeaveRequest: LeaveRequest = {
                    id: Date.now(),
                    ...result.value,
                    branchId: branchId || 0,
                    status: 'pending',
                    submittedAt: Date.now(),
                };
                setLeaveRequests(prev => [...prev, newLeaveRequest]);
                Swal.fire('สำเร็จ', 'ส่งใบลาเรียบร้อยแล้ว', 'success');
            }
        });
    };

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


    const handleLeaveStatusChange = (leaveId: number, newStatus: 'pending' | 'approved' | 'rejected') => {
        const leaveRequest = leaveRequests.find(lr => lr.id === leaveId);
        if (!leaveRequest) return;

        const updatedLeaveRequests = leaveRequests.map(lr => 
            lr.id === leaveId ? { ...lr, status: newStatus } : lr
        );
        setLeaveRequests(updatedLeaveRequests);

        let isLeaveWithoutPayApproved = false;

        if (newStatus === 'approved' && leaveRequest.type === 'leave-without-pay') {
            const employee = users.find(u => u.id === leaveRequest.userId);
            const contract = employmentContracts.find(c => c.userId === leaveRequest.userId);

            if (employee && contract) {
                isLeaveWithoutPayApproved = true;
                const lastPayroll = payrollRecords
                    .filter(pr => pr.employeeName === leaveRequest.employeeName)
                    .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime())[0];

                const nextPayday = lastPayroll ? new Date(new Date(lastPayroll.month).getTime() + 7 * 24 * 60 * 60 * 1000) : new Date();
                
                const leaveDuration = (new Date(leaveRequest.endDate).getTime() - new Date(leaveRequest.startDate).getTime()) / (1000 * 3600 * 24) + 1;
                const deductionAmount = (contract.salary / 24) * leaveDuration;

                Swal.fire({
                    title: 'แจ้งเตือนหักเงินเดือน',
                    html: `
                        <p>พนักงาน: <strong>${leaveRequest.employeeName}</strong></p>
                        <p>มีการลาแบบไม่รับเงินเดือนจำนวน <strong>${leaveDuration}</strong> วัน</p>
                        <p>ต้องหักเงิน: <strong>${deductionAmount.toFixed(2)}</strong> บาท</p>
                        <p>ในรอบบิลถัดไปวันที่: <strong>${nextPayday.toLocaleDateString('th-TH')}</strong></p>
                    `,
                    icon: 'warning',
                });
            }
        }

        if (!isLeaveWithoutPayApproved) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'อัปเดตสถานะแล้ว',
                showConfirmButton: false,
                timer: 1500
            });
        }
    };

    // --- PAYROLL LOGIC ---
    const handleAddPayroll = () => {
        // Filter contracts to suggest employees
        const options = employmentContracts.map(c => `<option value="${c.id}" data-salary="${c.salary}" data-name="${c.employeeName}" data-userid="${c.userId || ''}">${c.employeeName}</option>`).join('');

        Swal.fire({
            title: 'บันทึกเงินเดือน',
            html: `
                <div class="text-left mb-2 text-sm text-gray-600">เลือกพนักงาน (จากสัญญาจ้าง):</div>
                <div class="flex gap-2 mb-3">
                    <select id="swal-pay-emp-select" class="swal2-input m-0 flex-grow">
                        <option value="">-- เลือกพนักงาน --</option>
                        ${options}
                    </select>
                    <input id="swal-pay-username" class="swal2-input m-0 w-1/3 bg-gray-100" placeholder="User" readonly>
                </div>
                <div class="flex gap-2 mb-3">
                    <input id="swal-pay-slip" class="swal2-input m-0 flex-grow" placeholder="ลิงก์รูปภาพสลิป (URL)">
                    <input id="swal-pay-date" type="date" class="swal2-input m-0 w-1/3" placeholder="เลือกวันที่จ่าย">
                </div>
                <input id="swal-pay-base" type="text" class="swal2-input" placeholder="ยอดจ่ายสุทธิ" readonly>
                <div id="swal-pay-calc-info" class="text-left text-sm text-gray-500 mt-2 p-3 bg-gray-700 rounded-lg hidden"></div>
            `,
            didOpen: () => {
                 const select = document.getElementById('swal-pay-emp-select') as HTMLSelectElement;
                 const usernameInput = document.getElementById('swal-pay-username') as HTMLInputElement;
                 const baseInput = document.getElementById('swal-pay-base') as HTMLInputElement;
                 const dateInput = document.getElementById('swal-pay-date') as HTMLInputElement;
                 const infoDiv = document.getElementById('swal-pay-calc-info') as HTMLDivElement;
                 
                 const formatNumber = (num: number) => {
                     return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                 };

                 const calculateDeductions = () => {
                     const option = select.options[select.selectedIndex];
                     const salary = Number(option.getAttribute('data-salary'));
                     let userId = Number(option.getAttribute('data-userid'));
                     const empName = option.getAttribute('data-name');
                     const dateVal = dateInput.value; // YYYY-MM-DD

                     // Fallback: If userId is missing, try to find it via JobApplication
                     if (!userId && empName) {
                         const normalizedEmpName = empName.trim();
                         const jobApp = jobApplications.find(j => j.fullName.trim() === normalizedEmpName && j.userId);
                         if (jobApp) userId = jobApp.userId!;
                     }

                     // Update Username Field
                     if (userId) {
                         const user = users.find(u => u.id === userId);
                         usernameInput.value = user ? user.username : `User ID: ${userId} (Not Found)`;
                     } else {
                         usernameInput.value = '';
                     }

                     if (salary && dateVal && userId) {
                         const payDate = new Date(dateVal);
                         
                         // Define Ranges
                         // Backward: 10 days before payDate (inclusive start, exclusive end of payDate to avoid double count)
                         const backStart = new Date(payDate);
                         backStart.setDate(payDate.getDate() - 10);
                         const backEnd = new Date(payDate); // Up to payDate (exclusive in logic below)

                         // Forward: 10 days from payDate (inclusive start)
                         const forwardStart = new Date(payDate);
                         const forwardEnd = new Date(payDate);
                         forwardEnd.setDate(payDate.getDate() + 10);

                         // Get all approved unpaid leaves for this user
                         const unpaidLeaves = leaveRequests.filter(l => 
                             l.userId === userId && 
                             l.type === 'leave-without-pay' && 
                             l.status === 'approved'
                         );

                         let retroactiveDays = 0;
                         let currentDays = 0;
                         const retroactiveLeavesList: LeaveRequest[] = [];
                         const currentLeavesList: LeaveRequest[] = [];

                         unpaidLeaves.forEach(l => {
                             const leaveStart = new Date(l.startDate);
                             const leaveEnd = new Date(l.endDate);

                             // 1. Check Retroactive Overlap [backStart, payDate)
                             // We check if any part of the leave falls in the backward window
                             // Logic: Leave overlaps if leaveStart < backEnd && leaveEnd >= backStart
                             // But we only count days strictly within the window and BEFORE payDate
                             if (leaveStart < backEnd && leaveEnd >= backStart) {
                                 // Calculate intersection
                                 const overlapStart = leaveStart < backStart ? backStart : leaveStart;
                                 const overlapEnd = leaveEnd >= backEnd ? new Date(backEnd.getTime() - 1) : leaveEnd; // Limit to just before payDate
                                 
                                 // Ensure valid range
                                 if (overlapStart <= overlapEnd) {
                                     const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                                     const days = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
                                     retroactiveDays += days;
                                     if (!retroactiveLeavesList.includes(l)) retroactiveLeavesList.push(l);
                                 }
                             }

                             // 2. Check Forward Overlap [payDate, forwardEnd]
                             if (leaveStart <= forwardEnd && leaveEnd >= forwardStart) {
                                 const overlapStart = leaveStart < forwardStart ? forwardStart : leaveStart;
                                 const overlapEnd = leaveEnd > forwardEnd ? forwardEnd : leaveEnd;
                                 
                                 if (overlapStart <= overlapEnd) {
                                     const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                                     const days = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
                                     currentDays += days;
                                     if (!currentLeavesList.includes(l)) currentLeavesList.push(l);
                                 }
                             }
                         });

                         const dailyRate = salary / 26; // Rule: Salary / 26
                         const weeklySalary = salary / 4; // Rule: Salary / 4
                         
                         const retroactiveDeduction = dailyRate * retroactiveDays;
                         const currentDeduction = dailyRate * currentDays;
                         const totalDeduction = retroactiveDeduction + currentDeduction;
                         
                         const netPay = Math.max(0, weeklySalary - totalDeduction);

                         let htmlContent = '';

                         // Retroactive Info
                         if (retroactiveDays > 0) {
                             htmlContent += `
                                 <div class="mb-2 p-2 bg-red-900/30 rounded border border-red-500/50">
                                     <p class="text-red-400 font-bold text-sm">⚠️ พบการลาย้อนหลัง ${retroactiveDays} วัน</p>
                                     <p class="text-xs text-gray-400">ช่วงเวลา: ${backStart.toLocaleDateString('th-TH')} - ${backEnd.toLocaleDateString('th-TH')}</p>
                                     <ul class="text-xs text-gray-300 list-disc pl-4 mt-1">
                                         ${retroactiveLeavesList.map(l => `<li>${new Date(l.startDate).toLocaleDateString('th-TH')} (${l.reason})</li>`).join('')}
                                     </ul>
                                     <p class="text-sm font-bold text-red-300 mt-1">หักย้อนหลัง: ${retroactiveDeduction.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                                 </div>
                             `;
                         }

                         // Current Period Info
                         if (currentDays > 0) {
                             htmlContent += `
                                 <div class="mb-2">
                                     <p class="text-red-500 font-bold">พบการลาในรอบปัจจุบัน ${currentDays} วัน</p>
                                     <p class="text-xs text-gray-400">ช่วงเวลา: ${forwardStart.toLocaleDateString('th-TH')} - ${forwardEnd.toLocaleDateString('th-TH')}</p>
                                     <p>หัก (รอบนี้): ${currentDays} วัน x ${dailyRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = ${currentDeduction.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                                 </div>
                             `;
                         } else {
                             htmlContent += `
                                <div class="mb-2">
                                    <p class="text-green-500">ไม่พบการลาในรอบปัจจุบัน (10 วันข้างหน้า)</p>
                                    <p class="text-xs text-gray-400">ช่วงเวลา: ${forwardStart.toLocaleDateString('th-TH')} - ${forwardEnd.toLocaleDateString('th-TH')}</p>
                                </div>
                             `;
                         }

                         htmlContent += `<hr class="my-2 border-gray-600">`;

                         // Summary
                         htmlContent += `
                             <p class="mt-2">เงินเดือนรายสัปดาห์ (หาร 4): ${weeklySalary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                             ${totalDeduction > 0 ? `<p class="text-red-400">รวมหักทั้งหมด: -${totalDeduction.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>` : ''}
                             <p class="font-bold text-green-500 text-lg mt-1">ยอดจ่ายสุทธิ: ${netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                         `;

                         infoDiv.innerHTML = htmlContent;
                         infoDiv.classList.remove('hidden');
                         
                         baseInput.value = formatNumber(netPay);
                     } else if (salary) {
                         baseInput.value = formatNumber(salary / 4); // Default to weekly salary
                         infoDiv.classList.add('hidden');
                     }
                 };

                 select.addEventListener('change', calculateDeductions);
                 dateInput.addEventListener('change', calculateDeductions);
                 
                 select.addEventListener('change', () => {
                    const option = select.options[select.selectedIndex];
                    const salary = Number(option.getAttribute('data-salary'));
                    if (salary) {
                        const baseInput = document.getElementById('swal-pay-base') as HTMLInputElement;
                        baseInput.value = formatNumber(salary); // This might be overwritten by calculateDeductions if date is present
                        if ((document.getElementById('swal-pay-date') as HTMLInputElement).value) {
                            calculateDeductions();
                        }
                    }
                 });
            },
            preConfirm: () => {
                const select = document.getElementById('swal-pay-emp-select') as HTMLSelectElement;
                const employeeName = select.options[select.selectedIndex]?.text;
                const date = (document.getElementById('swal-pay-date') as HTMLInputElement).value;
                const netSalaryStr = (document.getElementById('swal-pay-base') as HTMLInputElement).value;
                const netSalary = Number(netSalaryStr.replace(/,/g, '')); // Remove commas
                const slipUrl = (document.getElementById('swal-pay-slip') as HTMLInputElement).value;
                const contractId = Number(select.value);
                const contract = employmentContracts.find(c => c.id === contractId);
                const baseSalary = contract ? contract.salary : 0;
                const deductions = baseSalary - netSalary;

                if (!select.value || !date) {
                    Swal.showValidationMessage('กรุณาเลือกพนักงานและเดือน');
                    return false;
                }

                // Check for duplicate payment date
                const isDuplicate = payrollRecords.some(r => r.employeeName === employeeName && r.month === date);
                if (isDuplicate) {
                    // Find latest payment date for this employee
                    const employeeRecords = payrollRecords.filter(r => r.employeeName === employeeName);
                    // Sort descending by date
                    employeeRecords.sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());
                    const latestRecord = employeeRecords[0];
                    
                    let nextDateStr = '';
                    if (latestRecord) {
                        const latestDate = new Date(latestRecord.month);
                        const nextDate = new Date(latestDate);
                        nextDate.setDate(latestDate.getDate() + 8);
                        
                        // Format date as DD/MM/YYYY
                        const day = nextDate.getDate().toString().padStart(2, '0');
                        const month = (nextDate.getMonth() + 1).toString().padStart(2, '0');
                        const year = nextDate.getFullYear() + 543; // Buddhist Era
                        nextDateStr = `${day}/${month}/${year}`;
                    }

                    Swal.showValidationMessage(`วันที่นี้ได้ถูกจ่ายเงินแล้ว วันที่ควรจ่ายถัดไปคือ ${nextDateStr}`);
                    return false;
                }

                return {
                    employeeName: employeeName,
                    month: date,
                    baseSalary: baseSalary,
                    deductions: deductions > 0 ? deductions : 0,
                    totalNetSalary: netSalary,
                    slipUrl: slipUrl
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
                    deductions: val.deductions,
                    bonuses: 0,
                    totalNetSalary: val.totalNetSalary,
                    status: 'pending',
                    slipUrl: val.slipUrl
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
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <input 
                                                            type="date" 
                                                            value={new Date(app.applicationDate).toISOString().split('T')[0]} 
                                                            onChange={(e) => {
                                                                const newDate = new Date(e.target.value).getTime();
                                                                setJobApplications(prev => prev.map(a => 
                                                                    a.id === app.id ? { ...a, applicationDate: newDate } : a
                                                                ));
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        />
                                                    ) : (
                                                        new Date(app.applicationDate).toLocaleDateString('th-TH')
                                                    )}
                                                </td>
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
                                                <td className="p-3 flex gap-2 items-center">
                                                    {(() => {
                                                        const linkedUser = users.find(u => u.id === app.userId) || 
                                                            users.find(u => employmentContracts.some(c => c.userId === u.id && c.employeeName === app.fullName));
                                                        
                                                        return linkedUser ? (
                                                            <>
                                                                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                                                                    👤 {linkedUser.username}
                                                                </span>
                                                                <button onClick={() => handleCreateUserFromApp(app)} className="text-yellow-400 hover:text-yellow-300 text-xs">
                                                                    เปลี่ยน
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button onClick={() => handleCreateUserFromApp(app)} className="text-blue-400 hover:text-blue-300 text-xs border border-blue-500 px-2 py-1 rounded">
                                                                สร้าง User
                                                            </button>
                                                        );
                                                    })()}
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
                                <button onClick={handleManagePositions} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm">
                                    จัดการตำแหน่ง
                                </button>
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
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <input 
                                                            type="date" 
                                                            value={new Date(c.startDate).toISOString().split('T')[0]} 
                                                            onChange={(e) => {
                                                                const newDate = new Date(e.target.value).getTime();
                                                                setEmploymentContracts(prev => prev.map(contract => 
                                                                    contract.id === c.id ? { ...contract, startDate: newDate } : contract
                                                                ));
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        />
                                                    ) : (
                                                        new Date(c.startDate).toLocaleDateString('th-TH')
                                                    )}
                                                </td>
                                                <td className="p-3 font-medium text-white">{c.employeeName}</td>
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <select 
                                                            value={c.position}
                                                            onChange={(e) => {
                                                                const newPosition = e.target.value;
                                                                setEmploymentContracts(prev => prev.map(contract => 
                                                                    contract.id === c.id ? { ...contract, position: newPosition } : contract
                                                                ));
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        >
                                                            {jobPositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                                                        </select>
                                                    ) : (
                                                        c.position
                                                    )}
                                                </td>
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
                                        <th className="p-3">สลิปโอนเงิน</th>
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
                                                <td className="p-3">
                                                    {p.slipUrl ? (
                                                        <a href={p.slipUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                                            Link
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-500">-</span>
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
                                {isEditMode && (
                                    <button onClick={handleOpenLeaveQuotaModal} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm">
                                        ตั้งค่าวันลา
                                    </button>
                                )}
                                <button onClick={handleAddLeaveRequest} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm">
                                    + เพิ่มใบลา
                                </button>
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
                                        <th className="p-3">วันลาคงเหลือ</th>
                                        <th className="p-3">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {leaveRequests.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 7 : 6} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        leaveRequests.map(l => {
                                            // Try to find user by ID, or fallback to matching name via employment contract
                                            const user = users.find(u => u.id === l.userId) || 
                                                         users.find(u => employmentContracts.some(c => c.userId === u.id && c.employeeName === l.employeeName));
                                            
                                            const quotas = user?.leaveQuotas ?? { sick: 0, personal: 0, vacation: 0 };
                                            const usedDays = leaveRequests
                                                .filter(req => req.userId === l.userId && req.type === l.type && req.status === 'approved')
                                                .reduce((acc, req) => {
                                                    const start = new Date(req.startDate);
                                                    const end = new Date(req.endDate);
                                                    const diffTime = Math.abs(end.getTime() - start.getTime());
                                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                                                    return acc + diffDays;
                                                }, 0);
                                            const remainingDays = quotas[l.type as keyof typeof quotas] - usedDays;

                                            return (
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
                                                <td className="p-3 font-medium text-white">{user?.username || l.employeeName}</td>
                                                <td className="p-3">{l.type}</td>
                                                <td className="p-3">{l.reason}</td>
                                                <td className="p-3 font-semibold">{remainingDays > 0 ? remainingDays : 0} วัน</td>
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <select
                                                            value={l.status}
                                                            onChange={(e) => handleLeaveStatusChange(l.id, e.target.value as any)}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        >
                                                            <option value="pending">รออนุมัติ</option>
                                                            <option value="approved">อนุมัติ</option>
                                                            <option value="rejected">ไม่อนุมัติ</option>
                                                        </select>
                                                    ) : (
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            l.status === 'approved' ? 'bg-green-900 text-green-300' :
                                                            l.status === 'rejected' ? 'bg-red-900 text-red-300' :
                                                            'bg-yellow-900 text-yellow-300'
                                                        }`}>
                                                            {l.status}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )})
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
