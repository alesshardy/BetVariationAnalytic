const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../utils/config');

class DB {
  constructor() {
    this.db = null;
  }

  async initialize() {
    try {
      // Créer le dossier data s'il n'existe pas
      const dbDir = path.dirname(config.database.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(config.database.path);
      this.db.pragma('journal_mode = WAL');

      this.createTables();
      logger.info('✅ Base de données SQLite initialisée');
    } catch (error) {
      logger.error('❌ Erreur lors de l\'initialisation de la base de données:', error);
      throw error;
    }
  }

  createTables() {
    // Table des événements
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport TEXT NOT NULL,
        event_id TEXT NOT NULL,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        commence_time TEXT NOT NULL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sport, event_id)
      )
    `);

    // Table des alertes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        sport TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        commence_time TEXT NOT NULL,
        bookmaker TEXT NOT NULL,
        bookmaker_key TEXT NOT NULL,
        market TEXT NOT NULL,
        market_name TEXT NOT NULL,
        outcome TEXT NOT NULL,
        old_price REAL NOT NULL,
        new_price REAL NOT NULL,
        absolute_change REAL NOT NULL,
        percent_change REAL NOT NULL,
        direction TEXT NOT NULL,
        old_prob REAL NOT NULL,
        new_prob REAL NOT NULL,
        is_increase INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table de tracking d'utilisation API
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requests_used INTEGER NOT NULL,
        requests_remaining INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Index pour améliorer les performances
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_sport ON events(sport);
      CREATE INDEX IF NOT EXISTS idx_events_commence_time ON events(commence_time);
      CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_alerts_sport ON alerts(sport);
    `);
  }

  async saveEvent(event) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO events (sport, event_id, home_team, away_team, commence_time, data)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        event.sport,
        event.event_id,
        event.home_team,
        event.away_team,
        event.commence_time,
        event.data
      );
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde de l\'événement:', error);
    }
  }

  async saveAlert(alert) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO alerts (
          timestamp, sport, event_id, event_name, commence_time,
          bookmaker, bookmaker_key, market, market_name, outcome,
          old_price, new_price, absolute_change, percent_change,
          direction, old_prob, new_prob, is_increase
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        alert.timestamp,
        alert.sport,
        alert.eventId,
        alert.eventName,
        alert.commenceTime,
        alert.bookmaker,
        alert.bookmakerKey,
        alert.market,
        alert.marketName,
        alert.outcome,
        alert.oldPrice,
        alert.newPrice,
        parseFloat(alert.absoluteChange),
        parseFloat(alert.percentChange),
        alert.direction,
        parseFloat(alert.oldProb),
        parseFloat(alert.newProb),
        alert.isIncrease ? 1 : 0
      );
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde de l\'alerte:', error);
    }
  }

  getRecentAlerts(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getAlertsByDate(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
    `);
    return stmt.all(startDate, endDate);
  }

  getAlertStats() {
    const totalAlerts = this.db.prepare('SELECT COUNT(*) as count FROM alerts').get();
    const alertsBySport = this.db.prepare(`
      SELECT sport, COUNT(*) as count
      FROM alerts
      GROUP BY sport
      ORDER BY count DESC
    `).all();
    
    const alertsByBookmaker = this.db.prepare(`
      SELECT bookmaker, COUNT(*) as count
      FROM alerts
      GROUP BY bookmaker
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return {
      total: totalAlerts.count,
      bySport: alertsBySport,
      byBookmaker: alertsByBookmaker
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      logger.info('🔒 Base de données fermée');
    }
  }
}

module.exports = DB;