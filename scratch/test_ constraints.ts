import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { parseISO } from 'date-fns';
import { validateAllConstraints } from '../src/lib/scheduler/constraints';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: assignments } = await supabase.from('shift_assignments').select('*, shift:shifts(duration_hours, start_time, end_time, name)').gte('date', '2026-04-20').lte('date', '2026-05-05');
  const { data: personnel } = await supabase.from('personnel').select('*').in('first_name', ['MARCO ANTONIO', 'ALVARO FELIPE', 'DEIMAR', 'ALEX ROLAND']);
  
  const formattedAssignments = assignments?.map(a => ({
     personnel_id: a.personnel_id,
     date: a.date,
     duration_hours: a.shift?.duration_hours || 8,
     shift_start: a.shift?.start_time,
     shift_end: a.shift?.end_time,
     shift_name: a.shift?.name
  })) || [];

  const pObj = personnel![0]; // just grab first to mock
  
  const slotDate = '2026-05-03';
  const slot: any = {
     date: slotDate,
     shift_id: 'dummy',
     area_id: 'dummy',
     position_id: 'dummy',
     shift_start: '04:00:00',
     shift_end: '13:00:00',
     shift_duration_hours: 8,
     required_count: 1, filled_count: 0,
     position_name: 'OPERADOR AEROPUERTO',
     area_name: 'AEROPUERTO',
     shift_name: 'AM 04'
  };

  for (const p of personnel!) {
    const pAvail: any = {
      personnel_id: p.id,
      birth_date: p.birth_date,
      first_name: p.first_name,
      main_position: p.main_position,
      main_position_name: 'OPERADOR AEROPUERTO',
      secondary_positions: p.secondary_positions || [],
      prefers_night: false, avoids_night: false,
      fixed_shift_id: null, rotation_pattern: p.rotation_pattern || '5X2',
      has_special_contract: false,
      weekly_hours: 0, days_off_count: 0, last_shift_end: null,
      assigned_dates: new Set(formattedAssignments.filter(a => a.personnel_id === p.id).map(a => a.date)),
      leave_dates: new Set(),
      is_turn_b: false,
    };
    
    const violations = validateAllConstraints(pAvail, slot, formattedAssignments.filter(a => a.personnel_id === p.id));
    console.log(`\nEval for ${p.first_name} on Sunday AM 04`);
    if (violations.length === 0) {
      console.log('NO VIOLATIONS! Could take the shift.');
    } else {
      violations.forEach((v: any) => console.log(` - [${v.severity}] ${v.type}: ${v.message}`));
    }
  }
}

main().catch(console.error);
