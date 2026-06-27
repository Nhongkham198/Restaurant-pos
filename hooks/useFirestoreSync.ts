
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebaseConfig';
import type { Table } from '../types';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { auth } from '../firebaseConfig';

interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

const handleFirestoreError = (err: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null) => {
    if (err.code === 'permission-denied') {
        const user = auth?.currentUser;
        const info: FirestoreErrorInfo = {
            error: err.message,
            operationType,
            path,
            authInfo: {
                userId: user?.uid || 'unauthenticated',
                email: user?.email || '',
                emailVerified: user?.emailVerified || false,
                isAnonymous: user?.isAnonymous || false,
                providerInfo: user?.providerData.map(p => ({
                    providerId: p.providerId,
                    displayName: p.displayName || '',
                    email: p.email || ''
                })) || []
            }
        };
        throw new Error(JSON.stringify(info));
    }
    throw err;
};

// List of collections containing complex arrays of entities that should be stored as individual documents to prevent the 1MB single-document limit
const MIGRATED_COLLECTIONS = [
    'users',
    'branches',
    'tables',
    'menuItems',
    'stockItems',
    'recipes',
    'leaveRequests',
    'printHistory',
    'staffCalls',
    'timeRecords',
    'payrollRecords',
    'stockTags',
    'maintenanceItems',
    'closingChecklistItems',
    'closingChecklistLog'
];

// Helper to reliably retrieve or generate a unique ID string from any item
function getItemDocId(item: any): string {
    if (!item) return '';
    if (item._firestoreId) return item._firestoreId.toString(); // Use the exact document ID if we fetched it
    const rawId = item.id !== undefined && item.id !== null ? item.id : 
                  (item.userId !== undefined && item.userId !== null ? `${item.userId}_${item.startDate}` : undefined);
    const fallbackId = rawId !== undefined ? rawId : (item.username || item.timestamp || item.name || item.code);
    return fallbackId ? fallbackId.toString() : '';
}

// Global memory caches to allow instant rendering (SWR pattern) and keep UI 100% responsive when switching branches
const globalFirestoreCache = new Map<string, any>();
const globalLoadedCacheKeys = new Set<string>();

