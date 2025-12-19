
// FIX: Updated Firebase imports to use the v9 compatibility layer, which provides the v8 namespaced API and fixes initialization errors.
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/functions";

// TODO: Replace the following with your app's Firebase project configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCVLo7EeWsDSR1tWmucYuZq7uOuV8zvqXI",
  authDomain: "restaurant-pos-f8bd4.firebaseapp.com",
  projectId: "restaurant-pos-f8bd4",
  storageBucket: "restaurant-pos-f8bd4.firebasestorage.app",
  messagingSenderId: "822986056017",
  appId: "1:822986056017:web:a1955349d8d94adcda3370",
  measurementId: "G-2B6ZS4VYMF"
};

// --- CHECK FOR PLACEHOLDER VALUES ---
export const isFirebaseConfigured = 
    firebaseConfig.apiKey !== "YOUR_API_KEY" && 
    firebaseConfig.messagingSenderId !== "YOUR_MESSAGING_SENDER_ID" && 
    firebaseConfig.appId !== "YOUR_APP_ID";

let app;
let db: any = null; // Initialize db as null
let functions: any = null; // Initialize functions as null

if (isFirebaseConfigured) {
  try {
    // FIX: Switched to v8 initialization syntax to resolve module loading error.
    if (!firebase.apps.length) {
      app = firebase.initializeApp(firebaseConfig);
    } else {
      app = firebase.app();
    }
    
    db = firebase.firestore();
    
    // --- ENABLE OFFLINE PERSISTENCE ---
    // This allows the app to work offline by caching data locally.
    // It acts as a local buffer, satisfying the requirement to store data locally before sending to Firebase.
    db.enablePersistence({ synchronizeTabs: true })
      .catch((err: any) => {
          if (err.code == 'failed-precondition') {
              console.warn('Persistence failed: Multiple tabs open. (Only one tab can work offline at a time)');
          } else if (err.code == 'unimplemented') {
              console.warn('Persistence failed: Browser not supported.');
          }
      });

    functions = firebase.functions();
  } catch (e) {
    console.error("Error initializing Firebase. Please check your config.", e);
    // isFirebaseConfigured should remain true, but db will be null, and errors will be caught.
  }
}

export { db, functions };
