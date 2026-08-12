import { createClient } from '@/lib/supabase/server';
import { UploadDocumentClient } from './upload-document-client';
import { getDocumentDefinitions } from '@/app/(dashboard)/settings/documents/actions';

export default async function DocumentUploadPage() {
  const supabase = await createClient();
  
  const [{ data: personnel }, definitions] = await Promise.all([
    supabase
      .from('personnel')
      .select('id, first_name, last_name_father, last_name_mother, main_position, secondary_positions, rut')
      .eq('is_active', true)
      .or('onboarding_status.is.null,onboarding_status.eq.approved')
      .order('first_name'),
    getDocumentDefinitions(),
  ]);

  const anchorDefIds = (definitions || [])
    .map((d) => d.depends_on_definition_id)
    .filter(Boolean) as string[];

  const personnelIds = (personnel || []).map((p) => p.id);

  const { data: documents } =
    personnelIds.length > 0 && anchorDefIds.length > 0
      ? await supabase
          .from('documents')
          .select('personnel_id, definition_id, expiration_date')
          .in('personnel_id', personnelIds)
          .in('definition_id', anchorDefIds)
      : { data: [] };

  return (
    <UploadDocumentClient
      personnelList={personnel || []}
      documentDefinitions={definitions}
      existingDocuments={documents || []}
    />
  );
}
