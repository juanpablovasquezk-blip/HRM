import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/';
  const response = await fetch(url, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  
  const data = await response.json();
  fs.writeFileSync('scratch/openapi.json', JSON.stringify(data, null, 2));
  console.log('Saved OpenAPI spec to scratch/openapi.json');
}
run();
