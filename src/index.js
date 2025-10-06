const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ah-testimony-library-g4nq4gleq-ababiohnana17-6948s-projects.vercel.app',
    /https:\/\/.*\.vercel\.app$/,
    /https:\/\/.*\.railway\.app$/
  ],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
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

// Import API routes
const categoriesRoutes = require('./routes/categories');
const clipsRoutes = require('./routes/clips');
const adminRoutes = require('./routes/admin');
const processVideoRoutes = require('./routes/process-video');
const testimoniesRoutes = require('./routes/testimonies');
const userRoutes = require('./routes/user');
const searchRoutes = require('./routes/search');

// Mount API routes
app.use('/api/categories', categoriesRoutes);
app.use('/api/clips', clipsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/process-video', processVideoRoutes);
app.use('/api/testimonies', testimoniesRoutes);
app.use('/api/user', userRoutes);
app.use('/api/search', searchRoutes);

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

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;