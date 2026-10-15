/**
 * Non-blocking webhook trigger to notify WOMM (Work Order Manager)
 * whenever personnel is created, updated, activated, or deactivated in HRM.
 */
export function triggerWommSync(): void {
  const wommUrl = process.env.WOMM_APP_URL || "https://womm.corecustom.net";
  const syncSecret = process.env.WOMM_SYNC_SECRET || "womm_hrm_sync_secret_2026";

  try {
    fetch(`${wommUrl}/api/sync/hrm`, {
      method: "POST",
      headers: {
        "x-sync-secret": syncSecret,
        "Content-Type": "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) {
          console.warn(`[WOMM Sync Webhook] Server responded with status ${res.status}`);
        }
      })
      .catch((err) => {
        console.warn("[WOMM Sync Webhook] Network error:", err.message);
      });
  } catch (err: any) {
    console.warn("[WOMM Sync Webhook] Failed to trigger sync:", err.message);
  }
}
