const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Set Python executable to virtual environment
if (!process.env.PYTHON_EXECUTABLE) {
  // __dirname is smartmandi_backend, need to go to SmartMandis (parent of parent)
  const pythonPath = path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe');
  process.env.PYTHON_EXECUTABLE = pythonPath;
  console.log('Using Python executable:', pythonPath);
}

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartmandi';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ MongoDB connected successfully');
    console.log(`Connected to: ${mongoUri}`);
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

connectDB();

// Routes
app.use('/api/demand', require('./routes/demandRoutes'));
app.use('/api/pricing', require('./routes/pricingRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/products', require('./routes/productRoutes'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Mandi Backend API',
    version: '1.0.0',
    endpoints: {
      demand_forecasting: '/api/demand',
      dynamic_pricing: '/api/pricing',
      dashboard: '/api/dashboard',
      products: '/api/products',
      health: '/health'
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
