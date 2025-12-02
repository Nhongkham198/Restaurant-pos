

import React, { useState, useEffect, useRef } from 'react';
// FIX: Update import to match importmap key (using v9 compat mode via 'firebase/app')
import firebase from 'firebase/compat/app';
// FIX: Import firestore compat to make `firebase.firestore` types available.
import 'firebase/compat/firestore';
import { db } from '../firebaseConfig';
import type { Table, User, Branch } from '../types';
// Import defaults for self-healing logic
import { DEFAULT_USERS, DEFAULT_BRANCHES } from '../constants';

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
        
        // Use v8 API: db.doc('path/to/doc')
        const docRef = db.doc(pathSegments.join('/'));

        // Use v8 API: docRef.onSnapshot(...)
        const unsubscribe = docRef.onSnapshot(
            (docSnapshot: firebase.firestore.DocumentSnapshot) => {
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
                                    if (!uniqueTablesMap.has(key)) {
                                        uniqueTablesMap.set(key, table);
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

                        // Self-healing for 'users' and 'branches'
                        if ((collectionKey === 'users' || collectionKey === 'branches') && Array.isArray(valueToSet) && valueToSet.length === 0) {
                             console.warn(`'${collectionKey}' collection is empty in Firestore. Re-initializing with default value.`);
                             const defaultValue = collectionKey === 'users' ? DEFAULT_USERS : DEFAULT_BRANCHES;
                             docRef.set({ value: defaultValue });
                             setValue(defaultValue as unknown as T);
                             return; // Prevent setting the empty value momentarily
                        }
                        
                        setValue(valueToSet as T);
                        
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
            (error: Error) => {
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
        
        const docRef = db.doc(pathSegments.join('/'));

        docRef.set({ value: newValue }).catch(error => {
            console.error(`Error setting document ${pathSegments.join('/')}:`, error);
        });
    };

    return [value, setFirestoreValue];
}