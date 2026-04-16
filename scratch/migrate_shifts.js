
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://hrm-supabase-e8b016-187-127-24-58.traefik.me';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzYxMjE0MDMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.jqUPui-C58gACQVYTrZSr_30Rt2_7X79TJXfh_BJJT0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const CONSOLIDATION = [
  {
    targetId: 'aa0d2ab8-ef6c-46a0-b9fb-e91393a507ed', // Bodegas 04
    newName: 'AM 04',
    sourceIds: [
      '8f90c0a1-7b8e-4ce3-9fc9-f24070d2d20a', // Aeropuerto 04
      '04cb7697-8ca6-41ef-a9c4-b1503dcb2976'  // Blue 04
    ]
  },
  {
    targetId: 'ef6b7b41-1725-4bb7-ba77-6d9fb58ea034', // Base 08
    newName: 'AM 08',
    sourceIds: [
      '0e4c246d-9246-4411-9592-a294b71ea311'  // Blue 08
    ]
  }
];

async function migrate() {
  for (const group of CONSOLIDATION) {
    console.log(`Working on group: ${group.newName}...`);

    for (const sourceId of group.sourceIds) {
      console.log(`  Migrating source ${sourceId} into ${group.targetId}...`);

      // 1. SHIFT ASSIGNMENTS
      const { data: assignments, error: assError } = await supabase
        .from('shift_assignments')
        .select('*')
        .eq('shift_id', sourceId);

      if (assError) throw assError;

      for (const ass of assignments) {
        // Check if person already has target shift on that day
        const { data: existing } = await supabase
          .from('shift_assignments')
          .select('id')
          .match({ personnel_id: ass.personnel_id, date: ass.date, shift_id: group.targetId })
          .maybeSingle();

        if (existing) {
          console.log(`    Duplicate assignment for person ${ass.personnel_id} on ${ass.date}. Deleting redundant source assignment.`);
          await supabase.from('shift_assignments').delete().eq('id', ass.id);
        } else {
          await supabase.from('shift_assignments').update({ shift_id: group.targetId }).eq('id', ass.id);
        }
      }

      // 2. SHIFT REQUIREMENTS
      const { data: requirements, error: reqError } = await supabase
        .from('shift_requirements')
        .select('*')
        .eq('shift_id', sourceId);

      if (reqError) throw reqError;

      for (const req of requirements) {
        // Check if requirement exists for target
        const { data: existingReq } = await supabase
          .from('shift_requirements')
          .select('*')
          .match({ date: req.date, area_id: req.area_id, position_id: req.position_id, shift_id: group.targetId })
          .maybeSingle();

        if (existingReq) {
          console.log(`    Merging requirements for ${req.date}. Summing ${req.required_count} to ${existingReq.required_count}`);
          await supabase.from('shift_requirements')
            .update({ required_count: existingReq.required_count + req.required_count })
            .eq('id', existingReq.id);
          await supabase.from('shift_requirements').delete().eq('id', req.id);
        } else {
          await supabase.from('shift_requirements').update({ shift_id: group.targetId }).eq('id', req.id);
        }
      }

      // 3. DELETE SOURCE SHIFT
      console.log(`    Deleting source shift ${sourceId}...`);
      await supabase.from('shifts').delete().eq('id', sourceId);
    }

    // 4. RENAME TARGET SHIFT
    console.log(`  Renaming target shift ${group.targetId} to ${group.newName}...`);
    await supabase.from('shifts').update({ name: group.newName }).eq('id', group.targetId);
  }

  console.log('Migration completed successfully!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
