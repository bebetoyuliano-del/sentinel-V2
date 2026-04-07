import express from 'express';
import axios from 'axios';
import { withFirestoreFailSoft, jsonDegraded, markFirestoreUnavailable } from '../../src/paper-engine/firestore_failsoft.js';

const app = express();

app.get('/api/test-degraded', async (req, res) => {
  const mockFirestoreCall = async () => {
    throw new Error("Quota exceeded.");
  };

  const result = await withFirestoreFailSoft(
    mockFirestoreCall,
    [],
    (err) => {}
  );

  if (!result.length) {
    return res.status(200).json(
      jsonDegraded('FIRESTORE_UNAVAILABLE', 'Data unavailable, returning degraded empty data', [])
    );
  }

  return res.status(200).json(result);
});

async function runTest() {
  console.log("==================================================");
  console.log("[SMOKE B] DEGRADED API TEST");
  console.log("==================================================");
  
  const server = app.listen(0, async () => {
    const port = (server.address() as any).port;
    
    // 1. Trigger quota error
    console.log("1. Triggering Firestore Quota Error...");
    markFirestoreUnavailable(60_000); // Force degraded mode
    
    // 2. Call API
    console.log(`2. Calling http://localhost:${port}/api/test-degraded...`);
    try {
      const response = await axios.get(`http://localhost:${port}/api/test-degraded`);
      
      console.log("   -> Status:", response.status);
      console.log("   -> Content-Type:", response.headers['content-type']);
      console.log("   -> Body:", JSON.stringify(response.data, null, 2));
      
      if (response.data.degraded === true && response.data.code === 'FIRESTORE_UNAVAILABLE') {
        console.log("   -> SUCCESS: API returned JSON degraded response.");
      } else {
        console.log("   -> FAILED: API did not return expected degraded JSON.");
      }
    } catch (err: any) {
      console.log("   -> Error:", err.message);
    } finally {
      server.close();
    }
  });
}

runTest().catch(console.error);
