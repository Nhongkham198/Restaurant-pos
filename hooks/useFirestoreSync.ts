
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/firebaseConfig';
import type { Table } from '@/types';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// Hook for Single Document Sync (Legacy/Config/Arrays)
export function useFirestoreSync<T>(
    branchId: string | null,
    collectionKey: string,
    initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [value, setValue] = useState<T>(initialValue);
    const initialValueRef = useRef(initialValue);
    
    // Keep a ref to the current value to avoid stale closures
    const valueRef = useRef(value);
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    useEffect(() => {
        if (!db) {
            console.error("Firestore is not initialized.");
            return () => {};
        }

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(collectionKey);
        const currentInitialValue = initialValueRef.current;

        if (isBranchSpecific && !branchId) {
            setValue(currentInitialValue);
            return () => {};
        }

        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        const docRef = db.doc(pathSegments.join('/'));

        const unsubscribe = docRef.onSnapshot(
            { includeMetadataChanges: true }, 
            (docSnapshot) => {
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    if (data && typeof data.value !== 'undefined') {
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
                                return;
                            }
                        }

                        setValue(valueToSet as T);
                    } else {
                        setValue(currentInitialValue);
                    }
                } else {
                    setValue(currentInitialValue);
                }
            },
            (error) => {
                console.error(`Firestore sync error for ${collectionKey}:`, error);
            }
        );

        return () => unsubscribe();
    }, [branchId, collectionKey]);

    const setAndSyncValue = useCallback((newValue: React.SetStateAction<T>) => {
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
            docRef.set({ value: resolvedValue })
                .catch(err => {
                    console.error(`Failed to write ${collectionKey} to Firestore:`, err);
                });
            return resolvedValue;
        });
    }, [branchId, collectionKey]);

    return [value, setAndSyncValue];
}

// Hook for Collection-based Sync (Robust, Granular Updates)
export function useFirestoreCollection<T extends { id: number | string }>(
    branchId: string | null,
    collectionName: string
): [
    T[], 
    { 
        add: (item: T) => Promise<void>, 
        update: (id: number | string, data: Partial<T>) => Promise<void>, 
        remove: (id: number | string) => Promise<void> 
    }
] {
    const [data, setData] = useState<T[]>([]);

    useEffect(() => {
        if (!db || !branchId) return;

        const collectionRef = db.collection(`branches/${branchId}/${collectionName}`);

        const unsubscribe = collectionRef.onSnapshot(snapshot => {
            const items: T[] = [];
            snapshot.forEach(doc => {
                items.push(doc.data() as T);
            });
            setData(items);
        }, error => {
            console.error(`Error syncing collection ${collectionName}:`, error);
        });

        return () => unsubscribe();
    }, [branchId, collectionName]);

    const actions = {
        add: async (item: T) => {
            if (!db || !branchId) return;
            const docId = item.id.toString();
            await db.collection(`branches/${branchId}/${collectionName}`).doc(docId).set({
                ...item,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // Timestamp Guard
            });
        },
        update: async (id: number | string, updates: Partial<T>) => {
            if (!db || !branchId) return;
            await db.collection(`branches/${branchId}/${collectionName}`).doc(id.toString()).update({
                ...updates,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        },
        remove: async (id: number | string) => {
            if (!db || !branchId) return;
            await db.collection(`branches/${branchId}/${collectionName}`).doc(id.toString()).delete();
        }
    };

    return [data, actions];
}
