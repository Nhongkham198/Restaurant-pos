import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import type { Table } from '../types';

export function useFirestoreSync<T>(
    branchId: string | null,
    collectionKey: string,
    initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [value, setValue] = useState<T>(initialValue);
    const initialValueRef = useRef(initialValue);

    useEffect(() => {
        if (!db) {
            console.error("Firestore is not initialized.");
            return;
        }

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(collectionKey);
        const currentInitialValue = initialValueRef.current;

        if (isBranchSpecific && !branchId) {
            setValue(currentInitialValue);
            return;
        }

        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        // FIX: Use v8 API: db.doc('path/to/doc')
        const docRef = db.doc(pathSegments.join('/'));

        // FIX: Use v8 API: docRef.onSnapshot(...)
        const unsubscribe = docRef.onSnapshot(
            (docSnapshot) => {
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    if (data && typeof data.value !== 'undefined') {
                        let valueToSet = data.value;

                        // More robust deduplication for 'tables' with self-healing
                        if (collectionKey === 'tables' && Array.isArray(valueToSet)) {
                            const rawTablesFromDb = valueToSet as Table[];
                            const uniqueTablesMap = new Map<string, Table>();
                            
                            rawTablesFromDb.forEach(table => {
                                if (table && table.name && table.floor) {
                                    const key = `${table.name.trim().toLowerCase()}-${table.floor.trim().toLowerCase()}`;
                                    // Only add if it's the first time we see this key to preserve original IDs if possible
                                    if (!uniqueTablesMap.has(key)) {
                                        uniqueTablesMap.set(key, table);
                                    }
                                }
                            });
                            const cleanedUniqueTables = Array.from(uniqueTablesMap.values());

                            // If data corruption (duplicates) was detected, write the clean version back to Firestore.
                            if (rawTablesFromDb.length > cleanedUniqueTables.length) {
                                console.warn(`[Firestore Sync] Found and removed ${rawTablesFromDb.length - cleanedUniqueTables.length} duplicate tables. Auto-correcting data in Firestore.`);
                                // Fire and forget: update Firestore in the background without waiting.
                                // FIX: Use v8 API: docRef.set(...)
                                docRef.set({ value: cleanedUniqueTables }).catch(err => {
                                    console.error("Failed to write cleaned table data back to Firestore:", err);
                                });
                            }

                            // Always use the cleaned data for the local state.
                            valueToSet = cleanedUniqueTables;
                        }

                        // Self-healing for 'users' collection
                        if (collectionKey === 'users' && Array.isArray(valueToSet) && valueToSet.length === 0 && Array.isArray(currentInitialValue) && currentInitialValue.length > 0) {
                            console.warn(`'users' collection is empty in Firestore. Re-initializing with default value.`);
                            docRef.set({ value: currentInitialValue });
                            setValue(currentInitialValue);
                        } else if (collectionKey === 'branches' && Array.isArray(valueToSet) && valueToSet.length === 0 && Array.isArray(currentInitialValue) && currentInitialValue.length > 0) {
                            console.warn(`'branches' collection is empty in Firestore. Re-initializing with default value.`);
                            // FIX: Use v8 API: docRef.set(...)
                            docRef.set({ value: currentInitialValue });
                            setValue(currentInitialValue);
                        } else {
                            setValue(valueToSet as T);
                        }
                    } else {
                        console.warn(`Document at ${pathSegments.join('/')} is malformed. Overwriting with initial value.`);
                        // FIX: Use v8 API: docRef.set(...)
                        docRef.set({ value: currentInitialValue });
                        setValue(currentInitialValue);
                    }
                } else {
                    console.log(`Document at ${pathSegments.join('/')} not found. Creating...`);
                    // FIX: Use v8 API: docRef.set(...)
                    docRef.set({ value: currentInitialValue });
                    setValue(currentInitialValue);
                }
            }, 
            (error) => {
                console.error(`Error listening to document ${pathSegments.join('/')}:`, error);
            }
        );
        
        return () => unsubscribe();
    }, [branchId, collectionKey]);

    const setFirestoreValue: React.Dispatch<React.SetStateAction<T>> = (newValueAction) => {
        const newValue = newValueAction instanceof Function ? newValueAction(value) : newValueAction;
        
        setValue(newValue);

        if (!db) {
            console.error("Firestore is not initialized. Cannot save data.");
            return;
        }

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(collectionKey);
        
        if (isBranchSpecific && !branchId) {
            console.warn(`Cannot save to ${collectionKey} without a branchId. Data is only local.`);
            return;
        }
        
        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        // FIX: Use v8 API: db.doc('path/to/doc')
        const docRef = db.doc(pathSegments.join('/'));

        // FIX: Use v8 API: docRef.set(...)
        docRef.set({ value: newValue }).catch(error => {
            console.error(`Error setting document ${pathSegments.join('/')}:`, error);
        });
    };

    return [value, setFirestoreValue];
}