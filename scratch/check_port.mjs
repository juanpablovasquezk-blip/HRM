import net from 'net';

const host = 'hrm-supabase-e8b016-187-127-24-58.traefik.me';
const port = 5432;

const client = new net.Socket();
client.connect(port, host, function() {
    console.log('Connected');
    client.destroy();
});

client.on('error', function(err) {
    console.error('Error:', err.message);
});
