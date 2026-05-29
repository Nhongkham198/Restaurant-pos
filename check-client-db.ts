import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

// Initialize Firebase client
const app = firebase.initializeApp(firebaseConfig);
const db = (app as any).firestore(firebaseConfig.firestoreDatabaseId);

// Use settings that work best in this terminal environment
db.settings({
  experimentalForceLongPolling: true
});

async function check() {
  try {
    console.log("Checking Web Client Firestore database:", firebaseConfig.firestoreDatabaseId);
    
    // We want to list tables. How do we know what branchId is used?
    // Let's get the active branches first. 'branches' is in MIGRATED_COLLECTIONS so it's a collection of documents.
    const branchesSnapshot = await db.collection('branches').get();
    console.log(`Found ${branchesSnapshot.size} branches.`);
    
    for (const doc of branchesSnapshot.docs) {
      console.log(`Branch Document: ${doc.id}`);
      const tablesCol = db.collection(`branches/${doc.id}/tables`);
      const tablesSnaps = await tablesCol.get();
      console.log(`  Tables size in branches/${doc.id}/tables: ${tablesSnaps.size}`);
      tablesSnaps.docs.forEach((tableDoc: any) => {
        const tData = tableDoc.data();
        console.log(`    Table ID: ${tableDoc.id}, Name: ${tData.name}, Floor: ${tData.floor}, Data:`, JSON.stringify(tData));
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error during check:", error);
    process.exit(1);
  }
}

check();
