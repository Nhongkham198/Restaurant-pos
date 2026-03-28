
import type { MenuItem, Table, Branch, User, StockItem, MaintenanceItem, DeliveryProvider, LeaveRequest, JobApplication, EmploymentContract } from './types';

export const DEFAULT_BRANCHES: Branch[] = [
    { id: 1, name: 'สาขากาฬสินธุ์', location: 'กาฬสินธุ์' },
    { id: 2, name: 'สาขากรุงเทพ', location: 'กรุงเทพมหานคร' }
];

export const DEFAULT_USERS: User[] = [
    { id: 1, username: 'admin', password: 'password', role: 'admin' },
    { id: 2, username: 'pos', password: 'password', role: 'pos', allowedBranchIds: [1] },
    { id: 3, username: 'kitchen', password: 'password', role: 'kitchen', allowedBranchIds: [1, 2, 3, 4] },
    { id: 4, username: 'manager', password: 'password', role: 'branch-admin', allowedBranchIds: [1] },
    { id: 5, username: 'Sam', password: '198', role: 'admin' },
    { id: 6, username: 'auditor', password: 'password', role: 'auditor', allowedBranchIds: [1] },
    { id: 7, username: 'Tal', password: 'password', role: 'staff', allowedBranchIds: [1] },
    { id: 8, username: 'Pea', password: 'password', role: 'staff', allowedBranchIds: [1] },
    { id: 9, username: 'Pam', password: 'password', role: 'staff', allowedBranchIds: [1] },
    { id: 10, username: 'Fah', password: 'password', role: 'staff', allowedBranchIds: [1] },
    { id: 11, username: 'Pim', password: 'password', role: 'staff', allowedBranchIds: [1] },
];

export const DEFAULT_JOB_APPLICATIONS: JobApplication[] = [
    { id: 1, fullName: 'รัตนา ทวิบุตร', nickname: 'Tal', position: 'แม่ครัว', expectedSalary: 12000, phoneNumber: '0812345678', email: 'tal@example.com', status: 'hired', applicationDate: new Date('2026-02-24').getTime(), userId: 7 },
    { id: 2, fullName: 'กนกร นา สินส่ง', nickname: 'Pea', position: 'พนักงานเตรียม', expectedSalary: 9000, phoneNumber: '0812345679', email: 'pea@example.com', status: 'hired', applicationDate: new Date('2026-02-24').getTime(), userId: 8 },
    { id: 3, fullName: 'พัชรัตน์ ดงรุ่ง', nickname: 'Pam', position: 'พนักงานเตรียมครัว', expectedSalary: 9000, phoneNumber: '0812345680', email: 'pam@example.com', status: 'hired', applicationDate: new Date('2026-02-24').getTime(), userId: 9 },
];

export const DEFAULT_EMPLOYMENT_CONTRACTS: EmploymentContract[] = [
    { id: 1, userId: 7, employeeName: 'รัตนา ทวิบุตร', position: 'แม่ครัว', salary: 12000, startDate: new Date('2026-02-24').getTime(), contractType: 'full-time', content: 'Standard Contract', createdDate: new Date('2026-02-24').getTime() },
    { id: 2, userId: 8, employeeName: 'กนกร นา สินส่ง', position: 'พนักงานเตรียม', salary: 9000, startDate: new Date('2026-02-24').getTime(), contractType: 'full-time', content: 'Standard Contract', createdDate: new Date('2026-02-24').getTime() },
    { id: 3, userId: 9, employeeName: 'พัชรัตน์ ดงรุ่ง', position: 'พนักงานเตรียมครัว', salary: 9000, startDate: new Date('2026-02-24').getTime(), contractType: 'full-time', content: 'Standard Contract', createdDate: new Date('2026-02-24').getTime() },
];

export const DEFAULT_DELIVERY_PROVIDERS: DeliveryProvider[] = [];

export const DEFAULT_MENU_ITEMS: MenuItem[] = [];

export const DEFAULT_FLOORS: string[] = [];

export const DEFAULT_TABLES: Table[] = [];

export const DEFAULT_CATEGORIES: string[] = [];
export const DEFAULT_STOCK_CATEGORIES: string[] = [];
export const DEFAULT_STOCK_UNITS: string[] = [];

// Get current month key for dummy data
const currentMonth = new Date().toISOString().slice(0, 7);

export const DEFAULT_STOCK_ITEMS: StockItem[] = [];

export const DEFAULT_LEAVE_REQUESTS: LeaveRequest[] = [];

export const DEFAULT_MAINTENANCE_ITEMS: MaintenanceItem[] = [];
