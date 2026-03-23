import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Read the service account
const serviceAccount = JSON.parse(fs.readFileSync('C:\\Users\\fausb\\Downloads\\Control de entrada\\serviceAccountKey.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function cleanVisitas() {
  const snapshot = await db.collection('visitas').get();
  let deletedCount = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.fecha === 'Invalid Date' || !data.fecha) {
      console.log(`Deleting corrupted visita: ${doc.id}`);
      await doc.ref.delete();
      deletedCount++;
    }
  }
  console.log(`Finished. Deleted ${deletedCount} corrupted records.`);
}

cleanVisitas().catch(console.error);
