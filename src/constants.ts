
import type { MenuItem, Table, Branch, User, StockItem } from './types';

export const DEFAULT_BRANCHES: Branch[] = [
    { id: 1, name: 'สาขากาฬสินธุ์', location: 'กาฬสินธุ์' },
    { id: 2, name: 'สาขากรุงเทพ', location: 'กรุงเทพมหานคร' }
];

export const DEFAULT_USERS: User[] = [
    { id: 1, username: 'admin', password: 'password', role: 'admin' },
    { id: 2, username: 'pos', password: 'password', role: 'pos', allowedBranchIds: [1] },
    { id: 3, username: 'kitchen', password: 'password', role: 'kitchen', allowedBranchIds: [1] },
    { id: 4, username: 'manager', password: 'password', role: 'branch-admin', allowedBranchIds: [1] },
    { id: 5, username: 'Sam', password: '198', role: 'admin' },
    { id: 6, username: 'auditor', password: 'password', role: 'auditor', allowedBranchIds: [1] },
];

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
    { 
        id: 1, 
        name: 'ข้าวกะเพรา', 
        price: 60, 
        category: 'อาหารจานเดียว', 
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fkaprao.jpg?alt=media', 
        cookingTime: 5,
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
    { id: 2, name: 'ข้าวผัดหมู', price: 60, category: 'อาหารจานเดียว', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Ffried-rice.jpg?alt=media', cookingTime: 7 },
    { id: 3, name: 'เฟรนช์ฟรายส์', price: 45, category: 'ของทานเล่น', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Ffrench-fries.jpg?alt=media', cookingTime: 4 },
    { id: 4, name: 'โค้ก', price: 20, category: 'เครื่องดื่ม', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fcoke.jpg?alt=media', cookingTime: 1 },
    { id: 5, name: 'น้ำเปล่า', price: 15, category: 'เครื่องดื่ม', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/restaurant-pos-f8bd4.appspot.com/o/menu%2Fwater.jpg?alt=media', cookingTime: 1 },
];

export const DEFAULT_FLOORS: string[] = ['ชั้นล่าง', 'ชั้นบน'];

export const DEFAULT_TABLES: Table[] = [
    { id: 1, name: 'T1', floor: 'ชั้นล่าง' },
    { id: 2, name: 'T2', floor: 'ชั้นล่าง' },
    { id: 3, name: 'T3', floor: 'ชั้นล่าง' },
    { id: 4, name: 'T1', floor: 'ชั้นบน' },
    { id: 5, name: 'T2', floor: 'ชั้นบน' },
    { id: 6, name: 'T3', floor: 'ชั้นบน' },
];

export const DEFAULT_CATEGORIES: string[] = ['ทั้งหมด', 'อาหารจานเดียว', 'ของทานเล่น', 'เครื่องดื่ม'];
export const DEFAULT_STOCK_CATEGORIES: string[] = ['ทั้งหมด', 'ของสด', 'ของแห้ง', 'เครื่องปรุง', 'เครื่องดื่ม'];
export const DEFAULT_STOCK_UNITS: string[] = ['กิโลกรัม', 'ลิตร', 'ขวด', 'แพ็ค', 'ชิ้น', 'ฟอง', 'ถุง'];

export const DEFAULT_STOCK_ITEMS: StockItem[] = [
    { id: 1, name: 'เนื้อไก่', category: 'ของสด', quantity: 10, unit: 'กิโลกรัม', reorderPoint: 2, lastUpdated: Date.now() },
    { id: 2, name: 'เนื้อหมู', category: 'ของสด', quantity: 15, unit: 'กิโลกรัม', reorderPoint: 3, lastUpdated: Date.now() },
    { id: 3, name: 'น้ำมันพืช', category: 'เครื่องปรุง', quantity: 5, unit: 'ขวด', reorderPoint: 1, lastUpdated: Date.now() },
    { id: 4, name: 'ไข่ไก่', category: 'ของสด', quantity: 60, unit: 'ฟอง', reorderPoint: 30, lastUpdated: Date.now() },
];