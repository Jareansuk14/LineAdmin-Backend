require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/database');
const seedDefaultAdmin = require('./utils/seedAdmin');
const { checkAllUsersLockStatus } = require('./services/lockCheckService');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const teamRoutes = require('./routes/teams');
const statsRoutes = require('./routes/stats');
const heartbeatRoutes = require('./routes/heartbeat');
const statusRoutes = require('./routes/status');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.CLIENT_URL
  ].filter(Boolean),
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'LineAdmin Backend API is running',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/heartbeat', heartbeatRoutes);
app.use('/api/status', statusRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Seed default admin user
    await seedDefaultAdmin();
    
    // Start scheduled lock check task (every 1 minute)
    cron.schedule('* * * * *', async () => {
      await checkAllUsersLockStatus();
    });
    
    // Run initial lock check after 5 seconds
    setTimeout(async () => {
      console.log('[Lock Check] Running initial lock status check...');
      await checkAllUsersLockStatus();
    }, 5000);
    
    // Start listening
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('[Lock Check] Scheduled task started: Checking lock status every 1 minute');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
