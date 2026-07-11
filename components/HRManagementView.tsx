import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { JobApplication, EmploymentContract, TimeRecord, PayrollRecord, LeaveRequest, EmployeeGoal, GoalItem, PeerEvaluation } from '../types';
import { DEFAULT_JOB_APPLICATIONS, DEFAULT_EMPLOYMENT_CONTRACTS } from '../constants';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { Eye, EyeOff } from 'lucide-react';
import { useFirestoreSync } from '../hooks/useFirestoreSync';

type HRTab = 'application' | 'contract' | 'time' | 'payroll' | 'leave' | 'goal';

import { User } from '../types';

const findUserByEmployeeName = (empName: string, users: User[], jobApplications: JobApplication[]): User | undefined => {
    if (!empName) return undefined;
    const name = empName.trim();
    const nameNormalized = name.replace(/\s+/g, '').toLowerCase();

    // 1. Try to find an exact match or highly similar name in job applications
    const jobApp = jobApplications.find(j => {
        if (!j.fullName) return false;
        const jNameNormalized = j.fullName.trim().replace(/\s+/g, '').toLowerCase();
        
        // Exact normalized match
        if (jNameNormalized === nameNormalized) return true;
        
        // Partial matches for common variations
        if (nameNormalized.includes(jNameNormalized) || jNameNormalized.includes(nameNormalized)) return true;
        
        return false;
    });

    if (jobApp) {
        // If the job application has a userId, find that user
        if (jobApp.userId) {
            const user = users.find(u => u.id === jobApp.userId);
            if (user) return user;
        }
        // If not, try matching by nickname from the job application
        if (jobApp.nickname) {
            const nick = jobApp.nickname.trim().toLowerCase();
            const user = users.find(u => u.username.toLowerCase() === nick);
            if (user) return user;
        }
    }

    // 2. Direct name/username matching fallbacks for hardcoded safety
    if (name === 'พัชรัตน์ ดงรุ่ง') {
        return users.find(u => u.username === 'Pam');
    }
    if (name === 'กนกอร นาสินส่ง' || name === 'กนกร นา สินส่ง' || (name.includes('กนก') && name.includes('สินส่ง'))) {
        return users.find(u => u.username === 'Pea');
    }
    if (name === 'รัตนา ทวิบุตร') {
        return users.find(u => u.username === 'Tal');
    }
    if (name === 'วิชุดา ฆารประเดิม' || (name.includes('วิชุดา') && name.includes('ฆารประเดิม'))) {
        return users.find(u => u.username === 'Fah');
    }

    // 3. Last fallback: Try matching the first word of the name with a username
    const firstWord = name.split(/\s+/)[0].toLowerCase();
    const userByFirstWord = users.find(u => u.username.toLowerCase() === firstWord);
    if (userByFirstWord) return userByFirstWord;

    return undefined;
};

interface HRManagementViewProps {
    isEditMode?: boolean;
    onOpenUserManager?: (userData: Partial<User>) => void;
    initialTab?: HRTab;
}

