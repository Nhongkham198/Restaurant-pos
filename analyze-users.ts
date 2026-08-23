import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

// Initialize Firebase client
const app = firebase.initializeApp(firebaseConfig);
const db = (app as any).firestore(firebaseConfig.firestoreDatabaseId);

db.settings({
  experimentalForceLongPolling: true
});

async function run() {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    console.log("ALL USERS:", JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
