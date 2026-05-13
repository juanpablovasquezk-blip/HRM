async function testUrl() {
  const instanceId = 'instance162661'; // From DB
  const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
  
  console.log(`Testing ${url}...`);
  try {
    const res = await fetch(url, { method: 'POST' }); 
    console.log(`POST Status: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error('Error:', err);
  }

  // Test without 'instance' prefix
  const url2 = `https://api.ultramsg.com/162661/messages/chat`;
  console.log(`Testing ${url2}...`);
  try {
    const res = await fetch(url2, { method: 'POST' });
    console.log(`POST (no prefix) Status: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error('Error:', err);
  }
}

testUrl();
