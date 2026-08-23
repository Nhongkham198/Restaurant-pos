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
    
    const user = users.find((u: any) => u.username === 'Tal');
    if (!user) {
      console.log("Tal user not found");
      process.exit(1);
    }
    
    const quotas = user.leaveQuotas ?? { sick: 30, personal: 6 };
    console.log("QUOTAS FOR TAL:", quotas);

    const approvedUserLeaves = leaveRequests.filter((r: any) => r.status === 'approved' && (
        (user && r.userId === user.id) || 
        r.employeeName === 'Tal' || 
        (user && r.employeeName === user.username)
    ));

    const sortedLeaves = [...leaveRequests].sort((a, b) => {
        const timeA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const timeB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return timeB - timeA;
    });

    const getMs = (val: any) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        return new Date(val).getTime();
    };

    sortedLeaves.forEach((l) => {
      if (l.employeeName !== 'Tal' && l.userId !== 7) return;

      const currentStartMs = getMs(l.startDate);

      const approvedUserLeavesUpToPoint = approvedUserLeaves.filter(r => {
          return getMs(r.startDate) <= currentStartMs;
      });

      const usedSick = approvedUserLeavesUpToPoint.reduce((acc, req) => {
          if (req.type === 'sick') {
              const diffTime = Math.abs(req.endDate - req.startDate);
              const duration = req.isHalfDay ? 0.5 : Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
              return acc + duration;
          }
          return acc;
      }, 0);

      const usedPersonal = approvedUserLeavesUpToPoint.reduce((acc, req) => {
          if (req.type === 'personal') {
              const diffTime = Math.abs(req.endDate - req.startDate);
              const duration = req.isHalfDay ? 0.5 : Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
              return acc + duration;
          }
          return acc;
      }, 0);

      const maxSick = quotas.sick ?? 30;
      const maxPersonal = quotas.personal ?? 6;

      const remainingSick = Math.max(0, maxSick - usedSick);
      const remainingPersonal = Math.max(0, maxPersonal - usedPersonal);
      const remainingTotalPaid = remainingSick + remainingPersonal;

      console.log(`Row ${new Date(l.startDate).toLocaleDateString('th-TH')}: ` +
                  `Type: ${l.type}, ` +
                  `upToPointLeavesCount: ${approvedUserLeavesUpToPoint.length}, ` +
                  `usedSick: ${usedSick}, usedPersonal: ${usedPersonal}, ` +
                  `remainingSick: ${remainingSick}, remainingPersonal: ${remainingPersonal}, remainingTotalPaid: ${remainingTotalPaid}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
