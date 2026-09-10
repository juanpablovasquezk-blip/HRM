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

  // 1b. Ensure default dependencies are strictly aligned:
  // - Hoja de Vida del conductor -> PCP
  // - Certificado de Antecedentes -> TICA
  const pcpDef = defs.find((d: any) => (d.name || '').toLowerCase().includes('pcp'));
  const ticaDef = defs.find((d: any) => (d.name || '').toLowerCase().includes('tica'));

  for (const def of defs) {
    const nameLower = (def.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (nameLower.includes('hoja de vida') && pcpDef && def.depends_on_definition_id !== pcpDef.id) {
      def.depends_on_definition_id = pcpDef.id;
      def.requires_expiration = true;
      try {
        await db.from('document_definitions').update({ depends_on_definition_id: pcpDef.id, requires_expiration: true }).eq('id', def.id);
      } catch (e) {
        console.warn('Could not update def in DB:', e);
      }
    } else if (nameLower.includes('antecedentes') && ticaDef && def.depends_on_definition_id !== ticaDef.id) {
      def.depends_on_definition_id = ticaDef.id;
      def.requires_expiration = true;
      try {
        await db.from('document_definitions').update({ depends_on_definition_id: ticaDef.id, requires_expiration: true }).eq('id', def.id);
      } catch (e) {
        console.warn('Could not update def in DB:', e);
      }
    }
  }

  // 2. Fetch the worker's documents ordered by uploaded_at DESC (newest first)
  const { data: docs } = await db
    .from('documents')
    .select('*')
    .eq('personnel_id', personnelId)
    .order('uploaded_at', { ascending: false });
  if (!docs || docs.length === 0) return;

  // 3. Deduplicate / clean up superseded older documents of same type or definition
  const toDelete: any[] = [];
  const keptDocs: any[] = [];
  const seenKeys = new Set<string>();

  for (const doc of docs) {
    // Skip RIOHS / special system docs from deduplication if they are distinct steps
    if (doc.type?.toUpperCase().startsWith('RIOHS')) {
      keptDocs.push(doc);
      continue;
    }

    const def = defs.find((d: any) => d.id === doc.definition_id)
      || defs.find((d: any) => (d.name || '').toLowerCase().trim() === (doc.type || '').toLowerCase().trim());
    
    // Normalize key
    const key = def 
      ? `def_${def.id}` 
      : `type_${(doc.type || '').toLowerCase().trim()}`;

    if (seenKeys.has(key)) {
      toDelete.push(doc);
    } else {
      seenKeys.add(key);
      // If doc lacks definition_id but matches a def, link it in DB
      if (!doc.definition_id && def) {
        doc.definition_id = def.id;
        await db.from('documents').update({ definition_id: def.id }).eq('id', doc.id);
      }
      keptDocs.push(doc);
    }
  }

  // Delete superseded documents from database and storage
  if (toDelete.length > 0) {
    const deleteIds = toDelete.map(d => d.id);
    const deletePaths = toDelete
      .map(d => {
        const url = d.file_url;
        const marker = '/documents/';
        const idx = url?.lastIndexOf(marker);
        return idx !== -1 ? url.substring(idx + marker.length) : null;
      })
      .filter(Boolean) as string[];

    if (deletePaths.length > 0) {
      try {
        await db.storage.from('documents').remove(deletePaths);
      } catch (e) {
        console.warn('Failed to remove superseded document storage files:', e);
      }
    }

    await db.from('documents').delete().in('id', deleteIds);
  }

  // 4. For each kept document, check if its definition is dependent
  for (const doc of keptDocs) {
    const def = defs.find((d: any) => d.id === doc.definition_id)
      || defs.find((d: any) => (d.name || '').toLowerCase().trim() === (doc.type || '').toLowerCase().trim());

    const docNameLower = (doc.type || def?.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Identify target anchor
    let targetAnchorDefId = def?.depends_on_definition_id;
    if (docNameLower.includes('hoja de vida') && pcpDef) {
      targetAnchorDefId = pcpDef.id;
    } else if (docNameLower.includes('antecedentes') && ticaDef) {
      targetAnchorDefId = ticaDef.id;
    }

    if (targetAnchorDefId) {
      const anchorDef = defs.find((d: any) => d.id === targetAnchorDefId);
      // Find latest anchor doc
      const anchorDoc = keptDocs.find((d: any) => 
        d.definition_id === targetAnchorDefId ||
        (anchorDef && (d.type || '').toLowerCase().trim() === (anchorDef.name || '').toLowerCase().trim())
      );

      if (anchorDoc?.expiration_date) {
        // Calculate the dynamic expiration date
        const calcDate = calculateDynamicExpiration(
          new Date(anchorDoc.expiration_date + 'T12:00:00'),
          def?.cycle_months || 6,
          def?.anchor_days_offset || 30
        );
        const newExpirationStr = calcDate.toISOString().split('T')[0];

        // Update the database record if it changed
        if (doc.expiration_date !== newExpirationStr) {
          await db
            .from('documents')
            .update({ expiration_date: newExpirationStr })
            .eq('id', doc.id);
          doc.expiration_date = newExpirationStr;
        }
      }
    }
  }
}
