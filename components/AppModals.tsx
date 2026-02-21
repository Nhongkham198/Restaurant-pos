import React, { Suspense } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { useBillingLogic } from '../hooks/useBillingLogic';
import { useTableLogic } from '../hooks/useTableLogic';
import { useMenuLogic } from '../hooks/useMenuLogic';
import { useOrderLogic } from '../hooks/useOrderLogic';
import { useOrderPreparationLogic } from '../hooks/useOrderPreparationLogic';

// Import Modals
import LoginModal from './modals/LoginModal';
import MenuItemModal from './modals/MenuItemModal';
import OrderSuccessModal from './modals/OrderSuccessModal';
import SplitBillModal from './modals/SplitBillModal';
import TableBillModal from './modals/TableBillModal';
import PaymentModal from './modals/PaymentModal';
import PaymentSuccessModal from './modals/PaymentSuccessModal';
import SettingsModal from './modals/SettingsModal';
import EditCompletedOrderModal from './modals/EditCompletedOrderModal';
import UserManagerModal from './modals/UserManagerModal';
import BranchManagerModal from './modals/BranchManagerModal';
import MoveTableModal from './modals/MoveTableModal';
import CancelOrderModal from './modals/CancelOrderModal';
import CashBillModal from './modals/CashBillModal';
import SplitCompletedBillModal from './modals/SplitCompletedBillModal';
import ItemCustomizationModal from './modals/ItemCustomizationModal';
import LeaveRequestModal from './modals/LeaveRequestModal';
import MenuSearchModal from './modals/MenuSearchModal';
import MergeBillModal from './modals/MergeBillModal';
import { ActiveOrder, CompletedOrder } from '../types';

