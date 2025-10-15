const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('../database/db');
const logger = require('../utils/logger');
const config = require('../utils/config');

const app = express();
const db = new Database();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.initialize().catch(err => {
  logger.error('Failed to initialize database:', err);
  process.exit(1);
});

// API Routes
app.get('/api/alerts/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const alerts = db.getRecentAlerts(limit);
    res.json(alerts);
  } catch (error) {
    logger.error('Error fetching recent alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/alerts/stats', (req, res) => {
  try {
    const stats = db.getAlertStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching alert stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    monitoring: {
      minPercentChange: config.monitoring.minPercentChange,
      minAbsoluteChange: config.monitoring.minAbsoluteChange
    },
    api: {
      monthlyBudget: config.api.monthlyBudget
    }
  });
});

// Start server
const PORT = config.dashboard.port;
app.listen(PORT, () => {
  logger.info(`🌐 Dashboard disponible sur http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
