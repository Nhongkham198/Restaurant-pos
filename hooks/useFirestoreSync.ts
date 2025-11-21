import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export function useFirestoreSync<T>(
    branchId: string | null,
    collectionKey: string,
    initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [value, setValue] = useState<T>(initialValue);
    // The dependency on initialValue is problematic because array/object literals create new references
    // on every render, causing an infinite loop. Using JSON.stringify fixes this but can crash on
    // circular references. Using a ref for the initial value is safer, as it's stable across renders
    // and doesn't need to be in the dependency array.
    const initialValueRef = useRef(initialValue);

    useEffect(() => {
        if (!db) {
            console.error("Firestore is not initialized.");
            return;
        }

        const isBranchSpecific = !['users', 'branches'].includes(collectionKey);
        const currentInitialValue = initialValueRef.current;

        if (isBranchSpecific && !branchId) {
            // When branchId is cleared (e.g., on logout), reset the state to its initial value.
            // The previous JSON.stringify comparison was risky and could cause crashes.
            // A direct reset is safer and likely the intended behavior.
            setValue(currentInitialValue);
            return;
        }

        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];

        const docRef = doc(db, ...pathSegments);

        const unsubscribe = onSnapshot(docRef, 
            (docSnapshot) => {
                if (docSnapshot.exists()) {
                    const data = docSnapshot.data();
                    if (data && typeof data.value !== 'undefined') {
                        // FIX: If 'branches' collection is empty in Firestore, re-initialize it.
                        // This ensures the first default branch is always available if the admin accidentally deletes all branches.
                        if (collectionKey === 'branches' && Array.isArray(data.value) && data.value.length === 0 && Array.isArray(currentInitialValue) && currentInitialValue.length > 0) {
                            console.warn(`'branches' collection is empty in Firestore. Re-initializing with default value.`);
                            setDoc(docRef, { value: currentInitialValue }); // Write the initial value back to DB
                            setValue(currentInitialValue); // Use the initial value locally
                        } else {
                            setValue(data.value as T);
                        }
                    } else {
                        console.warn(`Document at ${pathSegments.join('/')} is malformed. Overwriting with initial value.`);
                        setDoc(docRef, { value: currentInitialValue });
                        setValue(currentInitialValue);
                    }
                } else {
                    console.log(`Document at ${pathSegments.join('/')} not found. Creating...`);
                    setDoc(docRef, { value: currentInitialValue });
                    setValue(currentInitialValue);
                }
            }, 
            (error) => {
                console.error(`Error listening to document ${pathSegments.join('/')}:`, error);
            }
        );
        
        return () => unsubscribe();
    }, [branchId, collectionKey]); // The dependency on initialValue is removed.

    const setFirestoreValue: React.Dispatch<React.SetStateAction<T>> = (newValueAction) => {
        const newValue = newValueAction instanceof Function ? newValueAction(value) : newValueAction;
        
        setValue(newValue);

        if (!db) {
            console.error("Firestore is not initialized. Cannot save data.");
            return;
        }

        const isBranchSpecific = !['users', 'branches'].includes(collectionKey);
        
        if (isBranchSpecific && !branchId) {
            console.warn(`Cannot save to ${collectionKey} without a branchId. Data is only local.`);
            return;
        }
        
        const pathSegments = isBranchSpecific && branchId
            ? ['branches', branchId, collectionKey, 'data']
            : [collectionKey, 'data'];
        
        const docRef = doc(db, ...pathSegments);

        setDoc(docRef, { value: newValue }).catch(error => {
            console.error(`Error setting document ${pathSegments.join('/')}:`, error);
        });
    };

    return [value, setFirestoreValue];
}