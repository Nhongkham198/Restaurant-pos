import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = firebase.initializeApp(firebaseConfig);
const db = (app as any).firestore(firebaseConfig.firestoreDatabaseId);

db.settings({
  experimentalForceLongPolling: true
});

async function findPingLogs() {
  try {
    console.log("Fetching all stock logs from branch 1...");
    const snap = await db.collection('branches').doc('1').collection('stockLogs').get();
    
    const logs: any[] = [];
    snap.forEach((doc: any) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    
    console.log("Total logs:", logs.length);
    
    const pingLogs = logs.filter(log => 
      String(log.performedBy).toLowerCase().includes('ping') || 
      String(log.changeDetails).toLowerCase().includes('ping')
    );
    
    console.log(`Found ${pingLogs.length} logs matching 'Ping':`);
    pingLogs.slice(0, 30).forEach(log => {
      console.log(`ID: ${log.id} | User: ${log.performedBy} | Item: ${log.stockItemName} | Action: ${log.action} | Details: ${log.changeDetails}`);
    });
    
    const uniqueUsers = new Set(logs.map(l => l.performedBy));
    console.log("Unique users who performed actions in stock logs:", Array.from(uniqueUsers));
    
    process.exit(0);
  } catch (error) {
    console.error("Error listing stock logs:", error);
    process.exit(1);
  }
}

findPingLogs();
