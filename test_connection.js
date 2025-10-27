const { MongoClient } = require('mongodb');

async function testConnection() {
    const uri = 'mongodb://127.0.0.1:27017/ticket_system';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ SUCCESS: Connected to MongoDB!');
        
        const adminDb = client.db('admin');
        const result = await adminDb.command({ ismaster: 1 });
        console.log('✅ MongoDB is running:', result);
        
    } catch (error) {
        console.log('❌ FAILED to connect to MongoDB:', error.message);
    } finally {
        await client.close();
    }
}

testConnection();