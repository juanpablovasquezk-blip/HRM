/**
 * Deletes all documents and personnel letters (Storage files + DB rows) for a worker.
 * Server-only helper (must NOT have 'use server' so it is never exposed as a public Server Action).
 */
export async function deletePersonnelDocumentsAndLetters(
  personnelId: string,
  adminClient: any
): Promise<void> {
  try {
    // 1. Delete files from storage and rows from 'documents' table
    const { data: docs } = await adminClient
      .from('documents')
      .select('file_url')
      .eq('personnel_id', personnelId);

    if (docs && docs.length > 0) {
      const paths = docs
        .map((d: any) => {
          if (!d.file_url) return null;
          const marker = '/documents/';
          const idx = d.file_url.lastIndexOf(marker);
          return idx !== -1 ? d.file_url.substring(idx + marker.length) : null;
        })
        .filter(Boolean) as string[];

      if (paths.length > 0) {
        await adminClient.storage.from('documents').remove(paths);
      }
    }
    await adminClient.from('documents').delete().eq('personnel_id', personnelId);

    // 2. Delete files from storage and rows from 'personnel_letters' table
    const { data: letters } = await adminClient
      .from('personnel_letters')
      .select('file_url')
      .eq('personnel_id', personnelId);

    if (letters && letters.length > 0) {
      const paths = letters
        .map((l: any) => {
          if (!l.file_url) return null;
          const marker = '/documents/';
          const idx = l.file_url.lastIndexOf(marker);
          return idx !== -1 ? l.file_url.substring(idx + marker.length) : null;
        })
        .filter(Boolean) as string[];

      if (paths.length > 0) {
        await adminClient.storage.from('documents').remove(paths);
      }
    }
    await adminClient.from('personnel_letters').delete().eq('personnel_id', personnelId);

    console.log(`[CLEANUP] Successfully deleted documents and letters for personnel ${personnelId}`);
  } catch (err) {
    console.error(`[CLEANUP] Error in deletePersonnelDocumentsAndLetters for ${personnelId}:`, err);
  }
}
