
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/firebaseConfig';
import type { Table } from '@/types';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { auth } from '@/firebaseConfig';

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

// Hook for Single Document Sync (Legacy/Config/Arrays)
export function useFirestoreSync<T>(
    branchId: string | null,
    collectionKey: string,
    initialValue: T,
    fallbackValue?: T // NEW: Optional fallback value to seed DB if empty
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
    const [value, setValue] = useState<T>(initialValue);
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
    const hasOverriddenRef = useRef(false);

    useEffect(() => {
        if (!db) {
            console.error("Firestore is not initialized.");
            setIsLoading(false);
            return () => {};
        }

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(collectionKey);
        const currentInitialValue = initialValueRef.current;

        if (isBranchSpecific && !branchId) {
            setValue(currentInitialValue);
            setIsLoading(false);
            return () => {};
        }

        // Optimization: Only show loading if it takes more than 150ms (prevents flicker on cache hits)
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = setTimeout(() => {
            if (!isInitialLoadDoneRef.current) {
                setIsLoading(true);
            }
        }, 150);

        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        const docRef = db.doc(pathSegments.join('/'));

        const unsubscribe = docRef.onSnapshot(
            { includeMetadataChanges: true }, 
            (docSnapshot) => {
                if (loadingTimeoutRef.current) {
                    clearTimeout(loadingTimeoutRef.current);
                    loadingTimeoutRef.current = null;
                }
                
                isInitialLoadDoneRef.current = true;
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    if (data && typeof data.value !== 'undefined') {
                        // Special override disabled to allow user edits
                        if ([].includes(collectionKey) && fallbackValueRef.current && !hasOverriddenRef.current) {
                            // This is a measure to force the database to update
                            // with the correct default data set if it's stale.
                            const dbValueJSON = JSON.stringify(data.value);
                            const fallbackValueJSON = JSON.stringify(fallbackValueRef.current);

                            if (dbValueJSON !== fallbackValueJSON) {
                                // console.log(`[Firestore Sync] Stale ${collectionKey} data detected. Overwriting with defaults.`);
                                docRef.set({ value: fallbackValueRef.current });
                                setValue(fallbackValueRef.current as T);
                                hasOverriddenRef.current = true; // Prevent infinite loop
                                setIsLoading(false);
                                return; // Stop further processing, as we've just set the correct state
                            }
                        }

                        let valueToSet = data.value;

                        // --- Validation & Cleanup Logic ---
                        if (collectionKey === 'tables' && Array.isArray(valueToSet)) {
                            const rawTablesFromDb = valueToSet as Table[];
                            const uniqueTablesMap = new Map<number, Table>();
                            rawTablesFromDb.forEach(table => {
                                if (table && typeof table.id === 'number') {
                                    if (!uniqueTablesMap.has(table.id)) {
                                        uniqueTablesMap.set(table.id, table);
                                    }
                                }
                            });
                            valueToSet = Array.from(uniqueTablesMap.values());
                        } 
                        else if (collectionKey === 'orderCounter') {
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

                        setValue(valueToSet as T);
                    } else {
                        // Document exists but value is missing/undefined. 
                        // If we have a fallback, Seed it. Otherwise use initial.
                        if (fallbackValueRef.current !== undefined) {
                            console.log(`[Firestore] Seeding missing value for ${collectionKey} (Doc exists)`);
                            docRef.set({ value: fallbackValueRef.current }, { merge: true });
                            setValue(fallbackValueRef.current);
                        } else {
                            setValue(currentInitialValue);
                        }
                    }
                } else {
                    // Document does NOT exist.
                    // If we have a fallback, Seed it. Otherwise use initial.
                    if (fallbackValueRef.current !== undefined) {
                        console.log(`[Firestore] Seeding new document for ${collectionKey}`);
                        docRef.set({ value: fallbackValueRef.current });
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

        return () => unsubscribe();
    }, [branchId, collectionKey]);

    const setAndSyncValue = useCallback((newValue: React.SetStateAction<T>) => {
        if (!isInitialLoadDoneRef.current) {
            setValue(newValue);
            return;
        }
        if (!db) return;

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(collectionKey);
        
        if (isBranchSpecific && !branchId) {
             setValue(newValue);
             return;
        }

        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        const docRef = db.doc(pathSegments.join('/'));

        setValue((prevValue) => {
            const resolvedValue = newValue instanceof Function ? newValue(prevValue) : newValue;
            
            // SANITIZATION: Firestore fails on 'undefined' values. 
            // We use JSON stringify/parse to strip undefineds recursively.
            const sanitizedValue = JSON.parse(JSON.stringify({ value: resolvedValue }, (key, val) => {
                return val === undefined ? null : val;
            }));

            docRef.set(sanitizedValue)
                .catch(err => {
                    console.error(`Failed to write ${collectionKey} to Firestore:`, err);
                    handleFirestoreError(err, 'write', pathSegments.join('/'));
                });
            return resolvedValue;
        });
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
