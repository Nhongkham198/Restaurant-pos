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
    const leaveRequestsSnapshot = await db.collection('leaveRequests').get();
    const leaveRequests = leaveRequestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    
    const tal = users.find((u: any) => u.username === 'Tal');
    console.log("Tal quotas:", tal ? tal.leaveQuotas : "NOT FOUND");

    const talLeaves = leaveRequests.filter((r: any) => r.employeeName === 'Tal' || r.userId === 7);
    console.log("\nTal Leave Requests:");
    talLeaves.forEach((l: any) => {
      console.log(`ID: ${l.id}, Type: ${l.type}, Status: ${l.status}, Start: ${l.startDate} (${typeof l.startDate}), End: ${l.endDate} (${typeof l.endDate}), IsHalfDay: ${l.isHalfDay}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
