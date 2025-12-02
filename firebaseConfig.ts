

// FIX: Update imports to use v9 compat mode to make namespaced APIs available.
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
    if (!firebase.apps.length) {
      app = firebase.initializeApp(firebaseConfig);
    } else {
      app = firebase.app();
    }
    db = firebase.firestore();
    // FIX: Enable long polling to prevent "Could not reach Cloud Firestore backend" errors
    db.settings({ experimentalForceLongPolling: true });
    functions = firebase.functions();
  } catch (e) {
    console.error("Error initializing Firebase. Please check your config.", e);
    // isFirebaseConfigured should remain true, but db will be null, and errors will be caught.
  }
}

export { db, functions };