// Hook for Highly Scalable Sync (Legacy single document for config/primitives; modern multi-document collections for bulk list data)
export function useFirestoreSync<T>(
    branchId: string | null,
    collectionKey: string,
    initialValue: T,
    fallbackValue?: T // NEW: Optional fallback value to seed DB if empty
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
    const activeCacheKey = `${collectionKey}_${branchId || 'global'}`;

    // Initialize state with cached value if available, or fallback to initialValue
    const [value, setValue] = useState<T>(() => {
        if (globalFirestoreCache.has(activeCacheKey)) {
            return globalFirestoreCache.get(activeCacheKey) as T;
        }
        return initialValue;
    });

    const [isLoading, setIsLoading] = useState(false); // Start as false to prevent immediate flash
    const initialValueRef = useRef(initialValue);
    const fallbackValueRef = useRef(fallbackValue);
    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // Keep a ref to the current value to avoid stale closures
    const valueRef = useRef(value);
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    const isInitialLoadDoneRef = useRef(false);

    useEffect(() => {
        const currentCacheKey = `${collectionKey}_${branchId || 'global'}`;
        
        // Reset loading status flag for the current query
        isInitialLoadDoneRef.current = false;

        if (globalFirestoreCache.has(currentCacheKey)) {
            // Instant load from cache! UI remains 100% responsive with zero wait.
            const cached = globalFirestoreCache.get(currentCacheKey);
            setValue(cached as T);
            setIsLoading(false);
        } else {
            // No cache yet, fallback to initial and show progress indicator if needed
            setValue(initialValueRef.current);
            setIsLoading(false);
        }

        if (!db) {
            console.error("Firestore is not initialized.");
            setIsLoading(false);
            return () => {};
        }

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(collectionKey);
        const currentInitialValue = initialValueRef.current;
        const isMigrated = MIGRATED_COLLECTIONS.includes(collectionKey);

        if (isBranchSpecific && !branchId) {
            setValue(currentInitialValue);
            setIsLoading(false);
            return () => {};
        }

        // Optimization: Only show loading if it takes more than 150ms 
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = setTimeout(() => {
            if (!isInitialLoadDoneRef.current && !globalLoadedCacheKeys.has(currentCacheKey)) {
                setIsLoading(true);
            }
        }, 150);

        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        const docRef = db.doc(pathSegments.join('/'));

        const collectionPath = isBranchSpecific && branchId
            ? `branches/${branchId}/${collectionKey}`
            : collectionKey;

        // Cleanup function reference
        let unsubscribe = () => {};

        if (isMigrated) {
            // Modern scalable list collection subscription
            console.log(`[Firestore Sync] Tracking high-capacity collection: "${collectionPath}"`);
            unsubscribe = db.collection(collectionPath).onSnapshot(
                (snapshot) => {
                    if (loadingTimeoutRef.current) {
                        clearTimeout(loadingTimeoutRef.current);
                        loadingTimeoutRef.current = null;
                    }
                    isInitialLoadDoneRef.current = true;
                    globalLoadedCacheKeys.add(currentCacheKey);

                    const items: any[] = [];
                    snapshot.forEach(docSnap => {
                        if (docSnap.exists) {
                            const d = docSnap.data();
                            if (d && typeof d === 'object') {
                                d._firestoreId = docSnap.id;
                            }
                            items.push(d);
                        }
                    });

                    let finalValueToSet = items;

                    // --- Post-fetch Validation/Cleanup & Sorting (specific keys) ---
                    if (collectionKey === 'tables') {
                        // Prevent duplicates and sort tables by ID
                        const uniqueTablesMap = new Map<number, Table>();
                        items.forEach(table => {
                            if (table && typeof table.id === 'number' && !Number.isNaN(table.id) && Number.isFinite(table.id)) {
                                if (!uniqueTablesMap.has(table.id)) {
                                    uniqueTablesMap.set(table.id, table);
                                }
                            }
                        });
                        finalValueToSet = Array.from(uniqueTablesMap.values()).sort((a, b) => a.id - b.id);
                    }

                    if (collectionKey === 'menuItems') {
                        finalValueToSet = [...items].sort((a, b) => {
                            const posA = a && typeof a.position === 'number' ? a.position : (a && typeof a.id === 'number' ? a.id : 0);
                            const posB = b && typeof b.position === 'number' ? b.position : (b && typeof b.id === 'number' ? b.id : 0);
                            return posA - posB;
                        });
                    }

                    // Seeding fallback if database collection is empty
                    if (items.length === 0 && fallbackValueRef.current !== undefined && Array.isArray(fallbackValueRef.current)) {
                        console.log(`[Firestore Sync] Seeding fallback collections for empty ${collectionKey}...`);
                        const batch = db.batch();
                        fallbackValueRef.current.forEach(item => {
                            const docId = getItemDocId(item);
                            if (docId) {
                                const sanitizedItem = JSON.parse(JSON.stringify(item, (k, v) => v === undefined ? null : v));
                                batch.set(db.collection(collectionPath).doc(docId), {
                                    ...sanitizedItem,
                                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                                }, { merge: true });
                            }
                        });
                        batch.commit().catch(err => console.error(`[Firestore Sync] Seeding failed for ${collectionKey}:`, err));
                    } else {
                        // Update cache & React state
                        globalFirestoreCache.set(currentCacheKey, finalValueToSet);
                        setValue(finalValueToSet as unknown as T);
                    }
                    setIsLoading(false);
                },
                (error) => {
                    console.error(`Firestore collection sync error for ${collectionKey}:`, error);
                    setIsLoading(false);
                    if (error.code === 'permission-denied') {
                        handleFirestoreError(error, 'list', collectionPath);
                    }
                }
            );

            // AUTO-MIGRATION checking module (Runs in the background once upon load)
            const checkMigration = async () => {
                try {
                    const legacyDocRef = db.doc(pathSegments.join('/'));
                    const legacySnap = await legacyDocRef.get();
                    if (legacySnap.exists) {
                        const legacyData = legacySnap.data();
                        if (legacyData && Array.isArray(legacyData.value) && legacyData.value.length > 0 && !legacyData.migrated) {
                            console.log(`[Firestore Migration] Legacy array data found for "${collectionKey}" - migrating ${legacyData.value.length} items to direct scalable documents...`);
                            
                            // Upload items in batches of 100 to stay safely below Firestore batch limits up to 500 writes
                            const itemsToMigrate = legacyData.value;
                            const size = 100;
                            for (let i = 0; i < itemsToMigrate.length; i += size) {
                                const batch = db.batch();
                                const chunk = itemsToMigrate.slice(i, i + size);
                                let count = 0;

                                chunk.forEach(item => {
                                    if (!item) return;
                                    const docId = getItemDocId(item);
                                    if (docId) {
                                        const sanitizedItem = JSON.parse(JSON.stringify(item, (k, v) => v === undefined ? null : v));
                                        const targetDoc = db.collection(collectionPath).doc(docId);
                                        batch.set(targetDoc, {
                                            ...sanitizedItem,
                                            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                                        }, { merge: true });
                                        count++;
                                    }
                                });

                                if (count > 0) {
                                    await batch.commit();
                                }
                            }

                            // Clean and tag old document as migrated
                            await legacyDocRef.set({ value: [], migrated: true }, { merge: true });
                            console.log(`[Firestore Migration] Successfully migrated and optimized "${collectionKey}" data!`);
                        }
                    }
                } catch (err) {
                    console.error(`[Firestore Migration] Error during migration of "${collectionKey}":`, err);
                }
            };
            checkMigration();
        } else {
            // Legacy single document array/config tracking fallback
            unsubscribe = docRef.onSnapshot(
                { includeMetadataChanges: true }, 
                (docSnapshot) => {
                    if (loadingTimeoutRef.current) {
                        clearTimeout(loadingTimeoutRef.current);
                        loadingTimeoutRef.current = null;
                    }
                    
                    isInitialLoadDoneRef.current = true;
                    globalLoadedCacheKeys.add(currentCacheKey);

                    if (docSnapshot.exists) {
                        const data = docSnapshot.data();
                        if (data && typeof data.value !== 'undefined') {
                            let valueToSet = data.value;

                            // Custom cleanup check for legacy orders resets
                            if (collectionKey === 'orderCounter') {
                                const counterData = valueToSet as any;
                                if (!counterData || typeof counterData !== 'object' || typeof counterData.count !== 'number') {
                                    setValue(currentInitialValue);
                                    setIsLoading(false);
                                    return;
                                }
                                const { count, lastResetDate } = counterData;
                                let correctedDateString = '';
                                if (typeof lastResetDate === 'string') {
                                    correctedDateString = lastResetDate;
                                } else if (lastResetDate && typeof lastResetDate.toDate === 'function') {
                                    const dateObj = lastResetDate.toDate();
                                    const year = dateObj.getFullYear();
                                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                                    const day = String(dateObj.getDate()).padStart(2, '0');
                                    correctedDateString = `${year}-${month}-${day}`;
                                }
                                if (correctedDateString) {
                                    valueToSet = { count, lastResetDate: correctedDateString };
                                } else {
                                    setValue(currentInitialValue);
                                    setIsLoading(false);
                                    return;
                                }
                            }

                            // Update cache & React state
                            globalFirestoreCache.set(currentCacheKey, valueToSet);
                            setValue(valueToSet as T);
                        } else {
                            if (fallbackValueRef.current !== undefined) {
                                console.log(`[Firestore] Seeding missing value for ${collectionKey}`);
                                docRef.set({ value: fallbackValueRef.current }, { merge: true });
                                globalFirestoreCache.set(currentCacheKey, fallbackValueRef.current);
                                setValue(fallbackValueRef.current);
                            } else {
                                setValue(currentInitialValue);
                            }
                        }
                    } else {
                        if (fallbackValueRef.current !== undefined) {
                            console.log(`[Firestore] Seeding new document for ${collectionKey}`);
                            docRef.set({ value: fallbackValueRef.current });
                            globalFirestoreCache.set(currentCacheKey, fallbackValueRef.current);
                            setValue(fallbackValueRef.current);
                        } else {
                            setValue(currentInitialValue);
                        }
                    }
                    setIsLoading(false);
                },
                (error) => {
                    console.error(`Firestore sync error for ${collectionKey}:`, error);
                    setIsLoading(false);
                    if (error.code === 'permission-denied') {
                        const path = isBranchSpecific && branchId
                            ? `branches/${branchId}/${collectionKey}/data`
                            : `${collectionKey}/data`;
                        handleFirestoreError(error, 'get', path);
                    }
                }
            );
        }

        return () => unsubscribe();
    }, [branchId, collectionKey]);

    const setAndSyncValue = useCallback((newValue: React.SetStateAction<T>) => {
        // Capture specific branch and collection keys in scope closure to isolate this save task
        const boundBranchId = branchId;
        const boundCollectionKey = collectionKey;
        const boundCacheKey = `${boundCollectionKey}_${boundBranchId || 'global'}`;

        if (!db) return;

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(boundCollectionKey);
        const isMigrated = MIGRATED_COLLECTIONS.includes(boundCollectionKey);
        
        if (isBranchSpecific && !boundBranchId) {
             setValue(newValue);
             return;
        }

        const pathSegments = isBranchSpecific && boundBranchId
            ? ['branches', boundBranchId, boundCollectionKey, 'data']
            : [boundCollectionKey, 'data'];
        
        const docRef = db.doc(pathSegments.join('/'));

        const collectionPath = isBranchSpecific && boundBranchId
            ? `branches/${boundBranchId}/${boundCollectionKey}`
            : boundCollectionKey;

        // Retrieve the cached state for the bound branch/collection to operate on
        const cachedValue = globalFirestoreCache.has(boundCacheKey)
            ? globalFirestoreCache.get(boundCacheKey)
            : initialValueRef.current;

        // Apply state updates using the isolated cache instead of general react value state (which might be updated by a branch change)
        const resolvedValue = newValue instanceof Function ? newValue(cachedValue) : newValue;

        // Optimistically update memory cache instantly
        globalFirestoreCache.set(boundCacheKey, resolvedValue);

        // Only update active hook state if we are still viewing the same branch
        const currentActiveCacheKey = `${collectionKey}_${branchId || 'global'}`;
        if (boundCacheKey === currentActiveCacheKey) {
            setValue(resolvedValue);
        }

        // Check if the query has completed its first load from Firestore to prevent overwriting with local blank state
        const isLoaded = globalLoadedCacheKeys.has(boundCacheKey);
        if (!isLoaded) {
            // Keep update in memory cache only; don't sync to Firestore yet as it's still fetching
            return;
        }

        // SANITIZATION: Firestore fails on 'undefined' values. 
        const sanitizedValue = JSON.parse(JSON.stringify({ value: resolvedValue }, (key, val) => {
            return val === undefined ? null : val;
        }));

        if (isMigrated && Array.isArray(cachedValue) && Array.isArray(resolvedValue)) {
            // High-performance direct sub-document sync
            const prevMap = new Map<string, any>();
            cachedValue.forEach(item => {
                const di = getItemDocId(item);
                if (di) prevMap.set(di, item);
            });

            const newMap = new Map<string, any>();
            resolvedValue.forEach(item => {
                const di = getItemDocId(item);
                if (di) newMap.set(di, item);
            });

            // Batch up writes and deletions
            const batch = db.batch();
            let opCount = 0;

            resolvedValue.forEach(item => {
                if (!item) return;
                const docId = getItemDocId(item);
                if (!docId) return;

                const prevItem = prevMap.get(docId);
                const sanitizedItem = JSON.parse(JSON.stringify(item, (key, val) => val === undefined ? null : val));

                if (!prevItem || JSON.stringify(sanitizedItem) !== JSON.stringify(prevItem)) {
                    const targetRef = db.collection(collectionPath).doc(docId);
                    batch.set(targetRef, {
                        ...sanitizedItem,
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // Timestamp guard
                    }, { merge: true });
                    opCount++;
                }
            });

            cachedValue.forEach(item => {
                if (!item) return;
                const docId = getItemDocId(item);
                if (!docId) return;

                if (!newMap.has(docId)) {
                    const targetRef = db.collection(collectionPath).doc(docId);
                    batch.delete(targetRef);
                    opCount++;
                }
            });

            if (opCount > 0) {
                batch.commit().catch(err => {
                    console.error(`Failed to commit scalability changes batch for ${boundCollectionKey}:`, err);
                    handleFirestoreError(err, 'write', collectionPath);
                });
            }
        } else {
            // Fallback traditional single document write
            docRef.set(sanitizedValue)
                .catch(err => {
                    console.error(`Failed to write ${boundCollectionKey} to Firestore:`, err);
                    handleFirestoreError(err, 'write', pathSegments.join('/'));
                });
        }
    }, [branchId, collectionKey]);

    return [value, setAndSyncValue, isLoading];
}

