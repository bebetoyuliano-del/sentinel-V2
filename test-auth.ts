import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  try {
    const cred = await signInWithEmailAndPassword(auth, 'server@sentinel.local', process.env.SERVER_PASSWORD || 'sentinel-server-secret-123');
    console.log('Auth success:', cred.user.uid);
    const d = await getDoc(doc(db, 'paper_wallet', 'main'));
    console.log('Read success:', d.exists());
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
}
test();
