
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/functions";
import "firebase/compat/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";
import firebaseConfig from './firebase-applet-config.json';

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
    
    // Use the specific firestoreDatabaseId from config
    console.log("[Firebase] Initializing with Database ID:", firebaseConfig.firestoreDatabaseId);
    db = (firebase.app() as any).firestore(firebaseConfig.firestoreDatabaseId);
    
    auth = firebase.auth();
    functions = firebase.app().functions('asia-southeast1');
    
    isSupported().then(supported => {
      if (supported) {
        messaging = getMessaging(app);
      }
    });
    
    storage = getStorage(app);
    
    db.enablePersistence({ synchronizeTabs: true })
      .catch((err: any) => {
          if (err.code == 'failed-precondition') {
              console.warn('Persistence failed: Multiple tabs open');
          } else if (err.code == 'unimplemented') {
              console.warn('Persistence failed: Browser not supported.');
          }
      });

    // Test connection as required by constraints
    const testConnection = async () => {
      try {
        if (!db) return;
        await db.collection('test').doc('connection').get({ source: 'server' });
        console.log("Firebase connection verified");
      } catch (error: any) {
        if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
            // Permission denied is actually a good sign - it means we reached the server
            console.log("Firebase connected (permission denied/missing expected)");
        } else {
            console.error("Firebase connection failed details:", {
                code: error?.code,
                message: error?.message,
                projectId: firebaseConfig.projectId,
                databaseId: firebaseConfig.firestoreDatabaseId
            });
        }
      }
    };
    testConnection();

    console.log("Firebase initialized successfully");
  } catch (e) {
    console.error("Error initializing Firebase:", e);
  }
}

export { firebase, db, functions, storage, auth, messaging };