// Hook for Collection-based Sync (Robust, Granular Updates)
export interface CollectionActions<T> {
    add: (item: T) => Promise<void>;
    update: (id: number | string, data: Partial<T>) => Promise<void>;
    remove: (id: number | string) => Promise<void>;
}

export function useFirestoreCollection<T extends { id: number | string }>(
    branchId: string | null,
    collectionName: string,
    queryFn?: (ref: firebase.firestore.CollectionReference | firebase.firestore.Query) => firebase.firestore.Query
): [T[], CollectionActions<T>] {
    const [data, setData] = useState<T[]>([]);

    useEffect(() => {
        if (!db || !branchId) return;

        let collectionRef: firebase.firestore.CollectionReference | firebase.firestore.Query = db.collection(`branches/${branchId}/${collectionName}`);
        
        if (queryFn) {
            collectionRef = queryFn(collectionRef);
        }

        const unsubscribe = collectionRef.onSnapshot(snapshot => {
            const items: T[] = [];
            snapshot.forEach(doc => {
                items.push(doc.data() as T);
            });
            setData(items);
        }, error => {
            console.error(`Error syncing collection ${collectionName}:`, error);
            if (error.code === 'permission-denied') {
                handleFirestoreError(error, 'list', `branches/${branchId}/${collectionName}`);
            }
        });

        return () => unsubscribe();
    }, [branchId, collectionName]);

    const actions: CollectionActions<T> = React.useMemo(() => ({
        add: async (item: T) => {
            if (!db || !branchId) return;
            const docId = item.id.toString();
            const path = `branches/${branchId}/${collectionName}/${docId}`;
            try {
                await db.collection(`branches/${branchId}/${collectionName}`).doc(docId).set({
                    ...item,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // Timestamp Guard
                });
            } catch (err) {
                handleFirestoreError(err, 'create', path);
            }
        },
        update: async (id: number | string, updates: Partial<T>) => {
            if (!db || !branchId) return;
            const path = `branches/${branchId}/${collectionName}/${id}`;
            try {
                await db.collection(`branches/${branchId}/${collectionName}`).doc(id.toString()).update({
                    ...updates,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (err) {
                handleFirestoreError(err, 'update', path);
            }
        },
        remove: async (id: number | string) => {
            if (!db || !branchId) return;
            const path = `branches/${branchId}/${collectionName}/${id}`;
            try {
                await db.collection(`branches/${branchId}/${collectionName}`).doc(id.toString()).delete();
            } catch (err) {
                handleFirestoreError(err, 'delete', path);
            }
        }
    }), [branchId, collectionName]);

    return [data, actions];
}
