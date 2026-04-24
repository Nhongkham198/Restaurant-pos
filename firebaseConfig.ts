
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
    
    // Use settings that work best in this environment
    db.settings({
      experimentalForceLongPolling: true
    });
    
    auth = firebase.auth();
    functions = firebase.app().functions('asia-southeast1');
    
    isSupported().then(supported => {
      if (supported) {
        messaging = getMessaging(app);
      }
    });
    
    storage = getStorage(app);
    
    // Persistence disabled temporarily to fix connectivity issues
    // db.enablePersistence({ synchronizeTabs: true }) ... removed for stability

    // Test connection with retry logic
    const testConnection = async (retries = 3) => {
      try {
        if (!db) return;
        console.log("[Firebase] Testing connection... attempt", 4 - retries);
        // source: 'server' forces a network request
        await db.collection('test').doc('connection').get({ source: 'server' });
        console.log("Firebase connection verified");
      } catch (error: any) {
        if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
            console.log("Firebase connected (reachable but permission restricted)");
        } else if (retries > 0) {
            console.warn(`Connection attempt failed, retrying... (${retries} left)`);
            setTimeout(() => testConnection(retries - 1), 2000);
        } else {
            console.error("Firebase connection failed final:", {
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
