import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDynamicExpiration } from '@/lib/utils/document-calc';

export async function syncDependentDocumentsExpiration(personnelId: string, client?: any) {
  const db = client || createAdminClient();
  
  // 1. Fetch active definitions
  const { data: defs } = await db
    .from('document_definitions')
    .select('*')
    .eq('is_active', true);
  if (!defs || defs.length === 0) return;

  // 2. Fetch the worker's documents
  const { data: docs } = await db
    .from('documents')
    .select('*')
    .eq('personnel_id', personnelId);
  if (!docs || docs.length === 0) return;

  // 3. For each document, check if its definition is dependent
  for (const doc of docs) {
    const def = defs.find((d: any) => d.id === doc.definition_id);
    if (def?.requires_expiration && def.depends_on_definition_id) {
      // It depends on another document. Find that anchor document.
      const anchorDoc = docs.find((d: any) => d.definition_id === def.depends_on_definition_id);
      if (anchorDoc?.expiration_date) {
        // Calculate the dynamic expiration date
        const calcDate = calculateDynamicExpiration(
          new Date(anchorDoc.expiration_date + 'T12:00:00'),
          def.cycle_months || 6,
          def.anchor_days_offset || 30
        );
        const newExpirationStr = calcDate.toISOString().split('T')[0];

        // Update the database record if it changed
        if (doc.expiration_date !== newExpirationStr) {
          await db
            .from('documents')
            .update({ expiration_date: newExpirationStr })
            .eq('id', doc.id);
        }
      }
    }
  }
}
