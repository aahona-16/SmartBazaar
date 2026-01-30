const mongoose = require('mongoose');
require('dotenv').config();

/**
 * MongoDB Connection Configuration
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartmandi';
    
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('\n✓ MongoDB connected successfully');
    console.log(`✓ Connected to: ${mongoUri}`);
    console.log(`✓ Database: ${conn.connection.name}\n`);
    
    return conn;
  } catch (error) {
    console.error('\n✗ MongoDB connection failed:', error.message);
    console.error('✗ Make sure MongoDB is running on your system.\n');
    process.exit(1);
  }
};

/**
 * Disconnect from MongoDB
 */
const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected successfully');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error.message);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};
