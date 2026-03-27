import { Storage } from '@google-cloud/storage';

export async function uploadAnalysisToGCS(
  analysisData: any, 
  metadata: Record<string, any> = {},
  options?: {
    bucket?: string,
    prefix?: string,
    signedUrlTtl?: number
  }
) {
  const bucketName = options?.bucket || process.env.GCS_BUCKET?.trim();
  const prefix = options?.prefix || process.env.GCS_PREFIX?.trim() || 'sentinel-analysis';
  const signedUrlTtl = options?.signedUrlTtl || parseInt(process.env.GCS_SIGNED_URL_TTL || '604800', 10);

  if (!bucketName) {
    console.warn("⚠️ GCS upload skipped: GCS_BUCKET not set.");
    return null;
  }
  try {
    // Buat nama objek deterministik & mudah dicari
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const sym = Array.isArray(analysisData?.decision_cards) && analysisData.decision_cards[0]?.symbol
                ? String(analysisData.decision_cards[0].symbol).replace(/[^\w\-./]/g, "_")
                : "UNSPEC";
    const objectName = `${prefix.replace(/\/+$/,"")}/${ts}_${sym}.json`;

    const body = JSON.stringify({
      uploaded_at: new Date().toISOString(),
      meta: metadata || {},
      analysis: analysisData
    }, null, 2);

    let url: string | null = null;

    const storage = new Storage(); // gunakan ADC/GOOGLE_APPLICATION_CREDENTIALS
    const bucket = storage.bucket(bucketName);

    // Check if bucket exists first to avoid confusing permission errors if it doesn't
    const [exists] = await bucket.exists().catch(() => [false]);
    if (!exists) {
      console.warn(`⚠️ GCS bucket '${bucketName}' not found or inaccessible. Skipping upload.`);
      return null;
    }

    const file = bucket.file(objectName);

    await file.save(body, {
      resumable: false,
      contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: "no-store" }
    });

    // Karena bucket tidak bisa dibuat public (Org Policy), kita SELALU gunakan Signed URL
    // Signed URL v4 (GET) dengan TTL dari env
    const [signed] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + (Math.max(60, signedUrlTtl) * 1000) // min 60s
    });
    url = signed;

    console.log("✅ GCS uploaded:", objectName);
    return { objectName, url };
  } catch (e: any) {
    const errorMsg = e.message || e;
    console.error(`❌ GCS upload failed: ${errorMsg}`);
    if (errorMsg.includes('storage.objects.create')) {
      console.error(`💡 ACTION REQUIRED: The service account 'ais-sandbox@ais-asia-southeast1-7ebde40c3e.iam.gserviceaccount.com' does not have permission to create objects in bucket '${bucketName}'. Please grant it the 'Storage Object Creator' role in the Google Cloud Console.`);
    }
    return null;
  }
}
