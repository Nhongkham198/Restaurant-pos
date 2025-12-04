import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebaseConfig';
import type { Table } from '../types';

export function useFirestoreSync<T>(
    branchId: string | null,
    collectionKey: string,
    initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [value, setValue] = useState<T>(initialValue);
    const initialValueRef = useRef(initialValue);
    
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
            (docSnapshot) => {
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    if (data && typeof data.value !== 'undefined') {
                        let valueToSet = data.value;

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
                            const cleanedUniqueTables = Array.from(uniqueTablesMap.values());

                            if (rawTablesFromDb.length > cleanedUniqueTables.length) {
                                console.warn(`[Firestore Sync] Found and removed ${rawTablesFromDb.length - cleanedUniqueTables.length} duplicate tables. Auto-correcting data in Firestore.`);
                                docRef.set({ value: cleanedUniqueTables }).catch(err => {
                                    console.error("Failed to write cleaned table data back to Firestore:", err);
                                });
                            }

                            valueToSet = cleanedUniqueTables;
                        }

                        if (collectionKey === 'users' && Array.isArray(valueToSet) && valueToSet.length === 0 && Array.isArray(currentInitialValue) && currentInitialValue.length > 0) {
                            console.warn(`'users' collection is empty in Firestore. Re-initializing with default value.`);
                            docRef.set({ value: currentInitialValue });
                            setValue(currentInitialValue);
                        } else if (collectionKey === 'branches' && Array.isArray(valueToSet) && valueToSet.length === 0 && Array.isArray(currentInitialValue) && currentInitialValue.length > 0) {
                            console.warn(`'branches' collection is empty in Firestore. Re-initializing with default value.`);
                            docRef.set({ value: currentInitialValue });
                            setValue(currentInitialValue);
                        } else {
                            setValue(valueToSet as T);
                        }
                    } else {
                        console.warn(`Document at ${pathSegments.join('/')} is malformed. Overwriting with initial value.`);
                        docRef.set({ value: currentInitialValue });
                        setValue(currentInitialValue);
                    }
                } else {
                    console.log(`Document at ${pathSegments.join('/')} not found. Creating...`);
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

    const setFirestoreValue: React.Dispatch<React.SetStateAction<T>> = useCallback((newValueAction) => {
        const newValue = newValueAction instanceof Function ? newValueAction(valueRef.current) : newValueAction;
        
        // Optimistically update local state right away.
        setValue(newValue);
        
        if (!db) {
            console.error("Firestore is not initialized.");
            return;
        }

        const isBranchSpecific = !['users', 'branches', 'leaveRequests'].includes(collectionKey);
        
        if (isBranchSpecific && !branchId) {
            console.warn(`Attempted to set value for branch-specific collection '${collectionKey}' without a branchId.`);
            return;
        }

        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        const docRef = db.doc(pathSegments.join('/'));
        
        docRef.set({ value: newValue }).catch(error => {
            console.error(`Error writing document ${pathSegments.join('/')}:`, error);
        });
    }, [branchId, collectionKey]);

    return [value, setFirestoreValue];
}
