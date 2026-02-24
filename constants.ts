
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

export const DEFAULT_DELIVERY_PROVIDERS: DeliveryProvider[] = [
    { 
        id: 'lineman', 
        name: 'LineMan', 
        iconUrl: 'https://play-lh.googleusercontent.com/9t-Q8WmwJ8zXjHhEAgqM5f5zZk3G7y7yX9y3y3y3y3y3y3y3y3y3y3y3y3y3y3', // Placeholder, user will provide real ones usually
        color: '#10b981', // Green
        isEnabled: true,
        isDefault: true 
    },
    { 
        id: 'shopeefood', 
        name: 'ShopeeFood', 
        iconUrl: 'https://play-lh.googleusercontent.com/1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1', // Placeholder
        color: '#f97316', // Orange
        isEnabled: false,
        isDefault: true 
    },
    { 
        id: 'grabfood', 
        name: 'GrabFood', 
        iconUrl: '', 
        color: '#22c55e', // Green
        isEnabled: false,
        isDefault: true 
    },
    { 
        id: 'robinhood', 
        name: 'Robinhood', 
        iconUrl: '', 
        color: '#a855f7', // Purple
        isEnabled: false,
        isDefault: true 
    }
];

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
    { 
        id: 1, 
        name: 'ข้าวกะเพรา', 
        price: 60, 
        category: 'อาหารจานเดียว', 
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fkaprao.jpg?alt=media', 
        cookingTime: 5,
        isAvailable: true,
        optionGroups: [
            {
              id: 'meat',
              name: 'ประเภทเนื้อ (เลือก 1)',
              selectionType: 'single',
              required: true,
              options: [
                  { id: 'chicken', name: 'ไก่', priceModifier: 0, isDefault: true },
                  { id: 'pork', name: 'หมูสับ', priceModifier: 0 },
                  { id: 'crispy-pork', name: 'หมูกรอบ', priceModifier: 10 },
                  { id: 'beef', name: 'เนื้อ', priceModifier: 10 },
              ]
            },
            {
                id: 'spiciness',
                name: 'ความเผ็ด',
                selectionType: 'single',
                required: true,
                options: [
                    { id: 'not-spicy', name: 'ไม่เผ็ด', priceModifier: 0 },
                    { id: 'less-spicy', name: 'เผ็ดน้อย', priceModifier: 0 },
                    { id: 'normal-spicy', name: 'เผ็ดปกติ', priceModifier: 0, isDefault: true },
                    { id: 'very-spicy', name: 'เผ็ดมาก', priceModifier: 0 },
                ]
            },
            {
                id: 'topping',
                name: 'ท๊อปปิ้ง',
                selectionType: 'multiple',
                required: false,
                options: [
                    { id: 'special', name: 'พิเศษ', priceModifier: 15 },
                    { id: 'fried-egg-runny', name: 'ไข่ดาว (ไม่สุก)', priceModifier: 10 },
                    { id: 'fried-egg-cooked', name: 'ไข่ดาว (สุก)', priceModifier: 10 },
                    { id: 'omelette', name: 'ไข่เจียว', priceModifier: 15 },
                ]
            }
        ]
    },
    { id: 2, name: 'ข้าวผัดหมู', price: 60, category: 'อาหารจานเดียว', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Ffried-rice.jpg?alt=media', cookingTime: 7, isAvailable: true },
    { id: 3, name: 'เฟรนช์ฟรายส์', price: 45, category: 'ของทานเล่น', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Ffrench-fries.jpg?alt=media', cookingTime: 4, isAvailable: true },
    { id: 4, name: 'โค้ก', price: 20, category: 'เครื่องดื่ม', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fcoke.jpg?alt=media', cookingTime: 1, isAvailable: true },
    { id: 5, name: 'น้ำเปล่า', price: 15, category: 'เครื่องดื่ม', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fwater.jpg?alt=media', cookingTime: 1, isAvailable: true },
    { id: 6, name: 'ซุปกิมจิ', price: 150, category: 'อาหารเกาหลี', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fkimchi-jjigae.jpg?alt=media', cookingTime: 10, isAvailable: true },
    { id: 7, name: 'จาจังมยอน (บะหมี่ซอสดำ)', price: 160, category: 'อาหารเกาหลี', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fjajangmyeon.jpg?alt=media', cookingTime: 12, isAvailable: true },
    { id: 8, name: 'จาจังบับ (ข้าวหน้าซอสจาจัง)', price: 160, category: 'อาหารเกาหลี', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fjajangbap.jpg?alt=media', cookingTime: 12, isAvailable: true },
    { id: 9, name: 'ต๊อกบกกี (ต๊อกผัดซอสเกาหลี)', price: 120, category: 'อาหารเกาหลี', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Ftteokbokki.jpg?alt=media', cookingTime: 8, isAvailable: true },
    { id: 10, name: 'คิมมาริ (สาหร่ายห่อวุ้นเส้นทอด)', price: 90, category: 'ของทานเล่น', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fkimmari.jpg?alt=media', cookingTime: 7, isAvailable: true },
    { id: 11, name: 'กุนมันดู (เกี๊ยวทอดเกาหลี)', price: 90, category: 'ของทานเล่น', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fgun-mandu.jpg?alt=media', cookingTime: 7, isAvailable: true },
    { id: 12, name: 'บิบิมบับ (ข้าวยำเกาหลี)', price: 180, category: 'อาหารเกาหลี', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fbibimbap.jpg?alt=media', cookingTime: 10, isAvailable: true },
    { id: 13, name: 'เจยุก บกกึม หมู/ไก่ผัดซอสโคชูจัง (กับข้าว)', price: 170, category: 'อาหารเกาหลี', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fjeyuk-bokkeum.jpg?alt=media', cookingTime: 12, isAvailable: true },
    { id: 14, name: 'ซาวครีม ชิ้กเก้น (ไก่ทอดซอสซาวครีม)', price: 150, category: 'ของทานเล่น', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fsour-cream-chicken.jpg?alt=media', cookingTime: 15, isAvailable: true },
];

export const DEFAULT_FLOORS: string[] = ['ชั้นล่าง', 'ชั้นบน'];

export const DEFAULT_TABLES: Table[] = [
    { id: 1, name: 'T1', floor: 'ชั้นล่าง', activePin: null, reservation: null },
    { id: 2, name: 'T2', floor: 'ชั้นล่าง', activePin: null, reservation: null },
    { id: 3, name: 'T3', floor: 'ชั้นล่าง', activePin: null, reservation: null },
    { id: 4, name: 'T1', floor: 'ชั้นบน', activePin: null, reservation: null },
    { id: 5, name: 'T2', floor: 'ชั้นบน', activePin: null, reservation: null },
    { id: 6, name: 'T3', floor: 'ชั้นบน', activePin: null, reservation: null },
];

export const DEFAULT_CATEGORIES: string[] = ['ทั้งหมด', 'อาหารจานเดียว', 'อาหารเกาหลี', 'ของทานเล่น', 'เครื่องดื่ม'];
export const DEFAULT_STOCK_CATEGORIES: string[] = ['ทั้งหมด', 'ของสด', 'ของแห้ง', 'เครื่องปรุง', 'เครื่องดื่ม'];
export const DEFAULT_STOCK_UNITS: string[] = ['กิโลกรัม', 'ลิตร', 'ขวด', 'แพ็ค', 'ชิ้น', 'ฟอง', 'ถุง'];

// Get current month key for dummy data
const currentMonth = new Date().toISOString().slice(0, 7);

export const DEFAULT_STOCK_ITEMS: StockItem[] = [
    { 
        id: 1, 
        name: 'เนื้อไก่', 
        category: 'ของสด', 
        quantity: 10, 
        unit: 'กิโลกรัม', 
        reorderPoint: 2, 
        withdrawalCount: 3, // Current cycle
        monthlyWithdrawals: { [currentMonth]: 45 }, // Historical
        lastUpdated: Date.now() 
    },
    { 
        id: 2, 
        name: 'เนื้อหมู', 
        category: 'ของสด', 
        quantity: 15, 
        unit: 'กิโลกรัม', 
        reorderPoint: 3, 
        withdrawalCount: 5, 
        monthlyWithdrawals: { [currentMonth]: 62 }, 
        lastUpdated: Date.now() 
    },
    { 
        id: 3, 
        name: 'น้ำมันพืช', 
        category: 'เครื่องปรุง', 
        quantity: 5, 
        unit: 'ขวด', 
        reorderPoint: 1, 
        withdrawalCount: 2, 
        monthlyWithdrawals: { [currentMonth]: 12 }, 
        lastUpdated: Date.now() 
    },
    { 
        id: 4, 
        name: 'ไข่ไก่', 
        category: 'ของสด', 
        quantity: 60, 
        unit: 'ฟอง', 
        reorderPoint: 30, 
        withdrawalCount: 10, 
        monthlyWithdrawals: { [currentMonth]: 120 }, 
        lastUpdated: Date.now() 
    },
];

export const DEFAULT_LEAVE_REQUESTS: LeaveRequest[] = [
    { id: 1, userId: 7, username: 'Tal', employeeName: 'Tal', branchId: 1, startDate: new Date('2026-02-25').getTime(), endDate: new Date('2026-02-25').getTime(), type: 'leave-without-pay', reason: '222', status: 'approved', submittedAt: new Date('2026-02-24').getTime() },
    { id: 2, userId: 8, username: 'Pea', employeeName: 'Pea', branchId: 1, startDate: new Date('2026-02-19').getTime(), endDate: new Date('2026-02-19').getTime(), type: 'personal', reason: 'ไม่สบายค่ะ', status: 'approved', submittedAt: new Date('2026-02-19').getTime() },
    { id: 3, userId: 7, username: 'Tal', employeeName: 'Tal', branchId: 1, startDate: new Date('2026-02-22').getTime(), endDate: new Date('2026-02-22').getTime(), type: 'personal', reason: 'ไปธุระค่ะ', status: 'approved', submittedAt: new Date('2026-02-18').getTime() },
    { id: 4, userId: 7, username: 'Tal', employeeName: 'Tal', branchId: 1, startDate: new Date('2026-02-18').getTime(), endDate: new Date('2026-02-18').getTime(), type: 'sick', reason: 'ไม่สบาย', status: 'approved', submittedAt: new Date('2026-02-18').getTime() },
    { id: 5, userId: 9, username: 'Pam', employeeName: 'Pam', branchId: 1, startDate: new Date('2026-02-14').getTime(), endDate: new Date('2026-02-14').getTime(), type: 'personal', reason: 'ติดธุระค่ะ', status: 'approved', submittedAt: new Date('2026-02-14').getTime() },
    { id: 6, userId: 10, username: 'Fah', employeeName: 'Fah', branchId: 1, startDate: new Date('2026-02-24').getTime(), endDate: new Date('2026-02-24').getTime(), type: 'personal', reason: 'พาไปหาหมอค่ะ', status: 'approved', submittedAt: new Date('2026-02-24').getTime() },
    { id: 7, userId: 8, username: 'Pea', employeeName: 'Pea', branchId: 1, startDate: new Date('2026-02-10').getTime(), endDate: new Date('2026-02-10').getTime(), type: 'personal', reason: 'พาไปทำธุระ', status: 'approved', submittedAt: new Date('2026-02-10').getTime() },
    { id: 8, userId: 7, username: 'Tal', employeeName: 'Tal', branchId: 1, startDate: new Date('2026-01-09').getTime(), endDate: new Date('2026-01-09').getTime(), type: 'personal', reason: 'พาแม่ไปหาหมอค่ะ', status: 'approved', submittedAt: new Date('2026-01-09').getTime() },
];

export const DEFAULT_MAINTENANCE_ITEMS: MaintenanceItem[] = [
    {
        id: 1,
        name: 'เครื่องทำน้ำแข็ง (Ice Machine)',
        description: 'ทำความสะอาดแผ่นกรองและถังเก็บน้ำแข็ง',
        imageUrl: 'https://images.unsplash.com/photo-1595427339879-19c99c372c3d?q=80&w=300&auto=format&fit=crop',
        cycleMonths: 1,
        lastMaintenanceDate: Date.now(), // Fixed: Set to current date so it's not overdue on init
        status: 'active'
    },
    {
        id: 2,
        name: 'เครื่องปรับอากาศ (Air Conditioner)',
        description: 'ล้างแอร์ใหญ่',
        imageUrl: 'https://images.unsplash.com/photo-1599317537367-1729c3620719?q=80&w=300&auto=format&fit=crop',
        cycleMonths: 3,
        lastMaintenanceDate: Date.now() - (80 * 24 * 60 * 60 * 1000), // OK (80 days ago, due in 10 days)
        status: 'active'
    },
    {
        id: 3,
        name: 'เตาอบ (Oven)',
        description: 'ทำความสะอาดคราบไขมันด้านใน',
        imageUrl: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?q=80&w=300&auto=format&fit=crop',
        cycleMonths: 1,
        lastMaintenanceDate: Date.now() - (15 * 24 * 60 * 60 * 1000), // OK (15 days ago)
        status: 'active'
    }
];
