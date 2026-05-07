import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function bulkUpdate() {
  const blueExpressId = '1e805b0f-6d6c-471e-bad9-c48669342735';
  const tomorrow = '2026-05-08';
  
  // Find PM 12 (which user calls AM 12) and AM 11
  const { data: shifts } = await supabase.from('shifts').select('*');
  const pm12 = shifts?.find(s => s.name === 'PM 12');
  const am11 = shifts?.find(s => s.name === 'AM 11' && s.company_id === 'c0cc0000-0000-0000-0000-000000000000');
  
  if (!pm12 || !am11) {
    console.error('Could not find shifts:', { pm12: !!pm12, am11: !!am11 });
    return;
  }

  console.log(`Updating ${pm12.name} (${pm12.id}) to ${am11.name} (${am11.id}) for BlueExpress from ${tomorrow}`);

  // 1. Update Assignments
  const { count: countAsg, error: errAsg } = await supabase
    .from('shift_assignments')
    .update({ shift_id: am11.id })
    .eq('area_id', blueExpressId)
    .eq('shift_id', pm12.id)
    .gte('date', tomorrow);
  
  if (errAsg) console.error('Error updating assignments:', errAsg);
  else console.log(`Updated ${countAsg} assignments`);

  // 2. Update Requirements
  const { count: countReq, error: errReq } = await supabase
    .from('shift_requirements')
    .update({ shift_id: am11.id })
    .eq('area_id', blueExpressId)
    .eq('shift_id', pm12.id)
    .gte('date', tomorrow);

  if (errReq) console.error('Error updating requirements:', errReq);
  else console.log(`Updated ${countReq} requirements`);

  // 3. Update Templates
  const { count: countTmpl, error: errTmpl } = await supabase
    .from('requirement_templates')
    .update({ shift_id: am11.id })
    .eq('area_id', blueExpressId)
    .eq('shift_id', pm12.id);

  if (errTmpl) console.error('Error updating templates:', errTmpl);
  else console.log(`Updated ${countTmpl} templates`);
}

bulkUpdate();