const AppModals: React.FC<{ isEditMode: boolean }> = ({ isEditMode }) => {
    const { 
        modalState, setModalState, handleModalClose, 
        orderForModal, setOrderForModal, 
        itemToEdit, itemToCustomize, orderItemToEdit,
        leaveRequestInitialDate
    } = useUI();

    const { 
        currentUser, users, setUsers, branches, setBranches, selectedBranch,
        menuItems, categories, tables, floors, activeOrders,
        newCompletedOrders, newCompletedOrdersActions, setLegacyCompletedOrders,
        leaveRequests, setLeaveRequests,
        logoUrl, appLogoUrl, qrCodeUrl, notificationSoundUrl, staffCallSoundUrl, printerConfig,
        openingTime, closingTime, restaurantAddress, restaurantPhone, taxId, signatureUrl,
        recommendedMenuItemIds, deliveryProviders,
        setLogoUrl, setAppLogoUrl, setQrCodeUrl, setNotificationSoundUrl, setStaffCallSoundUrl, setPrinterConfig,
        setOpeningTime, setClosingTime, setRestaurantAddress, setRestaurantPhone, setTaxId, setSignatureUrl,
        setRecommendedMenuItemIds, setDeliveryProviders,
        lastPlacedOrderId, restaurantName
    } = useData();

    const { 
        isConfirmingPayment, handleConfirmPayment, handlePaymentSuccessClose, 
        handleConfirmSplit, handleConfirmMerge, handleMergeAndPay, handleConfirmCancelOrder 
    } = useBillingLogic();

    const { handleConfirmMoveTable } = useTableLogic();

    const { 
        handleSaveMenuItem, handleAddCategory, handleToggleAvailability 
    } = useMenuLogic();

    const { handleUpdateOrderFromModal } = useOrderLogic();

    const { handleAddItemToOrder, handleConfirmCustomization } = useOrderPreparationLogic();

    return (
        <>
            <LoginModal isOpen={false} onClose={() => {}} />
            <MenuItemModal isOpen={modalState.isMenuItem} onClose={handleModalClose} onSave={handleSaveMenuItem} itemToEdit={itemToEdit} categories={categories} onAddCategory={handleAddCategory} />
            <OrderSuccessModal isOpen={modalState.isOrderSuccess} onClose={handleModalClose} orderId={lastPlacedOrderId!} />
            <SplitBillModal isOpen={modalState.isSplitBill} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmSplit={handleConfirmSplit} />
            <TableBillModal 
                isOpen={modalState.isTableBill} 
                onClose={handleModalClose} 
                order={orderForModal as ActiveOrder | null} 
                onInitiatePayment={(order) => { setOrderForModal(order); setModalState(prev => ({...prev, isPayment: true, isTableBill: false})); }} 
                onInitiateMove={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isMoveTable: true, isTableBill: false})); }} 
                onSplit={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isSplitBill: true, isTableBill: false})); }} 
                onUpdateOrder={(id, items, count) => handleUpdateOrderFromModal(id, items, count)}
                isEditMode={isEditMode} 
                currentUser={currentUser} 
                onInitiateCancel={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isCancelOrder: true, isTableBill: false}))}} 
                activeOrders={activeOrders} 
                onInitiateMerge={(order) => {setOrderForModal(order); setModalState(prev => ({...prev, isMergeBill: true, isTableBill: false}))}}
                onMergeAndPay={handleMergeAndPay}
            />
            <PaymentModal isOpen={modalState.isPayment} order={orderForModal as ActiveOrder | null} onClose={handleModalClose} onConfirmPayment={handleConfirmPayment} qrCodeUrl={qrCodeUrl} isEditMode={isEditMode} onOpenSettings={() => setModalState(prev => ({...prev, isSettings: true}))} isConfirmingPayment={isConfirmingPayment} />
            <PaymentSuccessModal isOpen={modalState.isPaymentSuccess} onClose={handlePaymentSuccessClose} orderNumber={(orderForModal as CompletedOrder)?.orderNumber || 0} />
            
            <Suspense fallback={null}>
                <SettingsModal 
                    isOpen={modalState.isSettings} 
                    onClose={handleModalClose} 
                    onSave={(newLogo, newAppLogo, qr, sound, staffSound, printer, open, close, address, phone, tax, signature) => { 
                        setLogoUrl(newLogo); 
                        setAppLogoUrl(newAppLogo); 
                        setQrCodeUrl(qr); 
                        setNotificationSoundUrl(sound); 
                        setStaffCallSoundUrl(staffSound); 
                        setPrinterConfig(printer); 
                        setOpeningTime(open); 
                        setClosingTime(close); 
                        setRestaurantAddress(address);
                        setRestaurantPhone(phone);
                        setTaxId(tax);
                        setSignatureUrl(signature);
                        handleModalClose(); 
                    }} 
                    currentLogoUrl={logoUrl} 
                    currentAppLogoUrl={appLogoUrl} 
                    currentQrCodeUrl={qrCodeUrl} 
                    currentNotificationSoundUrl={notificationSoundUrl} 
                    currentStaffCallSoundUrl={staffCallSoundUrl} 
                    currentPrinterConfig={printerConfig} 
                    currentOpeningTime={openingTime} 
                    currentClosingTime={closingTime} 
                    onSavePrinterConfig={setPrinterConfig} 
                    menuItems={menuItems} 
                    currentRecommendedMenuItemIds={recommendedMenuItemIds} 
                    onSaveRecommendedItems={setRecommendedMenuItemIds} 
                    deliveryProviders={deliveryProviders} 
                    onSaveDeliveryProviders={setDeliveryProviders}
                    currentRestaurantAddress={restaurantAddress}
                    currentRestaurantPhone={restaurantPhone}
                    currentTaxId={taxId}
                    currentSignatureUrl={signatureUrl}
                />
            </Suspense>

            <EditCompletedOrderModal isOpen={modalState.isEditCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onSave={async ({id, items}) => { if(newCompletedOrders.some(o => o.id === id)) { await newCompletedOrdersActions.update(id, { items }); } else { setLegacyCompletedOrders(prev => prev.map(o => o.id === id ? {...o, items} : o)); } }} menuItems={menuItems} />
            <UserManagerModal isOpen={modalState.isUserManager} onClose={handleModalClose} users={users} setUsers={setUsers} currentUser={currentUser!} branches={branches} isEditMode={isEditMode} tables={tables} />
            <BranchManagerModal isOpen={modalState.isBranchManager} onClose={handleModalClose} branches={branches} setBranches={setBranches} currentUser={currentUser} />
            <MoveTableModal isOpen={modalState.isMoveTable} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} tables={tables} activeOrders={activeOrders} onConfirmMove={handleConfirmMoveTable} floors={floors} />
            <CancelOrderModal isOpen={modalState.isCancelOrder} onClose={handleModalClose} order={orderForModal as ActiveOrder | null} onConfirm={handleConfirmCancelOrder} />
            <CashBillModal 
                isOpen={modalState.isCashBill} 
                order={orderForModal as CompletedOrder | null} 
                onClose={handleModalClose} 
                restaurantName={restaurantName} 
                logoUrl={logoUrl}
                restaurantAddress={restaurantAddress}
                restaurantPhone={restaurantPhone}
                taxId={taxId}
                signatureUrl={signatureUrl}
                menuItems={menuItems}
                printerConfig={printerConfig}
            />
            <SplitCompletedBillModal isOpen={modalState.isSplitCompleted} order={orderForModal as CompletedOrder | null} onClose={handleModalClose} onConfirmSplit={() => {}} />
            <ItemCustomizationModal isOpen={modalState.isCustomization} onClose={handleModalClose} item={itemToCustomize} onConfirm={handleConfirmCustomization} orderItemToEdit={orderItemToEdit} />
            <LeaveRequestModal isOpen={modalState.isLeaveRequest} onClose={handleModalClose} currentUser={currentUser} onSave={(req) => {const newId = Math.max(0, ...leaveRequests.map(r => r.id)) + 1; setLeaveRequests(prev => [...prev, {...req, id: newId, status: 'pending', branchId: selectedBranch!.id, submittedAt: Date.now()}]); handleModalClose(); }} leaveRequests={leaveRequests} initialDate={leaveRequestInitialDate} />
            <MenuSearchModal isOpen={modalState.isMenuSearch} onClose={handleModalClose} menuItems={menuItems} onSelectItem={handleAddItemToOrder} onToggleAvailability={handleToggleAvailability} />
            <MergeBillModal isOpen={modalState.isMergeBill} onClose={handleModalClose} order={orderForModal as ActiveOrder} allActiveOrders={activeOrders} tables={tables} onConfirmMerge={handleConfirmMerge} />
        </>
    );
};

export default AppModals;
