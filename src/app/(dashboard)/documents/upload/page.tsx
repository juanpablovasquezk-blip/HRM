import { createClient } from '@/lib/supabase/server';
import { UploadDocumentClient } from './upload-document-client';

export default async function DocumentUploadPage() {
  const supabase = await createClient();
  
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, last_name_mother')
    .eq('is_active', true)
    .order('first_name');

  return <UploadDocumentClient personnelList={personnel || []} />;
}
