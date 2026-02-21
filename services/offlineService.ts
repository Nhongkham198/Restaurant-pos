import PouchDB from 'pouchdb';
import PouchDBFind from 'pouchdb-find';

PouchDB.plugin(PouchDBFind);

interface QueuedAction {
    _id: string;
    type: 'completeOrder' | 'cancelOrder' | 'mergeOrders' | 'splitOrder';
    payload: any;
    createdAt: number;
}

class OfflineService {
    private db: PouchDB.Database<QueuedAction>;
    private orderService: any = null; // Will be injected

    constructor() {
        this.db = new PouchDB('offline_actions');
        this.init();
    }

    private init() {
        this.db.createIndex({ index: { fields: ['createdAt'] } });
        window.addEventListener('online', () => this.processQueue());
    }

    public registerOrderService(service: any) {
        this.orderService = service;
        // Attempt to process queue immediately upon registration if online
        if (navigator.onLine) {
            this.processQueue();
        }
    }

    public async addAction(type: QueuedAction['type'], payload: any): Promise<void> {
        const newAction: QueuedAction = {
            _id: new Date().toISOString(),
            type,
            payload,
            createdAt: Date.now(),
        };
        await this.db.put(newAction);
    }

    public async processQueue(): Promise<void> {
        if (!this.orderService) {
            console.log('Order service not yet registered in offlineService. Queue will be processed upon registration.');
            return;
        }
        if (!navigator.onLine) {
            console.log('Offline. Queue processing paused.');
            return;
        }

        console.log('Processing offline queue...');
        const result = await this.db.find({
            selector: { createdAt: { $gte: null } },
            sort: ['createdAt']
        });

        for (const action of result.docs) {
            try {
                console.log(`Reprocessing action: ${action.type}`);
                let success = false;
                switch (action.type) {
                    case 'cancelOrder':
                        await this.orderService.cancelOrder(
                            action.payload.branchId,
                            action.payload.orderToCancel,
                            action.payload.currentUser,
                            action.payload.reason,
                            action.payload.notes
                        );
                        success = true;
                        break;
                    case 'splitOrder':
                        await this.orderService.splitOrder(
                            action.payload.branchId,
                            action.payload.originalOrder,
                            action.payload.itemsToSplit
                        );
                        success = true;
                        break;
                    case 'mergeOrders':
                        await this.orderService.mergeOrders(
                            action.payload.branchId,
                            action.payload.currentUser,
                            action.payload.sourceOrders,
                            action.payload.targetOrder
                        );
                        success = true;
                        break;
                    case 'completeOrder':
                        await this.orderService.completeOrder(
                            action.payload.branchId,
                            action.payload.orderToComplete,
                            action.payload.paymentDetails,
                            action.payload.currentUser
                        );
                        success = true;
                        break;
                    // Add other cases here as they are implemented
                }

                if (success) {
                    await this.db.remove(action);
                    console.log(`Action ${action._id} processed and removed from queue.`);
                }
            } catch (error) {
                console.error(`Failed to reprocess action ${action._id}. It will be retried.`, error);
            }
        }
    }
}

export const offlineService = new OfflineService();
