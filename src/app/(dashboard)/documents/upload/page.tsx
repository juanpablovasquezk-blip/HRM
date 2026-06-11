import { createClient } from '@/lib/supabase/server';
import { UploadDocumentClient } from './upload-document-client';
import { getDocumentDefinitions } from '@/app/(dashboard)/settings/documents/actions';

export default async function DocumentUploadPage() {
  const supabase = await createClient();
  
  const [{ data: personnel }, definitions] = await Promise.all([
    supabase
      .from('personnel')
      .select('id, first_name, last_name_father, last_name_mother, main_position, secondary_positions')
      .eq('is_active', true)
      .order('first_name'),
    getDocumentDefinitions(),
  ]);

  return (
    <UploadDocumentClient
      personnelList={personnel || []}
      documentDefinitions={definitions}
    />
  );
}
