
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/functions";
import "firebase/compat/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCVLo7EeWsDSR1tWmucYuZq7uOuV8zvqXI",
  authDomain: "restaurant-pos-f8bd4.firebaseapp.com",
  projectId: "restaurant-pos-f8bd4",
  storageBucket: "restaurant-pos-f8bd4.appspot.com",
  messagingSenderId: "822986056017",
  appId: "1:822986056017:web:a1955349d8d94adcda3370",
  measurementId: "G-2B6ZS4VYMF"
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

let app: any;
let db: any = null;
let functions: any = null;
let storage: any = null;
let auth: any = null;
let messaging: any = null;

if (isFirebaseConfigured) {
  try {
    if (!firebase.apps.length) {
      app = firebase.initializeApp(firebaseConfig);
    } else {
      app = firebase.app();
    }
    
    db = firebase.firestore();
    auth = firebase.auth();
    functions = firebase.app().functions('asia-southeast1');
    
    isSupported().then(supported => {
      if (supported) {
        messaging = getMessaging(app);
      }
    });
    
    // Use modular storage directly to avoid compat issues
    storage = getStorage(app);
    
    db.enablePersistence({ synchronizeTabs: true })
      .catch((err: any) => {
          if (err.code == 'failed-precondition') {
              console.warn('Persistence failed: Multiple tabs open');
          } else if (err.code == 'unimplemented') {
              console.warn('Persistence failed: Browser not supported.');
          }
      });

    console.log("Firebase initialized successfully");
  } catch (e) {
    console.error("Error initializing Firebase:", e);
  }
}

export { firebase, db, functions, storage, auth, messaging };