const HRManagementView: React.FC<HRManagementViewProps> = ({ isEditMode = false, onOpenUserManager, initialTab = 'application' }) => {
    const { 
        jobApplications, jobApplicationsActions,
        employmentContracts, employmentContractsActions,
        timeRecords, setTimeRecords,
        payrollRecords, setPayrollRecords,
        leaveRequests, setLeaveRequests,
        users, setUsers, branchId,
        jobPositions, setJobPositions,
        currentUser, branches
    } = useData();

    const [employeeGoals, setEmployeeGoals] = useFirestoreSync<EmployeeGoal[]>(null, 'employeeGoals', []);

    const deduplicatedEmployeeGoals = useMemo(() => {
        const uniqueGoalsByUser: Record<string, EmployeeGoal> = {};
        employeeGoals.forEach(g => {
            const existing = uniqueGoalsByUser[g.userId];
            if (!existing) {
                uniqueGoalsByUser[g.userId] = g;
            } else {
                const statusPriority = (status: string) => {
                    if (status === 'completed') return 5;
                    if (status === 'pending_evaluation') return 4;
                    if (status === 'active') return 3;
                    if (status === 'pending_admin') return 2;
                    return 1; // draft
                };
                
                const pG = statusPriority(g.status);
                const pE = statusPriority(existing.status);
                
                if (pG > pE) {
                    uniqueGoalsByUser[g.userId] = g;
                } else if (pG === pE) {
                    if ((g.createdAt || 0) > (existing.createdAt || 0)) {
                        uniqueGoalsByUser[g.userId] = g;
                    }
                }
            }
        });
        return Object.values(uniqueGoalsByUser);
    }, [employeeGoals]);

    const visibleBranches = useMemo(() => {
        if (!currentUser) return [];
        if (currentUser.role === 'admin') return branches;
        const allowedIds = currentUser.allowedBranchIds || [];
        return branches.filter(b => allowedIds.includes(b.id));
    }, [branches, currentUser]);

    const [activeTab, setActiveTab] = useState<HRTab>(() => {
        const adminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'branch-admin';
        if (!adminOrManager) {
            return 'goal';
        }
        return initialTab;
    });

    useEffect(() => {
        const adminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'branch-admin';
        if (!adminOrManager) {
            if (activeTab !== 'goal') {
                setActiveTab('goal');
            }
        }
    }, [currentUser, activeTab]);

    // Goal Setting & Evaluation States
    const [draftGoalItems, setDraftGoalItems] = useState<GoalItem[]>([]);
    const [goalSelectedBranches, setGoalSelectedBranches] = useState<number[]>([]);
    const [evaluatingGoal, setEvaluatingGoal] = useState<EmployeeGoal | null>(null);
    const [evalScores, setEvalScores] = useState<Record<string, number>>({}); // item ID -> rating (1-10)
    const [adminGradingGoal, setAdminGradingGoal] = useState<EmployeeGoal | null>(null);
    const [adminFeedback, setAdminFeedback] = useState<string>('');
    const [adminSelectedGrade, setAdminSelectedGrade] = useState<'A' | 'B' | 'C' | 'D'>('C');
    const [viewingGoalDetails, setViewingGoalDetails] = useState<EmployeeGoal | null>(null);
    const [showEvalAlert, setShowEvalAlert] = useState(true);
    
    // States for admin editing employee goals under editMode
    const [adminEditingGoal, setAdminEditingGoal] = useState<EmployeeGoal | null>(null);
    const [adminEditItems, setAdminEditItems] = useState<GoalItem[]>([]);
    const [adminEditBranches, setAdminEditBranches] = useState<number[]>([]);
    const [adminEditStatus, setAdminEditStatus] = useState<EmployeeGoal['status']>('draft');
    
    // Payroll Sorting State
    const [payrollSortConfig, setPayrollSortConfig] = useState<{ key: keyof PayrollRecord; direction: 'asc' | 'desc' } | null>({ key: 'month', direction: 'desc' });

    const sortedPayrollRecords = useMemo(() => {
        const sortableItems = [...payrollRecords];
        if (payrollSortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[payrollSortConfig.key];
                const bValue = b[payrollSortConfig.key];
                
                if (payrollSortConfig.key === 'month') {
                    const aDate = new Date(aValue as string).getTime();
                    const bDate = new Date(bValue as string).getTime();
                    return payrollSortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
                }
                
                if (aValue < bValue) {
                    return payrollSortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return payrollSortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [payrollRecords, payrollSortConfig]);

    const handlePayrollSort = (key: keyof PayrollRecord) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (payrollSortConfig && payrollSortConfig.key === key && payrollSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setPayrollSortConfig({ key, direction });
    };

    const handleAddSlip = (record: PayrollRecord) => {
        Swal.fire({
            title: 'เพิ่มลิงก์สลิปโอนเงิน',
            input: 'url',
            inputLabel: 'URL ของสลิปโอนเงิน',
            inputPlaceholder: 'https://example.com/slip.jpg',
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) {
                    return 'กรุณาใส่ URL ของสลิป';
                }
                return null;
            }
        }).then((result) => {
            if (result.isConfirmed) {
                setPayrollRecords(prev => prev.map(item => 
                    item.id === record.id ? { ...item, slipUrl: result.value, status: 'paid' } : item
                ));
                Swal.fire('สำเร็จ', 'บันทึกสลิปโอนเงินเรียบร้อย', 'success');
            }
        });
    };
    
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
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const [selectedItems, setSelectedItems] = useState<(number | string)[]>([]);
    const [showSalaries, setShowSalaries] = useState<boolean>(false);

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
                <input id="swal-vacation-days" type="number" class="swal2-input" placeholder="วันลาไม่รับเงินเดือน">
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

    const toggleSelection = (id: number | string) => {
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
                        selectedItems.forEach(id => jobApplicationsActions.remove(id));
                        break;
                    case 'contract':
                        selectedItems.forEach(id => employmentContractsActions.remove(id));
                        break;
                    case 'time':
                        setTimeRecords(prev => prev.filter(item => !selectedItems.includes(item.id as any)));
                        break;
                    case 'payroll':
                        setPayrollRecords(prev => prev.filter(item => !selectedItems.includes(item.id as any)));
                        break;
                    case 'leave':
                        // Restore quotas for approved leaves being deleted
                        selectedItems.forEach(id => {
                            const request = leaveRequests.find(r => r.id === id);
                            if (request && request.status === 'approved') {
                                const user = users.find(u => u.id === request.userId);
                                if (user && user.leaveQuotas) {
                                    const diffTime = Math.abs(request.endDate - request.startDate);
                                    const duration = request.isHalfDay ? 0.5 : Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
                                    
                                    const newQuotas = { ...user.leaveQuotas };
                                    const type = request.type as keyof typeof newQuotas;
                                    if (['sick', 'personal', 'vacation'].includes(type)) {
                                        newQuotas[type] = newQuotas[type] + duration;
                                        setUsers(prevUsers => prevUsers.map(u => u.id === user.id ? { ...u, leaveQuotas: newQuotas } : u));
                                    }
                                }
                            }
                        });
                        setLeaveRequests(prev => prev.filter(item => !selectedItems.includes(item.id as any)));
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
                    jobApplicationsActions.update(app.id, { userId: userId, status: 'hired' });
                    Swal.fire('สำเร็จ', 'เชื่อมต่อผู้ใช้และอัปเดตสถานะเป็น \'รับเข้าทำงาน\' เรียบร้อย', 'success');
                } else if (action === 'unlink') {
                    jobApplicationsActions.update(app.id, { userId: 0, status: 'approved' });
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
                    employmentContractsActions.add(newContract);
                    jobApplicationsActions.update(app.id, { userId: newUserId, status: 'hired' });

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
                jobApplicationsActions.add(newApp);
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
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(sheet);
                    
                    // Robust mapping supporting flexible, case-insensitive, and partial/Thai headers
                    const newApps = json.map((row: any) => {
                        const getRowValue = (searchKeys: string[]) => {
                            for (const k of searchKeys) {
                                if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
                            }
                            const rowKeys = Object.keys(row);
                            for (const k of searchKeys) {
                                const target = k.toLowerCase();
                                const found = rowKeys.find(rk => rk.toLowerCase() === target);
                                if (found !== undefined && row[found] !== undefined && row[found] !== null && row[found] !== '') {
                                    return row[found];
                                }
                            }
                            for (const k of searchKeys) {
                                const target = k.toLowerCase();
                                const found = rowKeys.find(rk => {
                                    const rkLower = rk.toLowerCase();
                                    return (target.length >= 4 && rkLower.length >= 4 && (rkLower.startsWith(target) || target.startsWith(rkLower)));
                                });
                                if (found !== undefined && row[found] !== undefined && row[found] !== null && row[found] !== '') {
                                    return row[found];
                                }
                            }
                            return undefined;
                        };

                        const fullNameVal = getRowValue(['fullName', 'Name', 'ชื่อ-นามสกุล', 'ชื่อ', 'full name']);
                        const positionVal = getRowValue(['position', 'Position', 'ตำแหน่ง', 'ตำแหน่งที่สมัคร', 'job']);
                        const phoneVal = getRowValue(['phoneNumber', 'phone', 'Phone', 'เบอร์โทร', 'เบอร์โทรศัพท์', 'tel', 'telephone']);
                        const salaryVal = getRowValue(['expectedSalary', 'expectedSa', 'salary', 'Salary', 'เงินเดือน', 'เงินเดือนที่ขอ', 'เงินเดือนที่ต้องการ']);
                        const statusVal = getRowValue(['status', 'Status', 'สถานะ']);
                        const appDateVal = getRowValue(['applicationDate', 'application', 'application_date', 'date', 'วันที่สมัคร', 'วันที่']);

                        let parsedStatus: 'pending' | 'interview' | 'hired' | 'rejected' | 'approved' = 'pending';
                        if (statusVal) {
                            const s = String(statusVal).toLowerCase().trim();
                            if (['pending', 'interview', 'hired', 'rejected', 'approved'].includes(s)) {
                                parsedStatus = s as any;
                            } else if (s === 'รอพิจารณา') {
                                parsedStatus = 'pending';
                            } else if (s === 'นัดสัมภาษณ์') {
                                parsedStatus = 'interview';
                            } else if (s === 'รับเข้าทำงาน' || s === 'ว่าจ้าง') {
                                parsedStatus = 'hired';
                            } else if (s === 'ปฏิเสธ') {
                                parsedStatus = 'rejected';
                            } else if (s === 'อนุมัติ') {
                                parsedStatus = 'approved';
                            }
                        }

                        let parsedAppDate = Date.now();
                        if (appDateVal) {
                            const num = Number(appDateVal);
                            if (!isNaN(num) && num > 1000000000) {
                                parsedAppDate = num;
                            } else {
                                const parsed = Date.parse(String(appDateVal));
                                if (!isNaN(parsed)) {
                                    parsedAppDate = parsed;
                                }
                            }
                        }

                        return {
                            id: Number(getRowValue(['id', 'ID'])) || (Date.now() + Math.random()),
                            fullName: fullNameVal ? String(fullNameVal) : 'Unknown',
                            position: positionVal ? String(positionVal) : 'Staff',
                            phoneNumber: phoneVal ? String(phoneVal) : '',
                            expectedSalary: salaryVal ? Number(salaryVal) : 0,
                            status: parsedStatus,
                            applicationDate: parsedAppDate,
                            userId: getRowValue(['userId', 'userid']) ? Number(getRowValue(['userId', 'userid'])) : undefined
                        };
                    });

                    if (newApps.length > 0) {
                        newApps.forEach((app: JobApplication) => jobApplicationsActions.add(app));
                        Swal.fire('สำเร็จ', `นำเข้าข้อมูล ${newApps.length} รายการเรียบร้อย`, 'success');
                    } else {
                        Swal.fire('ไม่พบข้อมูล', 'ไม่พบข้อมูลในไฟล์ Excel หรือรูปแบบไม่ถูกต้อง', 'warning');
                    }
                } catch (error) {
                    console.error("Excel Import Error:", error);
                    Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการอ่านไฟล์', 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }
    };

    const handleLoadExampleApps = () => {
        Swal.fire({
            title: 'โหลดข้อมูลตัวอย่าง?',
            text: 'ข้อมูลปัจจุบันจะถูกลบและแทนที่ด้วยข้อมูลตัวอย่าง',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'โหลด',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                // Clear existing (optional, or just append?) Let's clear to be clean
                // Note: Removing one by one might be slow if many, but fine for small lists
                jobApplications.forEach(app => jobApplicationsActions.remove(app.id));
                
                // Add defaults
                DEFAULT_JOB_APPLICATIONS.forEach(app => jobApplicationsActions.add({
                    ...app,
                    id: Date.now() + Math.random() // Ensure unique ID
                }));
                Swal.fire('สำเร็จ', 'โหลดข้อมูลตัวอย่างเรียบร้อย', 'success');
            }
        });
    };

    const handleLoadExampleContracts = () => {
        Swal.fire({
            title: 'โหลดข้อมูลตัวอย่าง?',
            text: 'ข้อมูลปัจจุบันจะถูกลบและแทนที่ด้วยข้อมูลตัวอย่าง',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'โหลด',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                employmentContracts.forEach(c => employmentContractsActions.remove(c.id));
                DEFAULT_EMPLOYMENT_CONTRACTS.forEach(c => employmentContractsActions.add({
                    ...c,
                    id: Date.now() + Math.random()
                }));
                Swal.fire('สำเร็จ', 'โหลดข้อมูลตัวอย่างเรียบร้อย', 'success');
            }
        });
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
                <select id="swal-contract-type" class="swal2-input mb-3">
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="temporary">ชั่วคราว</option>
                </select>
                <input id="swal-contract-doc-url" type="url" class="swal2-input" placeholder="ลิงก์เอกสารสัญญา (เช่น Google Drive, PDF)">
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

                if (!userId && finalName) {
                    const matchedUser = findUserByEmployeeName(finalName, users, jobApplications);
                    if (matchedUser) userId = matchedUser.id;
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
                    contractType: (document.getElementById('swal-contract-type') as HTMLSelectElement).value as any,
                    documentUrl: (document.getElementById('swal-contract-doc-url') as HTMLInputElement).value || ''
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
                employmentContractsActions.add(newContract);
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
                    <option value="vacation">ลาไม่รับเงินเดือน</option>
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
                    <p><strong>เงินเดือน:</strong> ${(contract.salary || 0).toLocaleString()} บาท</p>
                    <p><strong>วันที่เริ่มงาน:</strong> ${contract.startDate && !isNaN(new Date(contract.startDate).getTime()) ? new Date(contract.startDate).toLocaleDateString('th-TH') : '-'}</p>
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

        // Calculate duration consistently
        const getDuration = (req: LeaveRequest) => {
            if (req.isHalfDay) return 0.5;
            const diffTime = Math.abs(req.endDate - req.startDate);
            const days = Math.round(diffTime / (1000 * 60 * 60 * 24));
            return days > 0 ? days : 1;
        };

        const leaveDuration = getDuration(leaveRequest);

        if (newStatus === 'approved') {
            const employee = findUserByEmployeeName(leaveRequest.employeeName, users, jobApplications) || users.find(u => u.id === leaveRequest.userId);
            
            if (leaveRequest.type === 'vacation' || leaveRequest.type === 'leave-without-pay') {
                const contract = employmentContracts.find(c => c.employeeName === leaveRequest.employeeName) || employmentContracts.find(c => c.userId === leaveRequest.userId);

                if (employee && contract) {
                    isLeaveWithoutPayApproved = true;
                    const lastPayroll = payrollRecords
                        .filter(pr => pr.employeeName === leaveRequest.employeeName)
                        .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime())[0];

                    const nextPayday = lastPayroll ? new Date(new Date(lastPayroll.month).getTime() + 7 * 24 * 60 * 60 * 1000) : new Date();
                    
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
                
                // Also update quota for vacation type if it's the one used
                if (leaveRequest.type === 'vacation' && employee && employee.leaveQuotas) {
                    const newQuotas = { ...employee.leaveQuotas };
                    newQuotas.vacation = Math.max(0, newQuotas.vacation - leaveDuration);
                    setUsers(prevUsers => prevUsers.map(u => u.id === employee.id ? { ...u, leaveQuotas: newQuotas } : u));
                }
            } else if (['sick', 'personal'].includes(leaveRequest.type)) {
                // Update quota for standard leave types
                if (employee && employee.leaveQuotas) {
                    const newQuotas = { ...employee.leaveQuotas };
                    const type = leaveRequest.type as keyof typeof newQuotas;
                    newQuotas[type] = Math.max(0, newQuotas[type] - leaveDuration);
                    
                    setUsers(prevUsers => prevUsers.map(u => u.id === employee.id ? { ...u, leaveQuotas: newQuotas } : u));
                    
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: `อนุมัติแล้ว หักโควต้า ${leaveDuration} วัน`,
                        showConfirmButton: false,
                        timer: 3000
                    });
                    return; // Avoid double toast
                }
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

        const workedDates = new Set<string>();
        let lastEmpId = '';
        let lastDate = '';
        let lastCycle = 0;

        const getDatesForCycle = (baseDate: Date, cycle: number): Date[] => {
            const dates: Date[] = [];
            if (cycle === 30) {
                const year = baseDate.getFullYear();
                const month = baseDate.getMonth();
                const lastDay = new Date(year, month + 1, 0).getDate();
                for (let d = 1; d <= lastDay; d++) {
                    dates.push(new Date(year, month, d));
                }
            } else {
                let nonMondaysCount = 0;
                let current = new Date(baseDate);
                while (nonMondaysCount < cycle) {
                    const d = new Date(current);
                    dates.push(d);
                    if (d.getDay() !== 1) { // 1 is Monday (shop closed)
                        nonMondaysCount++;
                    }
                    current.setDate(current.getDate() - 1);
                }
                dates.sort((a, b) => a.getTime() - b.getTime());
            }
            return dates;
        };

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
                <div class="flex items-center gap-2 mb-3 px-1 text-left">
                    <input id="swal-pay-probation" type="checkbox" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer">
                    <label for="swal-pay-probation" class="text-sm font-semibold text-red-600 cursor-pointer">ทดลองงาน (จ่ายรายวัน)</label>
                </div>
                <div id="swal-pay-daily-rate-container" class="hidden mb-3">
                    <div class="text-left mb-1 text-xs text-gray-400">อัตราค่าจ้างรายวัน (บาท):</div>
                    <input id="swal-pay-daily-rate" type="number" class="swal2-input m-0 w-full" placeholder="ระบุอัตราค่าจ้างรายวัน (เช่น 350)">
                </div>
                <div id="swal-pay-calendar-section" class="hidden mb-3 text-left">
                    <div class="text-xs font-semibold text-gray-400 mb-1">ปฏิทินวันทำงาน (คลิกเพื่อเลือกวันทำงานจริง):</div>
                    <div class="flex items-center justify-between text-[11px] text-gray-300 mb-2 px-1">
                        <span class="text-emerald-400 font-semibold">🟢 วันที่ทำงาน</span>
                        <span id="swal-pay-calendar-month-year" class="text-amber-300 font-bold bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700"></span>
                        <span class="text-rose-400 font-semibold">🔴 วันที่ไม่ทำงาน</span>
                    </div>
                    <div id="swal-pay-calendar-grid" class="grid grid-cols-7 gap-1 text-center bg-gray-800 p-2 rounded-lg border border-gray-700 text-white"></div>
                    <div class="text-xs text-gray-400 mt-2 flex justify-between px-1">
                        <span>เลือกทำงานจริง: <strong id="swal-pay-selected-count" class="text-emerald-400">0</strong> วัน</span>
                        <span>วันหยุดร้าน (จันทร์): <strong id="swal-pay-mondays-count" class="text-amber-400">0</strong> วัน</span>
                    </div>
                </div>
                <div class="flex gap-2 mb-3">
                    <input id="swal-pay-slip" class="swal2-input m-0 flex-grow" placeholder="ลิงก์รูปภาพสลิป (URL)">
                    <input id="swal-pay-date" type="date" class="swal2-input m-0 w-1/3" placeholder="เลือกวันที่จ่าย">
                </div>
                <div class="flex gap-2 mb-3">
                    <select id="swal-pay-cycle" class="swal2-input m-0 flex-grow">
                        <option value="7">รอบถัดไป 7 วัน</option>
                        <option value="14">รอบถัดไป 14 วัน</option>
                        <option value="30">รอบเดือน</option>
                    </select>
                    <input id="swal-pay-next-date" class="swal2-input m-0 w-1/2 bg-gray-100" placeholder="วันจ่ายครั้งถัดไป" readonly>
                </div>
                <input id="swal-pay-base" type="text" class="swal2-input" placeholder="ยอดจ่ายสุทธิ" readonly>
                <div id="swal-pay-calc-info" class="text-left text-sm text-gray-500 mt-2 p-3 bg-gray-700 rounded-lg hidden"></div>
            `,
            didOpen: () => {
                 const select = document.getElementById('swal-pay-emp-select') as HTMLSelectElement;
                 const usernameInput = document.getElementById('swal-pay-username') as HTMLInputElement;
                 const baseInput = document.getElementById('swal-pay-base') as HTMLInputElement;
                 const dateInput = document.getElementById('swal-pay-date') as HTMLInputElement;
                 const cycleSelect = document.getElementById('swal-pay-cycle') as HTMLSelectElement;
                 const nextDateInput = document.getElementById('swal-pay-next-date') as HTMLInputElement;
                 const infoDiv = document.getElementById('swal-pay-calc-info') as HTMLDivElement;
                 const probationCheckbox = document.getElementById('swal-pay-probation') as HTMLInputElement;
                 const dailyRateContainer = document.getElementById('swal-pay-daily-rate-container') as HTMLDivElement;
                 const dailyRateInput = document.getElementById('swal-pay-daily-rate') as HTMLInputElement;
                 
                 const formatNumber = (num: number) => {
                     return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                 };

                 const updateNextPaymentDate = () => {
                     const payDateVal = dateInput.value;
                     const cycle = parseInt(cycleSelect.value);
                     if (payDateVal && !isNaN(cycle)) {
                         const payDate = new Date(payDateVal);
                         const nextDate = new Date(payDate);
                         if (cycle === 30) {
                             nextDate.setMonth(payDate.getMonth() + 1);
                         } else {
                             nextDate.setDate(payDate.getDate() + cycle);
                         }
                         
                         const day = nextDate.getDate().toString().padStart(2, '0');
                         const month = (nextDate.getMonth() + 1).toString().padStart(2, '0');
                         const year = nextDate.getFullYear() + 543;
                         nextDateInput.value = `จ่ายครั้งถัดไป: ${day}/${month}/${year}`;
                     } else {
                         nextDateInput.value = '';
                     }
                 };

                 const renderCalendarGrid = (payDateVal: string, cycle: number) => {
                     const gridContainer = document.getElementById('swal-pay-calendar-grid');
                     const selectedCountSpan = document.getElementById('swal-pay-selected-count');
                     const mondaysCountSpan = document.getElementById('swal-pay-mondays-count');
                     if (!gridContainer || !payDateVal) return;

                     const monthYearSpan = document.getElementById('swal-pay-calendar-month-year');
                     if (monthYearSpan) {
                         const payDateObj = new Date(payDateVal);
                         const monthNamesThaiFull = [
                             'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                             'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
                         ];
                         const monthName = monthNamesThaiFull[payDateObj.getMonth()];
                         const yearBE = payDateObj.getFullYear() + 543;
                         monthYearSpan.innerText = `${monthName} ${yearBE}`;
                     }

                     gridContainer.innerHTML = '';

                     const headers = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
                     headers.forEach(h => {
                         const hDiv = document.createElement('div');
                         hDiv.className = 'font-bold text-gray-400 text-[10px] py-1 border-b border-gray-700';
                         hDiv.innerText = h;
                         gridContainer.appendChild(hDiv);
                     });

                     const payDate = new Date(payDateVal);
                     const datesInCycle = getDatesForCycle(payDate, cycle);

                     if (datesInCycle.length === 0) return;

                     const firstDate = datesInCycle[0];
                     const firstDayOfWeek = firstDate.getDay();

                     for (let s = 0; s < firstDayOfWeek; s++) {
                         const spacer = document.createElement('div');
                         spacer.className = 'py-1 text-transparent select-none';
                         spacer.innerText = '.';
                         gridContainer.appendChild(spacer);
                     }

                     let closedMondays = 0;

                     datesInCycle.forEach(d => {
                         const dateStr = d.toISOString().split('T')[0];
                         const isMonday = d.getDay() === 1;
                         const dayNum = d.getDate();
                         
                         const cell = document.createElement('button');
                         cell.type = 'button';
                         cell.className = 'w-full py-1 text-[11px] font-semibold rounded transition-colors focus:outline-none';
                         
                         const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
                         const thaiMonthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                         const formatThaiDate = `${dayNames[d.getDay()]} ${d.getDate()} ${thaiMonthNames[d.getMonth()]} ${d.getFullYear() + 543}`;
                         cell.title = formatThaiDate;

                         if (isMonday) {
                             closedMondays++;
                             cell.className += ' bg-amber-950/40 text-amber-500 cursor-not-allowed border border-amber-900/40';
                             cell.innerHTML = `${dayNum}<br><span class="text-[7px] opacity-75">ปิด</span>`;
                             cell.disabled = true;
                         } else {
                             const isWorked = workedDates.has(dateStr);
                             if (isWorked) {
                                 cell.className += ' bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 cursor-pointer';
                                 cell.innerHTML = `${dayNum}<br><span class="text-[7px] opacity-75">ทำ</span>`;
                             } else {
                                 cell.className += ' bg-rose-950 text-rose-400 hover:bg-rose-900 border border-rose-800 cursor-pointer';
                                 cell.innerHTML = `${dayNum}<br><span class="text-[7px] opacity-75">หยุด</span>`;
                             }

                             cell.addEventListener('click', (e) => {
                                 e.preventDefault();
                                 if (workedDates.has(dateStr)) {
                                     workedDates.delete(dateStr);
                                 } else {
                                     workedDates.add(dateStr);
                                 }
                                 calculateDeductions();
                             });
                         }
                         gridContainer.appendChild(cell);
                     });

                     if (selectedCountSpan) {
                         const activeInCycleCount = datesInCycle.filter(d => workedDates.has(d.toISOString().split('T')[0])).length;
                         selectedCountSpan.innerText = String(activeInCycleCount);
                     }
                     if (mondaysCountSpan) {
                         mondaysCountSpan.innerText = String(closedMondays);
                     }
                 };

                 const calculateDeductions = () => {
                     updateNextPaymentDate();
                     const option = select.options[select.selectedIndex];
                     if (!option) return;
                     const salary = Number(option.getAttribute('data-salary'));
                     let userId = Number(option.getAttribute('data-userid'));
                     const empName = option.getAttribute('data-name');
                     const dateVal = dateInput.value; // YYYY-MM-DD
                     const isProbation = probationCheckbox.checked;

                     // Show/Hide daily rate field & calendar
                     if (isProbation) {
                         dailyRateContainer.classList.remove('hidden');
                         document.getElementById('swal-pay-calendar-section')?.classList.remove('hidden');
                     } else {
                         dailyRateContainer.classList.add('hidden');
                         document.getElementById('swal-pay-calendar-section')?.classList.add('hidden');
                     }

                     // Update Username Field & ID based on employee name override first
                     let user = null;
                     if (empName) {
                         const mappedUser = findUserByEmployeeName(empName, users, jobApplications);
                         if (mappedUser) {
                             user = mappedUser;
                             userId = mappedUser.id;
                         }
                     }

                     // Fallback: If userId is missing, try to find it via JobApplication
                     if (!user && !userId && empName) {
                         const normalizedEmpName = empName.trim();
                         const jobApp = jobApplications.find(j => j.fullName.trim() === normalizedEmpName && j.userId);
                         if (jobApp) userId = jobApp.userId!;
                     }

                     // Try standard fallback searches if user is still not resolved
                     if (!user && userId) {
                         user = users.find(u => String(u.id) === String(userId));
                          if (!user && empName) {
                              const normalizedEmpName = empName.trim();
                              const jobApp = jobApplications.find(j => j.fullName.trim() === normalizedEmpName);
                              if (jobApp) {
                                  if (jobApp.userId) {
                                      user = users.find(u => String(u.id) === String(jobApp.userId));
                                  }
                                  if (!user && jobApp.nickname) {
                                      const nick = jobApp.nickname.trim().toLowerCase();
                                      user = users.find(u => u.username.toLowerCase() === nick);
                                  }
                              }
                          }
                          if (!user && empName) {
                              const firstWord = empName.trim().split(' ')[0].toLowerCase();
                              user = users.find(u => u.username.toLowerCase() === firstWord);
                          }
                     }

                     if (user) {
                         usernameInput.value = user.username;
                         userId = user.id;
                     } else if (userId) {
                         usernameInput.value = `User ID: ${userId} (Not Found)`;
                     } else {
                         usernameInput.value = '';
                     }

                     if (salary && dateVal && userId) {
                         const payDate = new Date(dateVal);
                         const cycle = parseInt(cycleSelect.value) || 7;

                         // Get all approved unpaid leaves for this user
                         const unpaidLeaves = leaveRequests.filter(l => 
                             l.userId === userId && 
                             (isProbation ? true : (l.type === 'leave-without-pay' || l.type === 'vacation')) && 
                             l.status === 'approved'
                         );

                         if (isProbation) {
                              const dailyRate = Number(dailyRateInput.value) || 350;

                              const currentEmpId = select.value;
                              const currentDateVal = dateInput.value;
                              const currentCycle = parseInt(cycleSelect.value) || 7;

                              const stateChanged = currentEmpId !== lastEmpId || currentDateVal !== lastDate || currentCycle !== lastCycle;
                              const dates = currentDateVal ? getDatesForCycle(new Date(currentDateVal), currentCycle) : [];

                              if (stateChanged) {
                                  workedDates.clear();
                                  lastEmpId = currentEmpId;
                                  lastDate = currentDateVal;
                                  lastCycle = currentCycle;

                                  if (currentDateVal && userId) {
                                      for (const d of dates) {
                                          const dateStr = d.toISOString().split('T')[0];

                                         if (d.getDay() === 1) {
                                             continue; // Monday is shop closed, don't add to workedDates
                                         }

                                         const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                                         const leaveToday = unpaidLeaves.find(l => {
                                             const start = new Date(l.startDate);
                                             const end = new Date(l.endDate);
                                             const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
                                             const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
                                             return dTime >= startTime && dTime <= endTime;
                                         });

                                         if (!leaveToday) {
                                             workedDates.add(dateStr);
                                         }
                                     }
                                 }
                             }

                             if (currentDateVal) {
                                 renderCalendarGrid(currentDateVal, currentCycle);
                             }

                             let actualPaidDays = 0;
                             let closedShopMondays = 0;
                             let potentialDays = 0;
                             let unpaidLeaveDays = 0;
                             const leavesInCycle: { dateStr: string; reason: string; duration: number }[] = [];

                             if (currentDateVal) {
                                 const payDateObj = new Date(currentDateVal);
                                                                  const dates = getDatesForCycle(payDateObj, currentCycle);
                                 for (const d of dates) {
                                     const dateStr = d.toISOString().split('T')[0];

                                     if (d.getDay() === 1) {
                                         closedShopMondays++;
                                         continue;
                                     }

                                     potentialDays++;

                                     if (workedDates.has(dateStr)) {
                                         actualPaidDays++;
                                     } else {
                                         unpaidLeaveDays++;
                                         
                                         const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                                         const leaveToday = unpaidLeaves.find(l => {
                                             // already filtered by userId
                                             const start = new Date(l.startDate);
                                             const end = new Date(l.endDate);
                                             const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
                                             const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
                                             return dTime >= startTime && dTime <= endTime;
                                         });

                                         leavesInCycle.push({
                                             dateStr: d.toLocaleDateString('th-TH'),
                                             reason: leaveToday ? (leaveToday.reason || 'ลาแบบไม่รับเงิน') : 'ไม่ได้มาทำงาน (หักออก)',
                                             duration: 1
                                         });
                                     }
                                 }
                             }

                             const baseSalary = potentialDays * dailyRate;
                             const deductions = unpaidLeaveDays * dailyRate;
                             const netPay = actualPaidDays * dailyRate;

                             let htmlContent = `
                                 <div class="mb-2 p-2 bg-blue-900/30 rounded border border-blue-500/50">
                                     <p class="text-blue-400 font-bold text-sm">📋 สรุปงานรายวัน (ช่วงทดลองงาน)</p>
                                     <p class="text-xs text-gray-400">รอบจ่ายเงิน: ${currentCycle === 30 ? 'รอบเดือน' : currentCycle + ' วัน'} (${currentDateVal ? new Date(currentDateVal).toLocaleDateString('th-TH') : ''} ย้อนหลัง)</p>
                                     <ul class="text-xs text-gray-300 list-disc pl-4 mt-1">
                                         <li>จำนวนวันทั้งหมดในรอบ: ${currentCycle === 30 ? dates.length : currentCycle} วัน</li>
                                         <li>วันหยุดร้าน (วันจันทร์): ${closedShopMondays} วัน (ไม่คิดเงิน)</li>
                                         <li>วันทำงานปกติสูงสุด: ${potentialDays} วัน</li>
                                         <li class="text-rose-400 font-medium">วันไม่มาทำงาน/วันลา: ${unpaidLeaveDays} วัน</li>
                                         <li class="font-bold text-green-400">วันทำงานที่จ่ายจริง: ${actualPaidDays} วัน</li>
                                     </ul>
                                 </div>
                             `;

                             if (leavesInCycle.length > 0) {
                                 htmlContent += `
                                     <div class="mb-2 p-2 bg-red-900/30 rounded border border-red-500/50">
                                         <p class="text-red-400 font-bold text-xs">⚠️ รายการวันหยุด/วันลาไม่คิดเงิน:</p>
                                         <ul class="text-[11px] text-gray-300 list-disc pl-4 mt-1">
                                             ${leavesInCycle.map(l => `<li>${l.dateStr}: ${l.reason}</li>`).join('')}
                                         </ul>
                                         <p class="text-xs text-red-300 font-semibold mt-1">หักรวม: ${unpaidLeaveDays} วัน x ${dailyRate} = ${deductions.toLocaleString()} บาท</p>
                                     </div>
                                 `;
                             }

                             htmlContent += `<hr class="my-2 border-gray-600">`;
                             htmlContent += `
                                 <p>ค่าจ้างปกติ (${potentialDays} วัน x ${dailyRate} บาท): ${baseSalary.toLocaleString()} บาท</p>
                                 ${deductions > 0 ? `<p class="text-red-400">หักวันไม่ทำงานสะสม: -${deductions.toLocaleString()} บาท</p>` : ''}
                                 <p class="font-bold text-green-500 text-lg mt-1">ยอดจ่ายสุทธิ: ${(netPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                             `;

                             infoDiv.innerHTML = htmlContent;
                             infoDiv.classList.remove('hidden');
                             baseInput.value = formatNumber(netPay);
                         } else {
                             // Regular employee calculation
                             let cycleFactor = 1;
                             if (cycle === 14) cycleFactor = 2;
                             if (cycle === 30) cycleFactor = 4;
                             const baseForCycle = (salary / 4) * cycleFactor;
                             
                             // Define Ranges
                             // Backward: 10 days before payDate (inclusive start, exclusive end of payDate to avoid double count)
                             const backStart = new Date(payDate);
                             backStart.setDate(payDate.getDate() - 10);
                             const backEnd = new Date(payDate);

                             const forwardStart = new Date(payDate);
                             const forwardEnd = new Date(payDate);
                             forwardEnd.setDate(payDate.getDate() + 10);

                             let retroactiveDays = 0;
                             let currentDays = 0;
                             const retroactiveLeavesList: LeaveRequest[] = [];
                             const currentLeavesList: LeaveRequest[] = [];

                             unpaidLeaves.forEach(l => {
                                 const leaveStart = new Date(l.startDate);
                                 const leaveEnd = new Date(l.endDate);

                                 // 1. Check Retroactive Overlap [backStart, backEnd]
                                 if (leaveStart <= backEnd && leaveEnd >= backStart) {
                                     const overlapStart = leaveStart < backStart ? backStart : leaveStart;
                                     const overlapEnd = leaveEnd > backEnd ? backEnd : leaveEnd;
                                     
                                     if (overlapStart <= overlapEnd) {
                                         const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                                         const days = l.isHalfDay ? 0.5 : Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
                                         retroactiveDays += days;
                                         if (!retroactiveLeavesList.includes(l)) retroactiveLeavesList.push(l);
                                     }
                                 }

                                 // 2. Check Forward Overlap [forwardStart, forwardEnd]
                                 if (leaveStart <= forwardEnd && leaveEnd >= forwardStart) {
                                     const overlapStart = leaveStart < forwardStart ? forwardStart : leaveStart;
                                     const overlapEnd = leaveEnd > forwardEnd ? forwardEnd : leaveEnd;
                                     
                                     if (overlapStart <= overlapEnd) {
                                         const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                                         const days = l.isHalfDay ? 0.5 : Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
                                         currentDays += days;
                                         if (!currentLeavesList.includes(l)) currentLeavesList.push(l);
                                     }
                                 }
                             });

                             const dailyRate = salary / 26; // Rule: Salary / 26
                             
                             const retroactiveDeduction = dailyRate * retroactiveDays;
                             const currentDeduction = dailyRate * currentDays;
                             const totalDeduction = retroactiveDeduction + currentDeduction;
                             
                             const netPay = Math.max(0, baseForCycle - totalDeduction);

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
                                         <p class="text-sm font-bold text-red-300 mt-1">หักย้อนหลัง: ${(retroactiveDeduction || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                                     </div>
                                 `;
                             } else {
                                 htmlContent += `
                                    <div class="mb-2 p-2 bg-gray-800/50 rounded border border-gray-700">
                                        <p class="text-green-500 text-xs">ไม่พบการลาย้อนหลัง (10 วันย้อนหลัง)</p>
                                        <p class="text-xs text-gray-400">ช่วงเวลา: ${backStart.toLocaleDateString('th-TH')} - ${backEnd.toLocaleDateString('th-TH')}</p>
                                    </div>
                                 `;
                             }

                             // Current Period Info
                             if (currentDays > 0) {
                                 htmlContent += `
                                     <div class="mb-2">
                                         <p class="text-red-500 font-bold">พบการลาในรอบปัจจุบัน ${currentDays} วัน</p>
                                         <p class="text-xs text-gray-400">ช่วงเวลา: ${forwardStart.toLocaleDateString('th-TH')} - ${forwardEnd.toLocaleDateString('th-TH')}</p>
                                         <p>หัก (รอบนี้): ${currentDays} วัน x ${(dailyRate || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = ${(currentDeduction || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
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
                                 <p class="mt-2">เงินเดือนตามรอบจ่าย (${cycle} วัน): ${(baseForCycle || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                                 ${totalDeduction > 0 ? `<p class="text-red-400">รวมหักทั้งหมด: -${(totalDeduction || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>` : ''}
                                 <p class="font-bold text-green-500 text-lg mt-1">ยอดจ่ายสุทธิ: ${(netPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</p>
                             `;

                             infoDiv.innerHTML = htmlContent;
                             infoDiv.classList.remove('hidden');
                             
                             baseInput.value = formatNumber(netPay);
                         }
                     } else if (salary) {
                         let cycleFactor = 1;
                         const cycleVal = parseInt(cycleSelect.value) || 7;
                         if (cycleVal === 14) cycleFactor = 2;
                         if (cycleVal === 30) cycleFactor = 4;
                         baseInput.value = formatNumber((salary / 4) * cycleFactor);
                         infoDiv.classList.add('hidden');
                     }
                 };

                 select.addEventListener('change', calculateDeductions);
                 dateInput.addEventListener('change', calculateDeductions);
                 cycleSelect.addEventListener('change', () => {
                     updateNextPaymentDate();
                     calculateDeductions();
                 });
                  probationCheckbox.addEventListener('change', () => {
                      if (probationCheckbox.checked) {
                          dailyRateContainer.classList.remove('hidden');
                          document.getElementById('swal-pay-calendar-section')?.classList.remove('hidden');
                          const option = select.options[select.selectedIndex];
                          const salary = option ? Number(option.getAttribute('data-salary')) : 0;
                          if (salary && !dailyRateInput.value) {
                              dailyRateInput.value = String(Math.round(salary / 26));
                          }
                      } else {
                          dailyRateContainer.classList.add('hidden');
                          document.getElementById('swal-pay-calendar-section')?.classList.add('hidden');
                      }
                      calculateDeductions();
                  });
                 dailyRateInput.addEventListener('input', calculateDeductions);
            },
            preConfirm: () => {
                const select = document.getElementById('swal-pay-emp-select') as HTMLSelectElement;
                const employeeName = select.options[select.selectedIndex]?.text;
                const date = (document.getElementById('swal-pay-date') as HTMLInputElement).value;
                const cycle = parseInt((document.getElementById('swal-pay-cycle') as HTMLSelectElement).value);
                const netSalaryStr = (document.getElementById('swal-pay-base') as HTMLInputElement).value;
                const netSalary = Number(netSalaryStr.replace(/,/g, '')); // Remove commas
                const slipUrl = (document.getElementById('swal-pay-slip') as HTMLInputElement).value;
                const contractId = Number(select.value);
                const contract = employmentContracts.find(c => c.id === contractId);
                const isProbation = (document.getElementById('swal-pay-probation') as HTMLInputElement).checked;
                const dailyRate = isProbation ? (Number((document.getElementById('swal-pay-daily-rate') as HTMLInputElement).value) || 350) : 0;

                const baseSalaryAttr = contract ? contract.salary : 0;

                let baseSalaryForRecord = baseSalaryAttr;
                let finalWorkedDays: number | undefined = undefined;
                let finalWorkedDatesList: string[] | undefined = undefined;

                if (isProbation) {
                    let potentialDays = 0;
                    const payDateObj = new Date(date);
                    const dates = getDatesForCycle(payDateObj, cycle);
                    for (const d of dates) {
                        if (d.getDay() !== 1) { // non-Monday
                            potentialDays++;
                        }
                    }
                    baseSalaryForRecord = potentialDays * dailyRate;

                    // Compute actual paid days and dates list from workedDates set
                    let actualPaidDays = 0;
                    const workedDatesList: string[] = [];
                    for (const d of dates) {
                        const dateStr = d.toISOString().split('T')[0];
                        if (d.getDay() !== 1 && workedDates.has(dateStr)) {
                            actualPaidDays++;
                            workedDatesList.push(dateStr);
                        }
                    }
                    finalWorkedDays = actualPaidDays;
                    finalWorkedDatesList = workedDatesList;
                } else {
                    let cycleFactor = 1;
                    if (cycle === 14) cycleFactor = 2;
                    if (cycle === 30) cycleFactor = 4;
                    baseSalaryForRecord = (baseSalaryAttr / 4) * cycleFactor;

                    // Compute actual paid days and dates list for regular employees based on approved unpaid leaves
                    const payDateObj = new Date(date);
                    const dates = getDatesForCycle(payDateObj, cycle);
                    const empUserId = contract ? contract.userId : 0;

                    const relevantLeaves = leaveRequests.filter(l => 
                        l.userId === empUserId && 
                        (l.type === 'leave-without-pay' || l.type === 'vacation') && 
                        l.status === 'approved'
                    );

                    let actualWorkedDays = 0;
                    const workedDatesList: string[] = [];
                    for (const d of dates) {
                        if (d.getDay() === 1) continue; // Skip Mondays
                        
                        const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                        const hasLeave = relevantLeaves.some(l => {
                            const start = new Date(l.startDate);
                            const end = new Date(l.endDate);
                            const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
                            const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
                            return dTime >= startTime && dTime <= endTime;
                        });

                        if (!hasLeave) {
                            actualWorkedDays++;
                            workedDatesList.push(d.toISOString().split('T')[0]);
                        }
                    }
                    finalWorkedDays = actualWorkedDays;
                    finalWorkedDatesList = workedDatesList;
                }
                const deductions = baseSalaryForRecord - netSalary;

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

                // Calculate next payment date for saving
                const payDate = new Date(date);
                const nextPaymentDate = new Date(payDate);
                if (cycle === 30) {
                    nextPaymentDate.setMonth(payDate.getMonth() + 1);
                } else {
                    nextPaymentDate.setDate(payDate.getDate() + cycle);
                }

                return {
                    employeeName: employeeName,
                    month: date,
                    baseSalary: baseSalaryForRecord,
                    deductions: deductions > 0 ? deductions : 0,
                    totalNetSalary: netSalary,
                    slipUrl: slipUrl,
                    nextPaymentDate: nextPaymentDate.getTime(),
                    paymentCycle: cycle as 7 | 14 | 30,
                    workedDays: finalWorkedDays,
                    workedDates: finalWorkedDatesList
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
                    status: val.slipUrl ? 'paid' : 'pending',
                    slipUrl: val.slipUrl,
                    nextPaymentDate: val.nextPaymentDate,
                    paymentCycle: val.paymentCycle,
                    workedDays: val.workedDays,
                    workedDates: val.workedDates
                };
                setPayrollRecords(prev => [...prev, newPayroll]);
                Swal.fire('สำเร็จ', 'บันทึกเงินเดือนเรียบร้อย', 'success');
            }
        });
    };

    // --- GOAL ACTIONS ---
    const handleSaveGoalDraft = (items: GoalItem[], selectedBranches: number[]) => {
        if (items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเพิ่มเป้าหมายอย่างน้อย 1 ข้อ', 'error');
            return;
        }
        if (selectedBranches.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกสาขาที่ต้องการส่งเป้าหมายอย่างน้อย 1 สาขา', 'error');
            return;
        }

        const existingGoal = employeeGoals.find(g => 
            (g.userId === currentUser?.id?.toString() || g.userId === currentUser?.username)
        );

        const draftGoal: EmployeeGoal = {
            id: existingGoal?.id || Date.now().toString(),
            userId: currentUser?.id?.toString() || 'unknown',
            employeeName: currentUser?.username || 'พนักงานนิรนาม',
            branchIds: selectedBranches.map(bId => bId.toString()),
            items: items,
            status: 'draft',
            createdAt: existingGoal?.createdAt || Date.now()
        };

        const updatedGoals = existingGoal
            ? employeeGoals.map(g => g.id === existingGoal.id ? draftGoal : g)
            : [...employeeGoals, draftGoal];

        setEmployeeGoals(updatedGoals);
        Swal.fire('สำเร็จ', 'บันทึกแบบร่างเป้าหมายเรียบร้อยแล้ว', 'success');
    };

    const handleSubmitGoalToAdmin = (items: GoalItem[], selectedBranches: number[]) => {
        if (items.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเพิ่มเป้าหมายอย่างน้อย 1 ข้อ', 'error');
            return;
        }
        if (selectedBranches.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกสาขาที่ต้องการส่งเป้าหมายอย่างน้อย 1 สาขา', 'error');
            return;
        }

        const existingGoal = employeeGoals.find(g => 
            (g.userId === currentUser?.id?.toString() || g.userId === currentUser?.username)
        );

        const finalGoal: EmployeeGoal = {
            id: existingGoal?.id || Date.now().toString(),
            userId: currentUser?.id?.toString() || 'unknown',
            employeeName: currentUser?.username || 'พนักงานนิรนาม',
            branchIds: selectedBranches.map(bId => bId.toString()),
            items: items,
            status: 'pending_admin',
            createdAt: Date.now()
        };

        const updatedGoals = existingGoal
            ? employeeGoals.map(g => g.id === existingGoal.id ? finalGoal : g)
            : [...employeeGoals, finalGoal];

        setEmployeeGoals(updatedGoals);
        Swal.fire('ส่งสำเร็จ', 'ส่งเป้าหมายไปยังผู้ดูแลเรียบร้อยแล้ว', 'success');
    };

    const handleSetGoalActive = (goalId: string) => {
        const goal = employeeGoals.find(g => g.id === goalId);
        if (!goal) return;

        const today = new Date();
        const startDateStr = today.toISOString().split('T')[0];
        
        // 6 months later
        const sixMonthsLater = new Date();
        sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
        const endDateStr = sixMonthsLater.toISOString().split('T')[0];

        const updatedGoal: EmployeeGoal = {
            ...goal,
            status: 'active',
            startDate: startDateStr,
            endDate: endDateStr,
            setByAdmin: true,
            approvedByAdmin: true,
            approvedAt: Date.now()
        };

        setEmployeeGoals(prev => prev.map(g => g.id === goalId ? updatedGoal : g));
        Swal.fire('สำเร็จ', 'อนุมัติเริ่มเป้าหมาย 6 เดือนเรียบร้อยแล้ว', 'success');
    };

    const handleSimulateExpired = (goalId: string) => {
        const goal = employeeGoals.find(g => g.id === goalId);
        if (!goal) return;

        const updatedGoal: EmployeeGoal = {
            ...goal,
            status: 'pending_evaluation'
        };

        setEmployeeGoals(prev => prev.map(g => g.id === goalId ? updatedGoal : g));
        Swal.fire('จำลองสำเร็จ', 'จำลองครบกำหนด 6 เดือน และเปิดสิทธิ์ประเมินแล้ว', 'success');
    };

    const handleToggleActiveItemStatus = (goal: EmployeeGoal, itemIndex: number) => {
        const updatedItems = [...goal.items];
        const currentStatus = updatedItems[itemIndex].status;
        updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            status: currentStatus === 'completed' ? 'not_completed' : 'completed'
        };

        const updatedGoal: EmployeeGoal = {
            ...goal,
            items: updatedItems
        };

        setEmployeeGoals(prev => prev.map(g => g.id === goal.id ? updatedGoal : g));
    };

    const handleSubmitEvaluation = (goal: EmployeeGoal, scores: Record<string, number>) => {
        if (!currentUser) return;

        // Check if all items rated
        const allRated = goal.items.every(item => scores[item.id] !== undefined);
        if (!allRated) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาให้คะแนนเป้าหมายทุกข้อให้ครบถ้วน', 'warning');
            return;
        }

        const newEval: PeerEvaluation = {
            evaluatorId: currentUser.id.toString(),
            evaluatorName: currentUser.username,
            scores: scores,
            submittedAt: Date.now()
        };

        const evals = goal.peerEvaluations ? [...goal.peerEvaluations] : [];
        // Remove previous evaluation by same user if any
        const filteredEvals = evals.filter(e => e.evaluatorId !== currentUser.id.toString());
        filteredEvals.push(newEval);

        const updatedGoal: EmployeeGoal = {
            ...goal,
            peerEvaluations: filteredEvals
        };

        setEmployeeGoals(prev => prev.map(g => g.id === goal.id ? updatedGoal : g));
        setEvaluatingGoal(null);
        setEvalScores({});
        Swal.fire('สำเร็จ', 'ส่งคะแนนประเมินเพื่อนร่วมงานเรียบร้อยแล้ว', 'success');
    };

    const handleApproveAndGrade = (goal: EmployeeGoal, note: string, selectedGrade?: 'A' | 'B' | 'C' | 'D') => {
        if (!goal.peerEvaluations || goal.peerEvaluations.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'ยังไม่มีเพื่อนร่วมงานประเมินเป้าหมายนี้', 'error');
            return;
        }

        // Calculate final score
        // Each peer score is from 1 to 10
        // Total possible score = peers_count * items_count * 10
        // Earned score = sum of all scores
        const peersCount = goal.peerEvaluations.length;
        const itemsCount = goal.items.length;
        const maxPoints = peersCount * itemsCount * 10;
        
        let earnedPoints = 0;
        goal.peerEvaluations.forEach(pe => {
            Object.values(pe.scores).forEach(score => {
                earnedPoints += score;
            });
        });

        const finalScorePercentage = maxPoints > 0 
            ? parseFloat(((earnedPoints / maxPoints) * 100).toFixed(2)) 
            : 0;
        
        let finalGrade: 'A' | 'B' | 'C' | 'D' = selectedGrade || 'D';
        if (!selectedGrade) {
            if (finalScorePercentage >= 80) {
                finalGrade = 'A';
            } else if (finalScorePercentage >= 70) {
                finalGrade = 'B';
            } else if (finalScorePercentage >= 60) {
                finalGrade = 'C';
            }
        }

        const updatedGoal: EmployeeGoal = {
            ...goal,
            status: 'completed',
            finalScore: finalScorePercentage,
            finalGrade: finalGrade,
            adminNote: note,
            approvedByAdmin: true,
            approvedAt: Date.now()
        };

        setEmployeeGoals(prev => prev.map(g => g.id === goal.id ? updatedGoal : g));
        setAdminGradingGoal(null);
        setAdminFeedback('');
        Swal.fire('อนุมัติและตัดเกรดแล้ว', `สรุปผลคะแนนและบันทึกเกรดเรียบร้อย ได้เกรด ${finalGrade} (${finalScorePercentage}%)`, 'success');
    };

    const handleAdminSaveEditedGoal = () => {
        if (!adminEditingGoal) return;
        if (adminEditItems.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเพิ่มเป้าหมายอย่างน้อย 1 ข้อ', 'error');
            return;
        }
        if (adminEditBranches.length === 0) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกสาขาที่ต้องการส่งเป้าหมายอย่างน้อย 1 สาขา', 'error');
            return;
        }

        let startDate = adminEditingGoal.startDate;
        let endDate = adminEditingGoal.endDate;
        if (adminEditStatus === 'active' && (!startDate || !endDate)) {
            const today = new Date();
            startDate = today.toISOString().split('T')[0];
            
            const sixMonthsLater = new Date();
            sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
            endDate = sixMonthsLater.toISOString().split('T')[0];
        }

        const updatedGoal: EmployeeGoal = {
            ...adminEditingGoal,
            items: adminEditItems,
            branchIds: adminEditBranches.map(String),
            status: adminEditStatus,
            startDate,
            endDate,
        };

        setEmployeeGoals(prev => prev.map(g => g.id === adminEditingGoal.id ? updatedGoal : g));
        setAdminEditingGoal(null);
        Swal.fire('สำเร็จ', 'บันทึกการแก้ไขเป้าหมายของพนักงานโดยผู้ดูแลเรียบร้อยแล้ว', 'success');
    };

    const payrollDueCount = useMemo(() => {
        const latestRecordsMap = new Map<string, PayrollRecord>();
        payrollRecords.forEach(r => {
            if (!latestRecordsMap.has(r.employeeName) || 
                (r.nextPaymentDate || 0) > (latestRecordsMap.get(r.employeeName)?.nextPaymentDate || 0)
            ) {
                latestRecordsMap.set(r.employeeName, r);
            }
        });

        const now = Date.now();
        let count = 0;

        latestRecordsMap.forEach((record) => {
            if (record.nextPaymentDate) {
                if (now >= record.nextPaymentDate) {
                    count++;
                }
            }
        });

        return count;
    }, [payrollRecords]);

    const renderTabButton = (id: HRTab, label: string) => {
        const isPayrollTab = id === 'payroll';
        const showBadge = isPayrollTab && payrollDueCount > 0;

        return (
            <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap relative ${
                    activeTab === id 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
                {label}
                {showBadge && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg border border-gray-900">
                        {payrollDueCount}
                    </span>
                )}
            </button>
        );
    };

    return (
        <div className="bg-gray-900 h-full overflow-y-auto text-white w-full pb-24">
            <div className="p-6">
                <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
                    <span className="text-blue-500">👥</span> จัดการบุคคล (HR Management)
                </h1>

                {/* Tabs */}
                <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
                    {[
                        { id: 'application' as HRTab, label: '📄 ใบสมัครงาน' },
                        { id: 'contract' as HRTab, label: '📝 สัญญาจ้าง' },
                        { id: 'time' as HRTab, label: '⏰ บันทึกเวลา' },
                        { id: 'payroll' as HRTab, label: '💰 เงินเดือน' },
                        { id: 'leave' as HRTab, label: '📅 วันลา' },
                        { id: 'goal' as HRTab, label: '🎯 เป้าหมาย & ประเมิน (Goal)' },
                    ].filter(tab => {
                        const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'branch-admin';
                        if (!isAdminOrManager) {
                            return tab.id === 'goal';
                        }
                        return true;
                    }).map(tab => renderTabButton(tab.id, tab.label))}
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
                                        <th className="p-3">
                                            <div className="flex items-center gap-1.5">
                                                <span>เงินเดือนที่ขอ</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setShowSalaries(!showSalaries)}
                                                    className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                                                    title={showSalaries ? "ซ่อนตัวเลข" : "แสดงตัวเลข"}
                                                >
                                                    {showSalaries ? <EyeOff className="h-4 w-4 inline-block" /> : <Eye className="h-4 w-4 inline-block" />}
                                                </button>
                                            </div>
                                        </th>
                                        <th className="p-3">สถานะ</th>
                                        <th className="p-3">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {jobApplications.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 7 : 6} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        jobApplications.map((app, index) => (
                                            <tr key={app.id || index} className="hover:bg-gray-700/50">
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
                                                            value={!isNaN(new Date(app.applicationDate).getTime()) ? new Date(app.applicationDate).toISOString().split('T')[0] : ''} 
                                                            onChange={(e) => {
                                                                const newDate = new Date(e.target.value).getTime();
                                                                jobApplicationsActions.update(app.id, { applicationDate: newDate });
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        />
                                                    ) : (
                                                        app.applicationDate ? new Date(app.applicationDate).toLocaleDateString('th-TH') : '-'
                                                    )}
                                                </td>
                                                <td className="p-3 font-medium text-white">{app.fullName || '-'}</td>
                                                <td className="p-3">{app.position || '-'}</td>
                                                <td className="p-3">
                                                    {showSalaries ? (
                                                        (app.expectedSalary || 0).toLocaleString()
                                                    ) : (
                                                        <span className="text-gray-500 font-medium">••••••</span>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <select
                                                            value={app.status}
                                                            onChange={(e) => {
                                                                const newStatus = e.target.value as any;
                                                                jobApplicationsActions.update(app.id, { status: newStatus });
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
                                                        const linkedUser = findUserByEmployeeName(app.fullName, users, jobApplications) ||
                                                            users.find(u => u.id === app.userId) || 
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
                                                    {isEditMode && (
                                                        <button 
                                                            onClick={() => {
                                                                Swal.fire({
                                                                    title: 'ยืนยันการลบ?',
                                                                    text: `คุณต้องการลบใบสมัครของ ${app.fullName || 'ไม่มีชื่อ'} ใช่หรือไม่?`,
                                                                    icon: 'warning',
                                                                    showCancelButton: true,
                                                                    confirmButtonText: 'ลบ',
                                                                    cancelButtonText: 'ยกเลิก'
                                                                }).then((result) => {
                                                                    if (result.isConfirmed) {
                                                                        jobApplicationsActions.remove(app.id);
                                                                        Swal.fire('สำเร็จ', 'ลบใบสมัครเรียบร้อย', 'success');
                                                                    }
                                                                });
                                                            }}
                                                            className="text-red-500 hover:text-red-400 p-1 font-semibold text-xs border border-red-500/30 rounded hover:bg-red-500/10 transition-colors ml-auto flex items-center justify-center shrink-0 h-7 px-2"
                                                            title="ลบรายการนี้"
                                                        >
                                                            🗑️ ลบ
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
                                        <th className="p-3">
                                            <div className="flex items-center gap-1.5">
                                                <span>เงินเดือน</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setShowSalaries(!showSalaries)}
                                                    className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                                                    title={showSalaries ? "ซ่อนตัวเลข" : "แสดงตัวเลข"}
                                                >
                                                    {showSalaries ? <EyeOff className="h-4 w-4 inline-block" /> : <Eye className="h-4 w-4 inline-block" />}
                                                </button>
                                            </div>
                                        </th>
                                        <th className="p-3">User</th>
                                        <th className="p-3">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {employmentContracts.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 8 : 7} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        employmentContracts.map((c, index) => (
                                            <tr key={c.id || index} className="hover:bg-gray-700/50">
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
                                                            value={!isNaN(new Date(c.startDate).getTime()) ? new Date(c.startDate).toISOString().split('T')[0] : ''} 
                                                            onChange={(e) => {
                                                                const newDate = new Date(e.target.value).getTime();
                                                                employmentContractsActions.update(c.id, { startDate: newDate });
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        />
                                                    ) : (
                                                        c.startDate && !isNaN(new Date(c.startDate).getTime()) ? new Date(c.startDate).toLocaleDateString('th-TH') : '-'
                                                    )}
                                                </td>
                                                <td className="p-3 font-medium text-white">{c.employeeName || '-'}</td>
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <select 
                                                            value={c.position}
                                                            onChange={(e) => {
                                                                const newPosition = e.target.value;
                                                                employmentContractsActions.update(c.id, { position: newPosition });
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
                                                <td className="p-3">
                                                    {showSalaries ? (
                                                        (c.salary || 0).toLocaleString()
                                                    ) : (
                                                        <span className="text-gray-500 font-medium">••••••</span>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <select
                                                            value={c.userId || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                const newUserId = val ? Number(val) : undefined;
                                                                employmentContractsActions.update(c.id, { userId: newUserId });
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 max-w-[120px]"
                                                        >
                                                            <option value="">-- เลือกผู้ใช้ --</option>
                                                            {users.map(u => (
                                                                <option key={u.id} value={u.id}>{u.username}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        (() => {
                                                            const linkedUser = findUserByEmployeeName(c.employeeName, users, jobApplications) || users.find(u => u.id === c.userId);
                                                            return linkedUser ? (
                                                                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded whitespace-nowrap">
                                                                    👤 {linkedUser.username}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-red-400 bg-red-950/40 px-2 py-1 rounded whitespace-nowrap">
                                                                    ⚠️ ไม่พบผู้ใช้งาน
                                                                </span>
                                                            );
                                                        })()
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button 
                                                            onClick={() => handleViewContract(c)}
                                                            className="text-blue-400 hover:text-blue-300 text-sm underline shrink-0"
                                                        >
                                                            ดูสัญญา
                                                        </button>
                                                        {isEditMode ? (
                                                            <>
                                                                <input 
                                                                    type="url" 
                                                                    placeholder="ลิงก์เอกสาร (URL)" 
                                                                    value={c.documentUrl || ''} 
                                                                    onChange={(e) => {
                                                                        employmentContractsActions.update(c.id, { documentUrl: e.target.value });
                                                                    }}
                                                                    className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 w-32"
                                                                />
                                                                <button 
                                                                    onClick={() => {
                                                                        Swal.fire({
                                                                            title: 'ยืนยันการลบ?',
                                                                            text: `คุณต้องการลบสัญญาของ ${c.employeeName || 'ไม่มีชื่อ'} ใช่หรือไม่?`,
                                                                            icon: 'warning',
                                                                            showCancelButton: true,
                                                                            confirmButtonText: 'ลบ',
                                                                            cancelButtonText: 'ยกเลิก'
                                                                        }).then((result) => {
                                                                            if (result.isConfirmed) {
                                                                                employmentContractsActions.remove(c.id);
                                                                                Swal.fire('สำเร็จ', 'ลบสัญญาเรียบร้อย', 'success');
                                                                            }
                                                                        });
                                                                    }}
                                                                    className="text-red-500 hover:text-red-400 px-2 py-1 font-semibold text-xs border border-red-500/30 rounded hover:bg-red-500/10 transition-colors shrink-0"
                                                                    title="ลบรายการนี้"
                                                                >
                                                                    🗑️ ลบ
                                                                </button>
                                                            </>
                                                        ) : (
                                                            c.documentUrl && (
                                                                <>
                                                                    <span className="text-gray-600">|</span>
                                                                    <a 
                                                                        href={c.documentUrl.startsWith('http') ? c.documentUrl : `https://${c.documentUrl}`} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        className="text-teal-400 hover:text-teal-300 text-sm underline flex items-center gap-0.5 whitespace-nowrap"
                                                                        title={c.documentUrl}
                                                                    >
                                                                        🔗 เอกสารสัญญา
                                                                    </a>
                                                                </>
                                                            )
                                                        )}
                                                    </div>
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
                                        timeRecords.map((t, index) => (
                                            <tr key={t.id || index} className="hover:bg-gray-700/50">
                                                {isEditMode && (
                                                    <td className="p-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedItems.includes(t.id)} 
                                                            onChange={() => toggleSelection(t.id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3">{t.date && !isNaN(new Date(t.date).getTime()) ? new Date(t.date).toLocaleDateString('th-TH') : '-'}</td>
                                                <td className="p-3 font-medium text-white">{t.employeeName}</td>
                                                <td className="p-3">{t.clockIn && !isNaN(new Date(t.clockIn).getTime()) ? new Date(t.clockIn).toLocaleTimeString('th-TH') : '-'}</td>
                                                <td className="p-3">{t.clockOut && !isNaN(new Date(t.clockOut).getTime()) ? new Date(t.clockOut).toLocaleTimeString('th-TH') : '-'}</td>
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
                                        <th 
                                            className="p-3 cursor-pointer hover:bg-gray-600 transition-colors"
                                            onClick={() => handlePayrollSort('month')}
                                        >
                                            <div className="flex items-center gap-1">
                                                วันที่จ่าย
                                                {payrollSortConfig?.key === 'month' && (
                                                    <span>{payrollSortConfig.direction === 'asc' ? '🔼' : '🔽'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th className="p-3">พนักงาน</th>
                                        <th className="p-3">
                                            <div className="flex items-center gap-1.5">
                                                <span>เงินเดือนฐาน</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setShowSalaries(!showSalaries)}
                                                    className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                                                    title={showSalaries ? "ซ่อนตัวเลข" : "แสดงตัวเลข"}
                                                >
                                                    {showSalaries ? <EyeOff className="h-4 w-4 inline-block" /> : <Eye className="h-4 w-4 inline-block" />}
                                                </button>
                                            </div>
                                        </th>
                                        <th className="p-3">สุทธิ</th>
                                        <th className="p-3">สถานะ</th>
                                        <th className="p-3">วันจ่ายครั้งถัดไป</th>
                                        <th className="p-3">สลิปโอนเงิน</th>
                                    </tr>
</thead>
                                <tbody className="divide-y divide-gray-700">
                                    {sortedPayrollRecords.length === 0 ? (
                                        <tr><td colSpan={isEditMode ? 6 : 5} className="p-4 text-center text-gray-500">ไม่พบข้อมูล</td></tr>
                                    ) : (
                                        sortedPayrollRecords.map((p, index) => (
                                            <tr key={p.id || index} className="hover:bg-gray-700/50">
                                                {isEditMode && (
                                                    <td className="p-3">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedItems.includes(p.id)} 
                                                            onChange={() => toggleSelection(p.id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3">
                                                    {isEditMode ? (
                                                        <input 
                                                            type="date" 
                                                            value={p.month} 
                                                            onChange={(e) => {
                                                                const newDate = e.target.value;
                                                                setPayrollRecords(prev => prev.map(item => item.id === p.id ? { ...item, month: newDate } : item));
                                                            }}
                                                            className="bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                        />
                                                    ) : (
                                                        p.month && !isNaN(new Date(p.month).getTime()) ? new Date(p.month).toLocaleDateString('th-TH') : '-'
                                                    )}
                                                </td>
                                                <td className="p-3 font-medium text-white">
                                                    <div>
                                                        <span>{p.employeeName}</span>
                                                        {typeof p.workedDays === 'number' && !isNaN(p.workedDays) && (
                                                            <p className="text-[10px] text-emerald-400 font-normal mt-0.5">🟢 ทำงานจริง: {p.workedDays} วัน</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    {showSalaries ? (
                                                        (p.baseSalary || 0).toLocaleString()
                                                    ) : (
                                                        <span className="text-gray-500 font-medium">••••••</span>
                                                    )}
                                                </td>
                                                <td className="p-3 font-bold text-green-400">
                                                    {showSalaries ? (
                                                        (p.totalNetSalary || 0).toLocaleString()
                                                    ) : (
                                                        <span className="text-gray-500 font-medium">••••••</span>
                                                    )}
                                                </td>
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
                                                <td className="p-3 font-semibold text-blue-400">
                                                    {p.nextPaymentDate && !isNaN(new Date(p.nextPaymentDate).getTime()) 
                                                        ? new Date(p.nextPaymentDate).toLocaleDateString('th-TH') 
                                                        : '-'}
                                                </td>
                                                <td className="p-3">
                                                    {p.slipUrl ? (
                                                        <a href={p.slipUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                                            Link
                                                        </a>
                                                    ) : (
                                                        p.status === 'pending' ? (
                                                            <button 
                                                                onClick={() => handleAddSlip(p)}
                                                                className="text-blue-400 hover:text-blue-300 text-xs border border-blue-500 px-2 py-1 rounded flex items-center gap-1"
                                                            >
                                                                <span>➕</span> เพิ่มลิงก์
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-500">-</span>
                                                        )
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
                                    ) : (() => {
                                        // Pre-calculate used days per user and type to avoid O(N^2) in render
                                        const approvedLeaves = leaveRequests.filter(r => r.status === 'approved');
                                        const usedDaysMap: Record<string, number> = {};
                                        
                                        approvedLeaves.forEach(req => {
                                            const key = `${req.userId}-${req.type}`;
                                            const diffTime = Math.abs(req.endDate - req.startDate);
                                            const duration = req.isHalfDay ? 0.5 : Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
                                            usedDaysMap[key] = (usedDaysMap[key] || 0) + duration;
                                        });

                                        return leaveRequests.map((l, index) => {
                                            // Try to find user by ID, or fallback to matching name via employment contract
                                            const user = findUserByEmployeeName(l.employeeName, users, jobApplications) ||
                                                         users.find(u => u.id === l.userId) || 
                                                         users.find(u => employmentContracts.some(c => c.userId === u.id && c.employeeName === l.employeeName));
                                            
                                            const quotas = user?.leaveQuotas ?? { sick: 0, personal: 0, vacation: 0 };
                                            const remainingDays = quotas[l.type as keyof typeof quotas] ?? 0;

                                            return (
                                            <tr key={l.id || index} className="hover:bg-gray-700/50">
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
                                                    {l.startDate && !isNaN(new Date(l.startDate).getTime()) ? new Date(l.startDate).toLocaleDateString('th-TH') : '-'} - {l.endDate && !isNaN(new Date(l.endDate).getTime()) ? new Date(l.endDate).toLocaleDateString('th-TH') : '-'}
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
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- GOAL TAB --- */}
                {activeTab === 'goal' && (
                    <div className="space-y-6 text-white">
                        {/* 1. PEER EVALUATION ALERT BANNER (PERSISTENT POPUP UNTIL DISMISSED) */}
                        {(() => {
                            const pendingPeerGoals = deduplicatedEmployeeGoals.filter(g => 
                                g.userId !== (currentUser?.id?.toString() || currentUser?.username) &&
                                g.status === 'pending_evaluation' &&
                                g.branchIds.some(bid => bid === branchId || currentUser?.allowedBranchIds?.includes(Number(bid))) &&
                                !(g.peerEvaluations?.some(pe => pe.evaluatorId === currentUser?.id?.toString()))
                            );

                            if (pendingPeerGoals.length === 0 || !showEvalAlert) return null;

                            return (
                                <div className="bg-gradient-to-r from-amber-600 to-orange-700 text-white p-4 rounded-xl shadow-2xl relative border border-amber-500 animate-pulse flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">🚨</span>
                                        <div>
                                            <h4 className="font-bold text-lg">มีเป้าหมายของเพื่อนร่วมงานที่รอให้คุณประเมิน!</h4>
                                            <p className="text-sm opacity-90">คุณมีเป้าหมายของเพื่อนพนักงานในสาขาเดียวกันจำนวน <strong>{pendingPeerGoals.length} คน</strong> ที่ครบกำหนด 6 เดือน และกำลังรอผลประเมินจากเพื่อนร่วมงาน</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => {
                                                // Automatically select the first peer to evaluate
                                                setEvaluatingGoal(pendingPeerGoals[0]);
                                                // Init scores
                                                const initialScores: Record<string, number> = {};
                                                pendingPeerGoals[0].items.forEach(it => {
                                                    initialScores[it.id] = 10; // Default to 10 max
                                                });
                                                setEvalScores(initialScores);
                                            }} 
                                            className="bg-white text-orange-950 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-orange-100 transition-colors shadow"
                                        >
                                            ร่วมประเมินเลย
                                        </button>
                                        <button 
                                            onClick={() => setShowEvalAlert(false)} 
                                            className="text-white hover:text-amber-200 p-1 rounded-full hover:bg-black/10 transition-colors"
                                            title="ปิดข้อความแจ้งเตือน"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* 2. ADMIN & BRANCH MANAGER DASHBOARD */}
                        {(currentUser?.role === 'admin' || currentUser?.role === 'branch-admin') && (
                            <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-700 space-y-4">
                                <div className="flex justify-between items-center flex-wrap gap-3">
                                    <div>
                                        <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                            <span className="text-yellow-500">👑</span> แผงควบคุมเป้าหมายพนักงาน (Admin/Manager Dashboard)
                                        </h2>
                                        <p className="text-xs text-gray-400">จัดการ ตั้งค่าเป้าหมาย และอนุมัติเกรดประเมินผลการทำงาน of พนักงาน</p>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">กรองสาขา:</span>
                                        <select 
                                            value={branchId || ''} 
                                            className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                                            disabled
                                        >
                                            <option value={branchId || ''}>
                                                {branches.find(b => b.id === Number(branchId))?.name || `สาขา ${branchId}`}
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-gray-300">
                                        <thead className="bg-gray-800 text-gray-100 text-sm font-semibold uppercase">
                                            <tr>
                                                <th className="p-3">ชื่อพนักงาน</th>
                                                <th className="p-3">สาขาที่รับเป้าหมาย</th>
                                                <th className="p-3 text-center">จำนวนหัวข้อ</th>
                                                <th className="p-3">ความคืบหน้าของพนักงาน</th>
                                                <th className="p-3">เกรด / คะแนน</th>
                                                <th className="p-3">สถานะเป้าหมาย</th>
                                                <th className="p-3 text-right">การจัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800 text-sm">
                                            {deduplicatedEmployeeGoals.filter(g => g.branchIds.includes(branchId || '')).length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="p-8 text-center text-gray-500">
                                                        📭 ยังไม่มีข้อมูลเป้าหมายพนักงานที่ส่งมาในสาขานี้
                                                    </td>
                                                </tr>
                                            ) : (
                                                deduplicatedEmployeeGoals
                                                    .filter(g => g.branchIds.includes(branchId || ''))
                                                    .map(goal => {
                                                        const completedCount = goal.items.filter(it => it.status === 'completed').length;
                                                        const progressPercentage = goal.items.length > 0 
                                                            ? Math.round((completedCount / goal.items.length) * 100) 
                                                            : 0;

                                                        return (
                                                            <tr key={goal.id} className="hover:bg-gray-800/30 transition-colors">
                                                                <td className="p-3 font-semibold text-white">{goal.employeeName}</td>
                                                                <td className="p-3">
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {goal.branchIds.map(bId => {
                                                                            const bName = branches.find(b => b.id === Number(bId))?.name || `สาขา ${bId}`;
                                                                            return (
                                                                                <span key={bId} className="bg-blue-900/30 text-blue-300 text-[11px] px-1.5 py-0.5 rounded border border-blue-800">
                                                                                    {bName}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </td>
                                                                <td className="p-3 text-center font-mono font-bold text-gray-200">{goal.items.length} ข้อ</td>
                                                                <td className="p-3">
                                                                    <div className="space-y-1">
                                                                        <div className="flex justify-between text-xs text-gray-400">
                                                                            <span>ทำสำเร็จ {completedCount}/{goal.items.length}</span>
                                                                            <span>{progressPercentage}%</span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                                                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${progressPercentage}%` }}></div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="p-3">
                                                                    {goal.status === 'completed' ? (
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className={`h-7 w-7 flex items-center justify-center font-bold rounded-full ${
                                                                                goal.finalGrade === 'A' ? 'bg-emerald-600 text-white' :
                                                                                goal.finalGrade === 'B' ? 'bg-blue-600 text-white' :
                                                                                goal.finalGrade === 'C' ? 'bg-yellow-600 text-white' :
                                                                                'bg-red-600 text-white'
                                                                            }`}>
                                                                                {goal.finalGrade}
                                                                            </span>
                                                                            <span className="text-xs text-gray-400 font-mono">({goal.finalScore}%)</span>
                                                                        </div>
                                                                    ) : goal.status === 'pending_evaluation' && goal.peerEvaluations && goal.peerEvaluations.length > 0 ? (() => {
                                                                        const evals = goal.peerEvaluations;
                                                                        const peersCount = evals.length;
                                                                        const itemsCount = goal.items.length;
                                                                        const maxPoints = peersCount * itemsCount * 10;
                                                                        let earnedPoints = 0;
                                                                        evals.forEach(pe => {
                                                                            Object.values(pe.scores).forEach(score => {
                                                                                earnedPoints += score;
                                                                            });
                                                                        });
                                                                        const finalScorePercentage = maxPoints > 0 ? parseFloat(((earnedPoints / maxPoints) * 100).toFixed(2)) : 0;
                                                                        let autoGrade: 'A' | 'B' | 'C' | 'D' = 'D';
                                                                        if (finalScorePercentage >= 80) autoGrade = 'A';
                                                                        else if (finalScorePercentage >= 70) autoGrade = 'B';
                                                                        else if (finalScorePercentage >= 60) autoGrade = 'C';

                                                                        return (
                                                                            <div className="flex flex-col gap-0.5">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className={`h-6 w-6 text-xs flex items-center justify-center font-bold rounded-full ${
                                                                                        autoGrade === 'A' ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30' :
                                                                                        autoGrade === 'B' ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30' :
                                                                                        autoGrade === 'C' ? 'bg-yellow-600/30 text-yellow-400 border border-yellow-500/30' :
                                                                                        'bg-red-600/30 text-red-400 border border-red-500/30'
                                                                                    }`} title="เกรดแนะแนวคำนวณจากเพื่อนประเมิน">
                                                                                        {autoGrade}
                                                                                    </span>
                                                                                    <span className="text-xs text-blue-400 font-mono">({finalScorePercentage}%)</span>
                                                                                </div>
                                                                                <span className="text-[10px] text-gray-400 font-medium">เกรดแนะแนว</span>
                                                                            </div>
                                                                        );
                                                                    })() : (
                                                                        <span className="text-gray-500 text-xs">- รออนุมัติเกรด -</span>
                                                                    )}
                                                                </td>
                                                                <td className="p-3">
                                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                                        goal.status === 'draft' ? 'bg-gray-700 text-gray-300' :
                                                                        goal.status === 'pending_admin' ? 'bg-yellow-950 text-yellow-300 border border-yellow-800' :
                                                                        goal.status === 'active' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                                                                        goal.status === 'pending_evaluation' ? 'bg-orange-950 text-orange-300 border border-orange-800' :
                                                                        'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                                                    }`}>
                                                                        {goal.status === 'draft' ? 'แบบร่าง' :
                                                                         goal.status === 'pending_admin' ? 'รอ Set Goal / เริ่ม' :
                                                                         goal.status === 'active' ? 'กำลังดำเนินงาน 6 เดือน' :
                                                                         goal.status === 'pending_evaluation' ? 'รอประเมิน' :
                                                                         'อนุมัติและเสร็จสิ้น'}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3 text-right">
                                                                    <div className="flex justify-end gap-1.5">
                                                                        <button 
                                                                            onClick={() => setViewingGoalDetails(goal)} 
                                                                            className="bg-gray-800 hover:bg-gray-700 text-xs px-2.5 py-1.5 rounded text-gray-300 hover:text-white border border-gray-750"
                                                                            title="ดูรายละเอียดเป้าหมาย"
                                                                        >
                                                                            👁️ รายละเอียด
                                                                        </button>

                                                                        {isEditMode && currentUser?.role === 'admin' && (
                                                                            <button 
                                                                                onClick={() => {
                                                                                    setAdminEditingGoal(goal);
                                                                                    setAdminEditItems(goal.items.map(it => ({ ...it })));
                                                                                    setAdminEditBranches(goal.branchIds.map(Number));
                                                                                    setAdminEditStatus(goal.status);
                                                                                }} 
                                                                                className="bg-yellow-650 hover:bg-yellow-700 text-xs text-white px-2.5 py-1.5 rounded font-semibold flex items-center gap-1"
                                                                                title="แก้ไขเป้าหมายของพนักงานคนนี้"
                                                                            >
                                                                                ✍️ แก้ไขเป้าหมาย
                                                                            </button>
                                                                        )}

                                                                        {goal.status === 'pending_admin' && (
                                                                            <button 
                                                                                onClick={() => handleSetGoalActive(goal.id)} 
                                                                                className="bg-blue-600 hover:bg-blue-700 text-xs text-white px-2.5 py-1.5 rounded font-semibold flex items-center gap-1"
                                                                            >
                                                                                🎯 Set Goal
                                                                            </button>
                                                                        )}

                                                                        {goal.status === 'active' && (
                                                                            <button 
                                                                                onClick={() => handleSimulateExpired(goal.id)} 
                                                                                className="bg-amber-650 hover:bg-amber-700 text-xs text-white px-2.5 py-1.5 rounded flex items-center gap-1"
                                                                                title="เร่งเวลาจำลองครบ 6 เดือนทันที เพื่อทดสอบประเมิน"
                                                                            >
                                                                                ⚡ ครบ 6 เดือน
                                                                            </button>
                                                                        )}

                                                                        {goal.status === 'pending_evaluation' && (
                                                                            <button 
                                                                                onClick={() => {
                                                                                    setAdminGradingGoal(goal);
                                                                                    setAdminFeedback(goal.adminNote || '');
                                                                                    
                                                                                    const evals = goal.peerEvaluations || [];
                                                                                    const peersCount = evals.length;
                                                                                    const itemsCount = goal.items.length;
                                                                                    const maxPoints = peersCount * itemsCount * 10;
                                                                                    let earnedPoints = 0;
                                                                                    evals.forEach(pe => {
                                                                                        Object.values(pe.scores).forEach(score => {
                                                                                            earnedPoints += score;
                                                                                        });
                                                                                    });
                                                                                    const finalScorePercentage = maxPoints > 0 ? parseFloat(((earnedPoints / maxPoints) * 100).toFixed(2)) : 0;
                                                                                    let autoGrade: 'A' | 'B' | 'C' | 'D' = 'D';
                                                                                    if (finalScorePercentage >= 80) autoGrade = 'A';
                                                                                    else if (finalScorePercentage >= 70) autoGrade = 'B';
                                                                                    else if (finalScorePercentage >= 60) autoGrade = 'C';
                                                                                    setAdminSelectedGrade(autoGrade);
                                                                                }} 
                                                                                className="bg-emerald-600 hover:bg-emerald-700 text-xs text-white px-2.5 py-1.5 rounded font-semibold"
                                                                            >
                                                                                📊 สรุปเกรด
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* 3. INDIVIDUAL EMPLOYEE INTERACTIVE SCREEN */}
                        <div className="bg-gray-900/40 p-6 rounded-xl border border-gray-700 space-y-6">
                            {(() => {
                                const myGoal = deduplicatedEmployeeGoals.find(g => 
                                    g.userId === (currentUser?.id?.toString() || currentUser?.username)
                                );

                                // If the user is in creation/editing mode
                                const isDraftMode = draftGoalItems.length > 0;

                                if (isDraftMode) {
                                    return (
                                        <div className="space-y-4">
                                            <div className="border-b border-gray-800 pb-3 flex justify-between items-center">
                                                <div>
                                                    <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                                                        <span>📝</span> ขั้นตอนที่ 1: พนักงานตั้งเป้าหมายตัวเอง (Employee Goal Setting)
                                                    </h3>
                                                    <p className="text-xs text-gray-400">กรุณาป้อนเป้าหมายการทำงานส่วนตัวของคุณในแต่ละข้อให้ชัดเจน</p>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        setDraftGoalItems([]);
                                                        setGoalSelectedBranches([]);
                                                    }} 
                                                    className="text-gray-500 hover:text-gray-300 text-xs"
                                                >
                                                    ยกเลิก
                                                </button>
                                            </div>

                                            {/* Goal points list */}
                                            <div className="space-y-3">
                                                {draftGoalItems.map((item, idx) => (
                                                    <div key={item.id} className="flex flex-col sm:flex-row gap-3 sm:items-center bg-gray-800/40 p-3 rounded-lg border border-gray-800">
                                                        <div className="flex-grow flex items-center gap-2 w-full">
                                                            <span className="font-mono text-xs text-gray-500 w-14 shrink-0 whitespace-nowrap">ข้อที่ {idx + 1}:</span>
                                                            <input 
                                                                type="text" 
                                                                value={item.text} 
                                                                onChange={(e) => {
                                                                    const updated = [...draftGoalItems];
                                                                    updated[idx] = { ...updated[idx], text: e.target.value };
                                                                    setDraftGoalItems(updated);
                                                                }}
                                                                placeholder="ตัวอย่างเช่น: พัฒนาและเปิดใช้งานระบบบริการล้างจานอัตโนมัติสำเร็จ"
                                                                className="flex-grow bg-gray-800 text-white border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 min-w-0"
                                                            />
                                                        </div>
                                                        
                                                        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 border-t border-gray-850 sm:border-0 pt-2 sm:pt-0">
                                                            {/* Accomplished Toggles (Disabled during drafting stage, only editable during active evaluation phase) */}
                                                            <div className="flex gap-1">
                                                                <button 
                                                                    type="button"
                                                                    disabled={true}
                                                                    title="ปุ่มนี้จะสามารถกดเลือกได้เมื่อถึงช่วงเวลาประเมินผลเท่านั้น"
                                                                    className="px-2.5 py-1.5 sm:py-1 rounded text-xs font-semibold opacity-40 cursor-not-allowed transition-colors whitespace-nowrap bg-gray-800 text-gray-500"
                                                                >
                                                                    ทำสำเร็จ
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    disabled={true}
                                                                    title="ปุ่มนี้จะสามารถกดเลือกได้เมื่อถึงช่วงเวลาประเมินผลเท่านั้น"
                                                                    className="px-2.5 py-1.5 sm:py-1 rounded text-xs font-semibold opacity-40 cursor-not-allowed transition-colors whitespace-nowrap bg-gray-800 text-gray-500"
                                                                >
                                                                    ยังไม่สำเร็จ
                                                                </button>
                                                            </div>

                                                            {/* Trash button */}
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    setDraftGoalItems(draftGoalItems.filter((_, i) => i !== idx));
                                                                }}
                                                                className="text-red-400 hover:text-red-300 p-1.5 sm:p-1 rounded hover:bg-gray-800"
                                                                title="ลบเป้าหมายข้อนี้"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        setDraftGoalItems([...draftGoalItems, { id: Date.now().toString() + Math.random().toString(), text: '', status: 'not_completed' }]);
                                                    }}
                                                    className="w-full py-2 bg-gray-800 hover:bg-gray-750 text-blue-400 text-xs rounded-lg border border-dashed border-gray-700 font-semibold flex items-center justify-center gap-2"
                                                >
                                                    ➕ เพิ่มข้อเป้าหมายถัดไป
                                                </button>
                                            </div>

                                            {/* Branch selector checkboxes (Multi-branch support) */}
                                            <div className="bg-gray-800/20 p-4 rounded-lg border border-gray-800 space-y-2">
                                                <label className="text-sm font-bold text-gray-300 block">
                                                    🏢 ติ๊กเลือกสาขาที่ต้องการส่งเป้าหมาย (Multi-branch Support):
                                                </label>
                                                <p className="text-xs text-gray-500">เป้าหมายของคุณจะถูกส่งข้ามไปยังผู้ดูแลและเพื่อนร่วมสาขาตามสาขาที่คุณเลือก</p>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
                                                    {visibleBranches.map(b => (
                                                        <label key={b.id} className="flex items-center gap-2 text-sm bg-gray-800 p-2.5 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-750 transition-colors">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={goalSelectedBranches.includes(b.id)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setGoalSelectedBranches([...goalSelectedBranches, b.id]);
                                                                    } else {
                                                                        setGoalSelectedBranches(goalSelectedBranches.filter(id => id !== b.id));
                                                                    }
                                                                }}
                                                                className="rounded text-blue-600 focus:ring-blue-500 bg-gray-900 border-gray-700"
                                                            />
                                                            <span className="text-gray-300 font-medium">{b.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Submit actions */}
                                            <div className="flex gap-2 justify-end pt-2">
                                                <button 
                                                    onClick={() => {
                                                        setDraftGoalItems([]);
                                                        setGoalSelectedBranches([]);
                                                    }} 
                                                    className="bg-gray-850 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-gray-700"
                                                >
                                                    ยกเลิก
                                                </button>
                                                <button 
                                                    onClick={() => handleSaveGoalDraft(draftGoalItems, goalSelectedBranches)} 
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    💾 บันทึกแบบร่าง (Save Draft)
                                                </button>
                                                <button 
                                                    onClick={() => handleSubmitGoalToAdmin(draftGoalItems, goalSelectedBranches)} 
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg hover:shadow-emerald-900/30 transition-colors"
                                                >
                                                    🚀 ส่งเป้าหมายให้ผู้ดูแล (Submit Goal)
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                // If user already has a goal record in the system
                                if (myGoal) {
                                    const completedCount = myGoal.items.filter(it => it.status === 'completed').length;
                                    const progressPercentage = myGoal.items.length > 0 
                                        ? Math.round((completedCount / myGoal.items.length) * 100) 
                                        : 0;

                                    return (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-start flex-wrap gap-3 border-b border-gray-800 pb-3">
                                                <div>
                                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                                        <span>🎯</span> เป้าหมายการทำงานส่วนตัวของฉัน (My Personal Goals)
                                                    </h3>
                                                    <p className="text-xs text-gray-400">ติดตาม แก้ไขความคืบหน้า หรือรอดูคะแนนผลประเมินของคุณ</p>
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    {myGoal.status === 'draft' && (
                                                        <button 
                                                            onClick={() => {
                                                                setDraftGoalItems(myGoal.items);
                                                                setGoalSelectedBranches(myGoal.branchIds.map(Number));
                                                            }} 
                                                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
                                                        >
                                                            ✍️ แก้ไขแบบร่าง / ส่งผู้ดูแล
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status Header Cards */}
                                            {myGoal.status === 'pending_admin' && (
                                                <div className="bg-yellow-950/40 border border-yellow-800 p-4 rounded-xl text-yellow-300 text-sm">
                                                    ⏳ <strong>เป้าหมายของคุณส่งให้ผู้ดูแลแล้ว:</strong> อยู่ระหว่างรอผู้ดูแลหรือหัวหน้าสาขามากดตรวจและอนุมัติปุ่ม <strong>"Set Goal"</strong> เพื่อเริ่มต้นโครงการ 6 เดือนอย่างเป็นทางการ
                                                </div>
                                            )}

                                            {myGoal.status === 'active' && (
                                                <div className="bg-blue-950/40 border border-blue-800 p-4 rounded-xl text-blue-300 text-sm flex flex-col md:flex-row justify-between gap-4 md:items-center">
                                                    <div>
                                                        <strong>🌟 โครงการทำงาน 6 เดือนเริ่มแล้ว:</strong> สัญญาเป้าหมายมีผลตั้งแต่ <strong>{myGoal.startDate}</strong> ถึง <strong>{myGoal.endDate}</strong>
                                                        <p className="text-xs text-gray-400 mt-1">คุณสามารถอัปเดตสถานะเป้าหมายของคุณด้านล่างระหว่างทำงานได้ตลอดเวลา</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleSimulateExpired(myGoal.id)} 
                                                        className="bg-amber-650 hover:bg-amber-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 self-start whitespace-nowrap"
                                                        title="ปุ่มนี้สร้างขึ้นเพื่อให้พนักงานสามารถจำลองจำลองสิทธิ์เมื่อเวลาครบ 6 เดือน เพื่อเปิดให้เพื่อนๆ ประเมินเป้าหมายของคุณได้ทันทีโดยไม่ต้องรอจริง 6 เดือน"
                                                    >
                                                        ⚡ จำลองครบ 6 เดือน
                                                    </button>
                                                </div>
                                            )}

                                            {myGoal.status === 'pending_evaluation' && (
                                                <div className="bg-orange-950/40 border border-orange-850 p-4 rounded-xl text-orange-300 text-sm">
                                                    ⏳ <strong>เป้าหมายครบกำหนด 6 เดือนแล้ว:</strong> ระบบกำลังเปิดโอกาสให้เพื่อนร่วมงานคนอื่นๆ ในสาขาเดียวกัน เข้ามาร่วมประเมินความเห็นการทำสำเร็จในแต่ละข้อเป้าหมายของคุณ
                                                    <p className="text-xs text-gray-400 mt-1">ปัจจุบันมีเพื่อนประเมินแล้วจำนวน <strong>{myGoal.peerEvaluations?.length || 0} คน</strong></p>
                                                </div>
                                            )}

                                            {myGoal.status === 'completed' && (
                                                <div className="bg-emerald-950/40 border border-emerald-800 p-5 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                                    <div className="space-y-1">
                                                        <h4 className="text-emerald-400 font-bold text-lg flex items-center gap-2">
                                                            <span>🎉</span> บันทึกการประเมินเสร็จสมบูรณ์แล้ว!
                                                        </h4>
                                                        <p className="text-sm text-gray-300">เป้าหมายของคุณได้รับการอนุมัติและจัดเกรดจากทางผู้ดูแลเรียบร้อย</p>
                                                        {myGoal.adminNote && (
                                                            <div className="mt-2 text-xs bg-black/20 p-2.5 rounded-lg border border-emerald-900/30 text-gray-400">
                                                                <strong>ข้อแนะนำจากผู้ดูแล:</strong> "{myGoal.adminNote}"
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="bg-emerald-900/30 border border-emerald-800 p-4 rounded-xl text-center min-w-[120px]">
                                                        <div className="text-xs text-emerald-400 uppercase tracking-wider font-bold">ผลการประเมิน</div>
                                                        <div className="text-4xl font-extrabold text-white my-1">{myGoal.finalGrade}</div>
                                                        <div className="text-xs text-gray-400 font-mono">({myGoal.finalScore}%)</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Goals Progress and Interactive Accomplishment List */}
                                            <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-800 space-y-4">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-gray-300">ความก้าวหน้าการทำเป้าหมายสำเร็จด้วยตนเอง:</span>
                                                    <span className="text-emerald-400 font-bold">{progressPercentage}% ({completedCount}/{myGoal.items.length} ข้อ)</span>
                                                </div>
                                                <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                                                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${progressPercentage}%` }}></div>
                                                </div>

                                                <div className="space-y-2 pt-2">
                                                    {myGoal.items.map((it, index) => (
                                                        <div key={it.id} className="flex justify-between items-center bg-gray-950/40 p-3.5 rounded-lg border border-gray-800 gap-4 flex-wrap md:flex-nowrap">
                                                            <div className="space-y-1">
                                                                <span className="text-xs text-gray-500 font-mono block">เป้าหมายข้อที่ {index + 1}</span>
                                                                <span className="text-gray-200 text-sm font-medium">{it.text}</span>
                                                            </div>

                                                            {/* If active, employee can toggle status */}
                                                            {myGoal.status === 'active' ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button 
                                                                        onClick={() => handleToggleActiveItemStatus(myGoal, index)} 
                                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                                            it.status === 'completed'
                                                                                ? 'bg-emerald-600 text-white shadow shadow-emerald-950'
                                                                                : 'bg-gray-800 text-gray-500 hover:bg-gray-750'
                                                                        }`}
                                                                    >
                                                                        ✓ ทำสำเร็จแล้ว
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleToggleActiveItemStatus(myGoal, index)} 
                                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                                                            it.status === 'not_completed'
                                                                                ? 'bg-red-600 text-white shadow shadow-red-950'
                                                                                : 'bg-gray-800 text-gray-500 hover:bg-gray-750'
                                                                        }`}
                                                                    >
                                                                        ✗ ยังไม่สำเร็จ
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                                                                    it.status === 'completed' 
                                                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' 
                                                                        : 'bg-gray-800 text-gray-400'
                                                                }`}>
                                                                    {it.status === 'completed' ? '✓ ทำสำเร็จแล้ว' : '✗ ยังไม่สำเร็จ'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                // If no goals whatsoever are set by user yet
                                return (
                                    <div className="py-12 text-center max-w-md mx-auto space-y-4">
                                        <div className="text-5xl text-blue-500 animate-bounce">🎯</div>
                                        <div>
                                            <h3 className="text-lg font-bold">คุณยังไม่มีเป้าหมายของคุณในระบบ</h3>
                                            <p className="text-xs text-gray-400 mt-1">เริ่มต้นร่างเป้าหมายส่วนตัวของคุณในการปฏิบัติงานรอบ 6 เดือนถัดไป เพื่อรับการประเมินจากเพื่อนร่วมงานและเลื่อนตำแหน่ง/รางวัล</p>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setDraftGoalItems([{ id: Date.now().toString(), text: '', status: 'not_completed' }]);
                                                const defaultBranchIds = visibleBranches.length > 0 
                                                    ? visibleBranches.map(b => b.id) 
                                                    : [Number(branchId)];
                                                setGoalSelectedBranches(defaultBranchIds);
                                            }} 
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg hover:shadow-blue-900/30 transition-all border border-blue-500"
                                        >
                                            + เริ่มต้นร่างเป้าหมายของฉัน (Goal Setting)
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* 4. PEER EVALUATION PORTAL (EVALUATING OTHER EMPLOYEES IN BRANCH) */}
                        {currentUser && (
                            <div className="bg-gray-900/40 p-6 rounded-xl border border-gray-700 space-y-4">
                                <div>
                                    <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                                        <span>👥</span> รายการเป้าหมายเพื่อนร่วมงาน (Peer Goals for Evaluation)
                                    </h3>
                                    <p className="text-xs text-gray-400">เมื่อเพื่อนร่วมงานครบกำหนด 6 เดือน ระบบจะเปิดให้พนักงานในสาขาเดียวกันโหวตและให้คะแนนการทำเป้าหมายสำเร็จ</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {deduplicatedEmployeeGoals
                                        .filter(g => 
                                            g.userId !== (currentUser?.id?.toString() || currentUser?.username) &&
                                            (g.status === 'pending_evaluation' || g.status === 'active') &&
                                            g.branchIds.some(bid => bid === branchId || currentUser?.allowedBranchIds?.includes(Number(bid)))
                                        )
                                        .map(peerGoal => {
                                            const alreadyEvaluated = peerGoal.peerEvaluations?.some(pe => pe.evaluatorId === currentUser?.id?.toString());

                                            return (
                                                <div key={peerGoal.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center gap-4 hover:border-gray-600 transition-colors">
                                                    <div>
                                                        <h4 className="font-semibold text-white text-sm">{peerGoal.employeeName}</h4>
                                                        <p className="text-xs text-gray-400 mt-0.5">สถานะ: <span className="text-amber-400">{peerGoal.status === 'active' ? 'กำลังปฏิบัติงาน (เร่งเวลาก่อนครบ 6 เดือนได้)' : 'ครบ 6 เดือน (รอประเมิน)'}</span></p>
                                                        <p className="text-xs text-gray-500">จำนวนเป้าหมาย: {peerGoal.items.length} ข้อ</p>
                                                    </div>

                                                    <div>
                                                        {alreadyEvaluated ? (
                                                            <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 text-xs px-2.5 py-1.5 rounded-lg font-medium">
                                                                ✓ ประเมินแล้ว
                                                            </span>
                                                        ) : (
                                                            <button 
                                                                onClick={() => {
                                                                    setEvaluatingGoal(peerGoal);
                                                                    const initialScores: Record<string, number> = {};
                                                                    peerGoal.items.forEach(it => {
                                                                        initialScores[it.id] = 10; // Default to 10 max
                                                                    });
                                                                    setEvalScores(initialScores);
                                                                }} 
                                                                className="bg-blue-600 hover:bg-blue-700 text-xs text-white px-3 py-1.5 rounded-lg font-semibold"
                                                            >
                                                                ✍️ ประเมินเป้าหมาย
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                    {deduplicatedEmployeeGoals.filter(g => 
                                        g.userId !== (currentUser?.id?.toString() || currentUser?.username) &&
                                        (g.status === 'pending_evaluation' || g.status === 'active') &&
                                        g.branchIds.some(bid => bid === branchId || currentUser?.allowedBranchIds?.includes(Number(bid)))
                                    ).length === 0 && (
                                        <div className="col-span-full bg-gray-800/10 p-6 text-center text-gray-500 text-xs border border-dashed border-gray-800 rounded-xl">
                                            🍃 ไม่มีเป้าหมายเพื่อนร่วมงานอื่นกำลังรอประเมินหรือกำลังปฏิบัติงานในขณะนี้
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- MODAL: PEER EVALUATION INPUT FORM --- */}
                        {evaluatingGoal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-white">
                                    <div className="flex justify-between items-start border-b border-gray-700 pb-3">
                                        <div>
                                            <h3 className="text-lg font-bold text-white">✍️ ร่วมประเมินเป้าหมายพนักงาน</h3>
                                            <p className="text-xs text-gray-400">เป้าหมายของ <strong>{evaluatingGoal.employeeName}</strong></p>
                                        </div>
                                        <button 
                                            onClick={() => setEvaluatingGoal(null)} 
                                            className="text-gray-400 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/30 p-2.5 rounded-lg leading-relaxed">
                                            💡 กรุณาให้คะแนนเป้าหมายแต่ละข้อของพนักงานบนระดับ <strong>1 ถึง 10 คะแนน</strong> (10 คะแนนหมายถึง ทำข้อนั้นสำเร็จยอดเยี่ยม, 1 คะแนนหมายถึง ไม่สำเร็จเลยหรือทำได้น้อยมาก)
                                        </p>

                                        {evaluatingGoal.items.map((it, idx) => (
                                            <div key={it.id} className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 space-y-3">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div>
                                                        <span className="text-xs text-gray-500 font-mono block">ข้อเป้าหมายที่ {idx + 1}</span>
                                                        <p className="text-gray-200 font-medium text-sm mt-0.5">{it.text}</p>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold flex-shrink-0 ${
                                                        it.status === 'completed' ? 'bg-emerald-950 text-emerald-400' : 'bg-gray-800 text-gray-500'
                                                    }`}>
                                                        {it.status === 'completed' ? 'พนักงานรายงาน: สำเร็จ' : 'พนักงานรายงาน: ยังไม่สำเร็จ'}
                                                    </span>
                                                </div>

                                                {/* 1-10 tactile rating circles */}
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[11px] text-gray-400">
                                                        <span>ปรับปรุง (1 คะแนน)</span>
                                                        <span>ดีเยี่ยม (10 คะแนน)</span>
                                                    </div>
                                                    <div className="flex justify-between gap-1 overflow-x-auto pb-1">
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(score => (
                                                            <button 
                                                                key={score} 
                                                                type="button"
                                                                onClick={() => setEvalScores({ ...evalScores, [it.id]: score })}
                                                                className={`h-8 w-8 text-xs font-bold rounded-full transition-all flex items-center justify-center border flex-shrink-0 ${
                                                                    evalScores[it.id] === score 
                                                                        ? 'bg-blue-600 text-white border-blue-500 scale-110 shadow-lg'
                                                                        : 'bg-gray-800 hover:bg-gray-750 text-gray-400 border-gray-700'
                                                                }`}
                                                            >
                                                                {score}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-700">
                                        <button 
                                            onClick={() => setEvaluatingGoal(null)} 
                                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button 
                                            onClick={() => handleSubmitEvaluation(evaluatingGoal, evalScores)} 
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                                        >
                                            🚀 บันทึกการประเมิน
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- MODAL: ADMIN GRADING & APPROVE FORM --- */}
                        {adminGradingGoal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-white">
                                    <div className="flex justify-between items-start border-b border-gray-700 pb-3">
                                        <div>
                                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                <span>📊</span> ประเมินคะแนน & บันทึกเกรด (Grade & Approve)
                                            </h3>
                                            <p className="text-xs text-gray-400">ตรวจสอบเป้าหมายของ <strong>{adminGradingGoal.employeeName}</strong></p>
                                        </div>
                                        <button 
                                            onClick={() => setAdminGradingGoal(null)} 
                                            className="text-gray-400 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Statistical Summary */}
                                        {(() => {
                                            const evals = adminGradingGoal.peerEvaluations || [];
                                            const peersCount = evals.length;
                                            const itemsCount = adminGradingGoal.items.length;
                                            const maxPoints = peersCount * itemsCount * 10;
                                            
                                            let earnedPoints = 0;
                                            evals.forEach(pe => {
                                                Object.values(pe.scores).forEach(score => {
                                                    earnedPoints += score;
                                                });
                                            });

                                            const finalScorePercentage = maxPoints > 0 
                                                ? parseFloat(((earnedPoints / maxPoints) * 100).toFixed(2)) 
                                                : 0;
                                            
                                            let autoGrade: 'A' | 'B' | 'C' | 'D' = 'D';
                                            if (finalScorePercentage >= 80) autoGrade = 'A';
                                            else if (finalScorePercentage >= 70) autoGrade = 'B';
                                            else if (finalScorePercentage >= 60) autoGrade = 'C';

                                            return (
                                                <div className="space-y-4">
                                                    <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-700 grid grid-cols-3 gap-3 text-center">
                                                        <div>
                                                            <div className="text-xs text-gray-400">จำนวนเพื่อนประเมิน</div>
                                                            <div className="text-xl font-bold text-white mt-1">{peersCount} คน</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-gray-400">คะแนนเฉลี่ย</div>
                                                            <div className="text-xl font-bold text-blue-400 mt-1">{finalScorePercentage}%</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-gray-400">เกรดที่คำนวณได้</div>
                                                            <div className="text-xl font-extrabold text-emerald-400 mt-1">{autoGrade}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center bg-emerald-950/20 border border-emerald-900/40 px-4 py-3 rounded-xl gap-4">
                                                        <div className="flex items-center gap-2 text-xs text-emerald-400">
                                                            <span>💡</span>
                                                            <span>ระบบแนะนำให้ประเมินเกรด <strong>{autoGrade}</strong> ({finalScorePercentage}%) จากผลคะแนนเฉลี่ย</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAdminSelectedGrade(autoGrade)}
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-xs text-white font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                                                        >
                                                            🎯 สรุปเกรดตามที่แสดงผล
                                                        </button>
                                                    </div>

                                                    {/* Peer details breakdown */}
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">คะแนนรายข้อเฉลี่ยที่ประเมินโดยเพื่อนพนักงาน:</h4>
                                                        <div className="space-y-2 max-h-[20vh] overflow-y-auto pr-1 text-gray-100">
                                                            {adminGradingGoal.items.map((it, idx) => {
                                                                let totalItemScore = 0;
                                                                evals.forEach(pe => {
                                                                    totalItemScore += (pe.scores[it.id] || 0);
                                                                });
                                                                const avgItemScore = peersCount > 0 
                                                                    ? parseFloat((totalItemScore / peersCount).toFixed(1)) 
                                                                    : 0;

                                                                return (
                                                                    <div key={it.id} className="bg-gray-900/30 p-2.5 rounded-lg border border-gray-750 flex justify-between items-center text-xs">
                                                                        <span className="text-gray-300 font-medium">{idx + 1}. {it.text}</span>
                                                                        <span className="text-blue-400 font-mono font-bold whitespace-nowrap bg-blue-900/10 px-2 py-0.5 rounded border border-blue-900/20">
                                                                            คะแนน {avgItemScore}/10
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Raw individual peer score breakdown (ONLY visible to admins/managers) */}
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1">
                                                            <span>🔒</span> คะแนนดิบรายบุคคล (เห็นเฉพาะ Admin/ผู้ดูแลสาขา):
                                                        </h4>
                                                        <div className="space-y-2 max-h-[20vh] overflow-y-auto pr-1">
                                                            {evals.length === 0 ? (
                                                                <div className="text-xs text-gray-500 italic p-2 bg-gray-900/20 rounded border border-dashed border-gray-800">
                                                                    ยังไม่มีพนักงานคนใดส่งผลประเมินในขณะนี้
                                                                </div>
                                                            ) : (
                                                                evals.map((pe, idx) => {
                                                                    const sumScore = Object.values(pe.scores).reduce((a, b) => a + b, 0);
                                                                    const totalItems = adminGradingGoal.items.length;
                                                                    const avgScore = totalItems > 0 ? (sumScore / totalItems).toFixed(1) : '0';

                                                                    return (
                                                                        <div key={idx} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/60 space-y-1.5 text-xs">
                                                                            <div className="flex justify-between items-center text-gray-300">
                                                                                <span className="font-semibold text-blue-400">👤 {pe.evaluatorName} (ID: {pe.evaluatorId})</span>
                                                                                <span className="font-mono text-[11px] bg-gray-800 px-2 py-0.5 rounded text-gray-400">
                                                                                    เฉลี่ย: {avgScore}/10 คะแนน
                                                                                </span>
                                                                            </div>
                                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-3 border-l-2 border-blue-500/50">
                                                                                {adminGradingGoal.items.map((it, itemIdx) => (
                                                                                    <div key={it.id} className="text-[11px] text-gray-400 truncate" title={`${itemIdx + 1}. ${it.text}`}>
                                                                                        ข้อที่ {itemIdx + 1}: <span className="font-semibold text-white">{pe.scores[it.id] || 0}/10</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Manual Grade Selection Buttons (Override) */}
                                                    <div className="space-y-2 pt-2 border-t border-gray-700/60">
                                                        <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                                                            เลือกสรุปเกรดที่จะบันทึกผล (Grade Adjustment):
                                                        </label>
                                                        <div className="flex gap-2">
                                                            {(['A', 'B', 'C', 'D'] as const).map((grade) => (
                                                                <button
                                                                    key={grade}
                                                                    type="button"
                                                                    onClick={() => setAdminSelectedGrade(grade)}
                                                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                                                                        adminSelectedGrade === grade
                                                                            ? grade === 'A' ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg scale-[1.02]' :
                                                                              grade === 'B' ? 'bg-blue-600 text-white border-blue-500 shadow-lg scale-[1.02]' :
                                                                              grade === 'C' ? 'bg-yellow-600 text-white border-yellow-500 shadow-lg scale-[1.02]' :
                                                                              'bg-red-600 text-white border-red-500 shadow-lg scale-[1.02]'
                                                                            : 'bg-gray-900/60 hover:bg-gray-900 border-gray-700 text-gray-400'
                                                                    }`}
                                                                >
                                                                    เกรด {grade} {grade === autoGrade ? '(แนะนำ)' : ''}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Admin Feedback Box */}
                                                    <div className="space-y-1.5">
                                                        <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                                                            ข้อแนะนำและคำติชมจากผู้ดูแล:
                                                        </label>
                                                        <textarea 
                                                            value={adminFeedback}
                                                            onChange={(e) => setAdminFeedback(e.target.value)}
                                                            placeholder="ตัวอย่าง: ทำเป้าหมายสำเร็จได้ยอดเยี่ยมมากครับ มีผลงานล้างจานประทับใจพนักงานทุกคน ขอให้รักษามาตรฐานนี้ไว้เพื่อโอกาสขึ้นโบนัสรอบปี..."
                                                            className="w-full bg-gray-900 text-white border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 h-24"
                                                        />
                                                    </div>

                                                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-700">
                                                        <button 
                                                            onClick={() => setAdminGradingGoal(null)} 
                                                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
                                                        >
                                                            ยกเลิก
                                                        </button>
                                                        <button 
                                                            onClick={() => handleApproveAndGrade(adminGradingGoal, adminFeedback, adminSelectedGrade)} 
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-1 shadow-lg shadow-emerald-950/40"
                                                        >
                                                            <span>📝</span> สรุปเกรด & บันทึกผล ({adminSelectedGrade})
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- MODAL: VIEW GOAL DETAILS --- */}
                        {viewingGoalDetails && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-white">
                                    <div className="flex justify-between items-start border-b border-gray-700 pb-3">
                                        <div>
                                            <h3 className="text-lg font-bold text-white">👁️ รายละเอียดและประวัติเป้าหมาย</h3>
                                            <p className="text-xs text-gray-400">เป้าหมายของ <strong>{viewingGoalDetails.employeeName}</strong></p>
                                        </div>
                                        <button 
                                            onClick={() => setViewingGoalDetails(null)} 
                                            className="text-gray-400 hover:text-white"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3 text-xs bg-gray-900/40 p-3 rounded-lg text-gray-400 border border-gray-700">
                                            <div>สถานะ: <span className="font-bold text-white">{viewingGoalDetails.status}</span></div>
                                            <div>สร้างเมื่อ: <span className="font-bold text-white">{new Date(viewingGoalDetails.createdAt).toLocaleDateString('th-TH')}</span></div>
                                            {viewingGoalDetails.startDate && (
                                                <>
                                                    <div>วันเริ่มสัญญา: <span className="font-bold text-white">{viewingGoalDetails.startDate}</span></div>
                                                    <div>วันสิ้นสุดสัญญา: <span className="font-bold text-white">{viewingGoalDetails.endDate}</span></div>
                                                </>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <h4 className="text-sm font-semibold text-gray-300">รายการเป้าหมายรายข้อ:</h4>
                                            <div className="space-y-2">
                                                {viewingGoalDetails.items.map((it, idx) => (
                                                    <div key={it.id} className="bg-gray-900/30 p-3 rounded-lg border border-gray-750 flex justify-between items-center gap-4 text-sm">
                                                        <span className="text-gray-200">{idx + 1}. {it.text}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold flex-shrink-0 ${
                                                            it.status === 'completed' ? 'bg-emerald-950 text-emerald-400' : 'bg-gray-800 text-gray-500'
                                                        }`}>
                                                            {it.status === 'completed' ? 'ทำสำเร็จ' : 'ยังไม่สำเร็จ'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {viewingGoalDetails.peerEvaluations && viewingGoalDetails.peerEvaluations.length > 0 && (
                                            <div className="space-y-2 border-t border-gray-700/60 pt-4">
                                                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1">
                                                    <span>👥</span> ผลประเมินจากเพื่อนร่วมงาน:
                                                </h4>
                                                <div className="space-y-2 max-h-[22vh] overflow-y-auto pr-1">
                                                    {viewingGoalDetails.peerEvaluations.map((pe, idx) => {
                                                        const sumScore = Object.values(pe.scores).reduce((a, b) => a + b, 0);
                                                        const totalItems = viewingGoalDetails.items.length;
                                                        const avgScore = totalItems > 0 ? (sumScore / totalItems).toFixed(1) : '0';
                                                        const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'branch-admin';
                                                        const displayName = isAdminOrManager 
                                                            ? `👤 ${pe.evaluatorName} (ID: ${pe.evaluatorId})` 
                                                            : `👤 ผู้ร่วมประเมินคนที่ ${idx + 1} (ไม่เปิดเผยตัวตน)`;

                                                        return (
                                                            <div key={idx} className="bg-gray-900/40 p-3 rounded-lg border border-gray-750 space-y-1.5 text-xs">
                                                                <div className="flex justify-between items-center text-gray-300">
                                                                    <span className={`font-semibold ${isAdminOrManager ? 'text-blue-400' : 'text-gray-300'}`}>{displayName}</span>
                                                                    <span className="font-mono text-[11px] bg-gray-850 px-2 py-0.5 rounded text-gray-400">
                                                                        เฉลี่ย: {avgScore}/10 คะแนน
                                                                    </span>
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-3 border-l-2 border-gray-700">
                                                                    {viewingGoalDetails.items.map((it, itemIdx) => (
                                                                        <div key={it.id} className="text-[11px] text-gray-400 truncate" title={`${itemIdx + 1}. ${it.text}`}>
                                                                            ข้อที่ {itemIdx + 1}: <span className="font-semibold text-white">{pe.scores[it.id] || 0}/10</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {viewingGoalDetails.status === 'completed' && (
                                            <div className="bg-emerald-950/30 border border-emerald-900/30 p-4 rounded-xl space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-bold text-emerald-400">ผลการประเมินรอบเป้าหมาย:</span>
                                                    <span className="text-2xl font-black text-white bg-emerald-600 px-3 py-1 rounded-lg">เกรด {viewingGoalDetails.finalGrade}</span>
                                                </div>
                                                <div className="text-xs text-gray-300 mt-1">
                                                    คะแนนรวมเฉลี่ยที่ได้: <strong>{viewingGoalDetails.finalScore}%</strong>
                                                </div>
                                                {viewingGoalDetails.adminNote && (
                                                    <div className="text-xs text-gray-400 bg-black/25 p-2.5 rounded-lg border border-emerald-900/30">
                                                        <strong>ข้อเสนอแนะจากผู้ดูแล:</strong> "{viewingGoalDetails.adminNote}"
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end pt-3 border-t border-gray-700">
                                        <button 
                                            onClick={() => setViewingGoalDetails(null)} 
                                            className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg text-sm"
                                        >
                                            ปิดหน้าต่าง
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- MODAL: ADMIN EDIT EMPLOYEE GOAL --- */}
                        {adminEditingGoal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-white">
                                    <div className="flex justify-between items-start border-b border-gray-700 pb-3">
                                        <div>
                                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                <span>✍️</span> แก้ไขและจัดการเป้าหมายพนักงาน (โหมดผู้ดูแลระบบ)
                                            </h3>
                                            <p className="text-xs text-gray-400">กำลังแก้ไขเป้าหมายของ <strong>{adminEditingGoal.employeeName}</strong></p>
                                        </div>
                                        <button 
                                            onClick={() => setAdminEditingGoal(null)} 
                                            className="text-gray-400 hover:text-white text-lg"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {/* 1. Goal Items List */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-gray-300 block">
                                                🎯 รายการเป้าหมายพนักงาน (Goal Items):
                                            </label>
                                            <div className="space-y-3">
                                                {adminEditItems.map((item, idx) => (
                                                    <div key={item.id} className="flex flex-col sm:flex-row gap-3 sm:items-center bg-gray-900/40 p-3 rounded-lg border border-gray-700">
                                                        <div className="flex-grow flex items-center gap-2 w-full">
                                                            <span className="font-mono text-xs text-gray-500 w-14 shrink-0 whitespace-nowrap">ข้อที่ {idx + 1}:</span>
                                                            <input 
                                                                type="text" 
                                                                value={item.text} 
                                                                onChange={(e) => {
                                                                    const updated = [...adminEditItems];
                                                                    updated[idx] = { ...updated[idx], text: e.target.value };
                                                                    setAdminEditItems(updated);
                                                                }}
                                                                placeholder="ป้อนรายละเอียดเป้าหมาย..."
                                                                className="flex-grow bg-gray-800 text-white border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 min-w-0"
                                                            />
                                                        </div>
                                                        
                                                        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 border-t border-gray-850 sm:border-0 pt-2 sm:pt-0">
                                                            {/* Accomplished Toggles */}
                                                            <div className="flex gap-1">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updated = [...adminEditItems];
                                                                        updated[idx] = { ...updated[idx], status: 'completed' };
                                                                        setAdminEditItems(updated);
                                                                    }}
                                                                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                                                        item.status === 'completed'
                                                                            ? 'bg-emerald-600 text-white font-bold'
                                                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                                    }`}
                                                                >
                                                                    สำเร็จ
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const updated = [...adminEditItems];
                                                                        updated[idx] = { ...updated[idx], status: 'not_completed' };
                                                                        setAdminEditItems(updated);
                                                                    }}
                                                                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                                                        item.status === 'not_completed'
                                                                            ? 'bg-red-650 text-white font-bold'
                                                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                                    }`}
                                                                >
                                                                    ยังไม่สำเร็จ
                                                                </button>
                                                            </div>

                                                            {/* Trash button */}
                                                            <button 
                                                                type="button"
                                                                onClick={() => {
                                                                    setAdminEditItems(adminEditItems.filter((_, i) => i !== idx));
                                                                }}
                                                                className="text-red-400 hover:text-red-300 p-1.5 sm:p-1 rounded hover:bg-gray-800/60"
                                                                title="ลบเป้าหมายข้อนี้"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        setAdminEditItems([...adminEditItems, { id: Date.now().toString() + Math.random().toString(), text: '', status: 'not_completed' }]);
                                                    }}
                                                    className="w-full py-2 bg-gray-900 hover:bg-gray-850 text-blue-400 text-xs rounded-lg border border-dashed border-gray-700 font-semibold flex items-center justify-center gap-2"
                                                >
                                                    ➕ เพิ่มเป้าหมายพนักงานข้อใหม่
                                                </button>
                                            </div>
                                        </div>

                                        {/* 2. Branch selector checkboxes (Multi-branch support) */}
                                        <div className="bg-gray-900/20 p-4 rounded-xl border border-gray-700 space-y-2">
                                            <label className="text-sm font-bold text-gray-300 block">
                                                🏢 สาขาที่ใช้งาน (Multi-branch Support):
                                            </label>
                                            <div className="grid grid-cols-2 gap-2 pt-1">
                                                {visibleBranches.map(b => (
                                                    <label key={b.id} className="flex items-center gap-2 text-xs bg-gray-900/60 p-2.5 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-750 transition-colors">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={adminEditBranches.includes(b.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setAdminEditBranches([...adminEditBranches, b.id]);
                                                                } else {
                                                                    setAdminEditBranches(adminEditBranches.filter(id => id !== b.id));
                                                                }
                                                            }}
                                                            className="rounded text-blue-600 focus:ring-blue-500 bg-gray-900 border-gray-700"
                                                        />
                                                        <span className="text-gray-300 font-medium">{b.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 3. Goal Status & Evaluation Config */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-bold text-gray-300 block">
                                                    ⏳ สถานะของเป้าหมาย:
                                                </label>
                                                <select
                                                    value={adminEditStatus}
                                                    onChange={(e) => {
                                                        const newStatus = e.target.value as EmployeeGoal['status'];
                                                        setAdminEditStatus(newStatus);
                                                    }}
                                                    className="w-full bg-gray-900 text-white border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="draft">แบบร่าง (Draft)</option>
                                                    <option value="pending_admin">รอ Set Goal / ตรวจสอบ (Pending Admin)</option>
                                                    <option value="active">กำลังดำเนินงาน 6 เดือน (Active)</option>
                                                    <option value="pending_evaluation">รอประเมินผล (Pending Evaluation)</option>
                                                    <option value="completed">เสร็จสมบูรณ์ / ตัดเกรดแล้ว (Completed)</option>
                                                </select>
                                            </div>

                                            {adminEditStatus === 'completed' && (
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-bold text-gray-300 block">
                                                        🏅 เกรดเป้าหมายสูงสุด:
                                                    </label>
                                                    <select
                                                        value={adminEditingGoal.finalGrade || 'C'}
                                                        onChange={(e) => {
                                                            setAdminEditingGoal({
                                                                ...adminEditingGoal,
                                                                finalGrade: e.target.value as 'A' | 'B' | 'C' | 'D'
                                                            });
                                                        }}
                                                        className="w-full bg-gray-900 text-white border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-500"
                                                    >
                                                        <option value="A">A (ดีเยี่ยม)</option>
                                                        <option value="B">B (ดี)</option>
                                                        <option value="C">C (พอใช้)</option>
                                                        <option value="D">D (ต้องปรับปรุง)</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        {adminEditStatus === 'completed' && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-bold text-gray-300 block">
                                                        📊 คะแนนประเมินรวม (%):
                                                    </label>
                                                    <input 
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={adminEditingGoal.finalScore ?? 80}
                                                        onChange={(e) => {
                                                            setAdminEditingGoal({
                                                                ...adminEditingGoal,
                                                                finalScore: Number(e.target.value)
                                                            });
                                                        }}
                                                        className="w-full bg-gray-900 text-white border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-blue-500"
                                                    />
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-sm font-bold text-gray-300 block">
                                                        📝 คำแนะนำผู้ดูแล/หัวหน้าสาขา:
                                                    </label>
                                                    <textarea 
                                                        value={adminEditingGoal.adminNote || ''}
                                                        onChange={(e) => {
                                                            setAdminEditingGoal({
                                                                ...adminEditingGoal,
                                                                adminNote: e.target.value
                                                            });
                                                        }}
                                                        placeholder="เพิ่มคำแนะนำเพื่อแนะแนวพนักงาน..."
                                                        rows={2}
                                                        className="w-full bg-gray-900 text-white border border-gray-700 rounded-lg p-2.5 text-xs focus:outline-none focus:border-blue-500"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2 justify-end pt-3 border-t border-gray-700">
                                        <button 
                                            onClick={() => setAdminEditingGoal(null)} 
                                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button 
                                            onClick={handleAdminSaveEditedGoal} 
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold"
                                        >
                                            🚀 บันทึกการแก้ไข
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    </div>
    );
};

export default HRManagementView;