
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebaseConfig';
import type { Table, OrderCounter } from '../types';

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

        // Include metadata changes so local writes (pending to server) trigger updates immediately.
        // This ensures the UI feels "instant" even if the data hasn't reached the server yet.
        const unsubscribe = docRef.onSnapshot(
            { includeMetadataChanges: true }, 
            (docSnapshot) => {
                // Determine if we should use the data. 
                // If it exists, use it (whether from cache or server).
                // With enablePersistence, docSnapshot.exists will be true even if offline, provided data was cached.
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    
                    // Optional: You can check docSnapshot.metadata.fromCache if you need to know source.
                    // console.log(`Data for ${collectionKey} from cache: ${docSnapshot.metadata.fromCache}`);

                    if (data && typeof data.value !== 'undefined') {
                        let valueToSet = data.value;

                        // --- Validation & Cleanup Logic (Read-Only) ---
                        
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
                            // Use cleaned unique tables locally
                            valueToSet = Array.from(uniqueTablesMap.values());
                        } 
                        else if (collectionKey === 'orderCounter') {
                            const counterData = valueToSet as any;
                            
                            // Robust validation: If invalid, use local initial value but DO NOT overwrite DB
                            if (!counterData || typeof counterData !== 'object' || typeof counterData.count !== 'number') {
                                console.warn(`'orderCounter' in DB has invalid format. Using local initial value.`);
                                setValue(currentInitialValue);
                                return;
                            }

                            const { count, lastResetDate } = counterData;
                            let correctedDateString = '';

                            if (typeof lastResetDate === 'string') {
                                if (/^\d{4}-\d{2}-\d{2}$/.test(lastResetDate)) {
                                    correctedDateString = lastResetDate;
                                }
                            } else if (lastResetDate && typeof lastResetDate.toDate === 'function') {
                                // Firestore Timestamp conversion
                                const dateObj = lastResetDate.toDate();
                                const year = dateObj.getFullYear();
                                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                                const day = String(dateObj.getDate()).padStart(2, '0');
                                correctedDateString = `${year}-${month}-${day}`;
                            }
                            
                            if (correctedDateString) {
                                valueToSet = { count, lastResetDate: correctedDateString };
                            } else {
                                // Invalid date format, fallback locally
                                console.warn(`'orderCounter' date invalid. Using local initial value.`);
                                setValue(currentInitialValue);
                                return;
                            }
                        }

                        setValue(valueToSet as T);
                    } else {
                        console.warn(`Document at ${pathSegments.join('/')} exists but is malformed. Using initial value locally.`);
                        setValue(currentInitialValue);
                    }
                } else {
                    // Document does not exist.
                    // CRITICAL: We only revert to initialValue if the document TRULY doesn't exist.
                    // With persistence enabled, if we are just offline, 'exists' might still be true if cached.
                    // If it's effectively a new install/clean cache, we use initial value but DO NOT automatically write back.
                    console.log(`Document not found at ${pathSegments.join('/')}. Using initial value locally.`);
                    setValue(currentInitialValue);
                }
            },
            (error) => {
                console.error(`Firestore sync error for ${collectionKey}:`, error);
                // On error (permission denied, etc.), keep existing state or initial value.
                // Do NOT overwrite DB.
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
            
            // Write to DB. With persistence enabled, this writes to local cache first (instant),
            // and then synchronizes to the server when online.
            docRef.set({ value: resolvedValue })
                .catch(err => {
                    console.error(`Failed to write ${collectionKey} to Firestore:`, err);
                });

            return resolvedValue;
        });
    }, [branchId, collectionKey]);

    return [value, setAndSyncValue];
}
