const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://alphahourtestimonylibrary.org',
    'https://www.alphahourtestimonylibrary.org',
    'https://ah-testimony-library-g4nq4gleq-ababiohnana17-6948s-projects.vercel.app',
    /https:\/\/.*\.vercel\.app$/,
    /https:\/\/.*\.railway\.app$/
  ],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check - must be first to respond even if routes fail
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Testimony App Backend is running',
    version: '1.1.0',
    features: [
      'Firebase Authentication Support',
      'Cloud Sync API Ready',
      'Episode Filtering Enhanced',
      'Professional UI Updates'
    ],
    lastUpdated: '2025-10-06',
    timestamp: new Date().toISOString()
  });
});

// Import API routes with error handling
let categoriesRoutes, clipsRoutes, adminRoutes, adminClipsRoutes, processVideoRoutes, testimoniesRoutes, userRoutes, searchRoutes;

try {
  categoriesRoutes = require('./routes/categories');
  clipsRoutes = require('./routes/clips');
  adminRoutes = require('./routes/admin');
  adminClipsRoutes = require('./routes/admin-clips');
  processVideoRoutes = require('./routes/process-video');
  testimoniesRoutes = require('./routes/testimonies');
  userRoutes = require('./routes/user');
  searchRoutes = require('./routes/search');
} catch (error) {
  console.error('Error loading routes:', error);
  // Routes will be undefined, handled below
}

// Mount API routes - only if they loaded successfully
if (categoriesRoutes) app.use('/api/categories', categoriesRoutes);
if (clipsRoutes) app.use('/api/clips', clipsRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);
if (adminClipsRoutes) app.use('/api/admin/clips', adminClipsRoutes);
if (processVideoRoutes) app.use('/api/process-video', processVideoRoutes);
if (testimoniesRoutes) app.use('/api/testimonies', testimoniesRoutes);
if (userRoutes) app.use('/api/user', userRoutes);
if (searchRoutes) app.use('/api/search', searchRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server with error handling
try {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ Server started successfully at ${new Date().toISOString()}`);
  });

  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
      process.exit(1);
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

module.exports = app;