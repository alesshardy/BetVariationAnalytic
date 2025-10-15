require('dotenv').config();

const config = {
  api: {
    key: process.env.ODDS_API_KEY,
    baseUrl: process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4',
    monthlyBudget: parseInt(process.env.API_MONTHLY_BUDGET) || 500
  },
  
  monitoring: {
    minPercentChange: parseFloat(process.env.MIN_PERCENT_CHANGE) || 5,
    minAbsoluteChange: parseFloat(process.env.MIN_ABSOLUTE_CHANGE) || 0.10,
    pollingIntervals: {
      matchDay: {
        high: parseInt(process.env.POLLING_INTERVAL_MATCH_DAY) || 60,
        medium: 120,
        low: 240
      },
      normalDay: {
        high: parseInt(process.env.POLLING_INTERVAL_NORMAL_DAY) || 120,
        medium: 240,
        low: 480
      },
      nightTime: {
        high: 360,
        medium: 720,
        low: 0
      }
    }
  },
  
  notifications: {
    email: {
      enabled: process.env.EMAIL_ENABLED === 'true',
      service: process.env.EMAIL_SERVICE || 'gmail',
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD,
      to: process.env.EMAIL_TO
    },
    telegram: {
      enabled: process.env.TELEGRAM_ENABLED === 'true',
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    },
    discord: {
      enabled: process.env.DISCORD_ENABLED === 'true',
      webhookUrl: process.env.DISCORD_WEBHOOK_URL
    }
  },
  
  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT) || 3000,
    enabled: process.env.DASHBOARD_ENABLED !== 'false'
  },
  
  database: {
    path: process.env.DATABASE_PATH || './data/odds.db'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  }
};

// Validation de la configuration
if (!config.api.key) {
  throw new Error('ODDS_API_KEY est requis dans le fichier .env');
}

module.exports = config;
