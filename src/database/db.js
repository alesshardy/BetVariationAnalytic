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
      const dbDir = path.dirname(config.database.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(config.database.path);
      this.db.pragma('journal_mode = WAL');

      this.createTables();
      this.migrateSchema();
      this.createIndexes(); // Créer les index après la migration
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

    // Table des alertes avec les nouvelles colonnes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_level INTEGER NOT NULL DEFAULT 1,
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
        is_odds_inversion INTEGER DEFAULT 0,
        previous_favorite TEXT,
        new_favorite TEXT,
        alert_meaning TEXT,
        odds_category TEXT,
        variation_direction TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des paris (betting simulation)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_name TEXT NOT NULL,
        sport TEXT NOT NULL,
        bookmaker TEXT NOT NULL,
        outcome TEXT NOT NULL,
        original_odds REAL NOT NULL,
        adjusted_odds REAL NOT NULL,
        alert_level INTEGER NOT NULL,
        variation REAL NOT NULL,
        direction TEXT NOT NULL,
        bet_size REAL NOT NULL,
        result TEXT,
        profit REAL,
        bankroll REAL NOT NULL,
        roi REAL,
        commence_time TEXT NOT NULL,
        home_team TEXT,
        away_team TEXT,
        fixture_id INTEGER,
        home_score INTEGER,
        away_score INTEGER,
        winner TEXT,
        result_updated_at DATETIME,
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
  }

  createIndexes() {
    // Index pour améliorer les performances
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_sport ON events(sport);
      CREATE INDEX IF NOT EXISTS idx_events_commence_time ON events(commence_time);
      CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_alerts_sport ON alerts(sport);
      CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(alert_level);
      CREATE INDEX IF NOT EXISTS idx_alerts_inversion ON alerts(is_odds_inversion);
      CREATE INDEX IF NOT EXISTS idx_bets_result ON bets(result);
      CREATE INDEX IF NOT EXISTS idx_bets_fixture_id ON bets(fixture_id);
      CREATE INDEX IF NOT EXISTS idx_bets_commence_time ON bets(commence_time);
    `);
  }

   migrateSchema() {
    try {
      // Vérifier si les colonnes existent
      const tableInfo = this.db.prepare("PRAGMA table_info(alerts)").all();
      const columns = tableInfo.map(col => col.name);

      // Ajouter les colonnes manquantes (SANS NOT NULL pour éviter les erreurs)
      const columnsToAdd = [
        { name: 'alert_level', type: 'INTEGER DEFAULT 1' },
        { name: 'is_odds_inversion', type: 'INTEGER DEFAULT 0' },
        { name: 'previous_favorite', type: 'TEXT' },
        { name: 'new_favorite', type: 'TEXT' },
        { name: 'alert_meaning', type: 'TEXT' },
        { name: 'odds_category', type: 'TEXT' },
        { name: 'variation_direction', type: 'TEXT' }
      ];

      for (const col of columnsToAdd) {
        if (!columns.includes(col.name)) {
          this.db.exec(`ALTER TABLE alerts ADD COLUMN ${col.name} ${col.type}`);
          logger.info(`✅ Colonne ${col.name} ajoutée à la table alerts`);
        }
      }

      logger.info('✅ Migration du schéma terminée');
    } catch (error) {
      logger.error('❌ Erreur lors de la migration du schéma:', error);
    }
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
          alert_level, timestamp, sport, event_id, event_name, commence_time,
          bookmaker, bookmaker_key, market, market_name, outcome,
          old_price, new_price, absolute_change, percent_change,
          direction, old_prob, new_prob, is_increase, is_odds_inversion,
          previous_favorite, new_favorite, alert_meaning, odds_category, variation_direction
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        alert.alertLevel || 1,
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
        alert.isIncrease ? 1 : 0,
        alert.isOddsInversion ? 1 : 0,
        alert.previousFavorite || null,
        alert.newFavorite || null,
        alert.meaning || null,
        alert.category || null,
        alert.variationDirection || null,
        alert.isMajorInversion ? 1 : 0,
        alert.inversionSeverity || null
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

  getAlertsByLevel(level, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      WHERE alert_level = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(level, limit);
  }

  getAlertsByDate(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
    `);
    return stmt.all(startDate, endDate);
  }

  getOddsInversions(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      WHERE is_odds_inversion = 1
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  getAlertStats() {
    const totalAlerts = this.db.prepare('SELECT COUNT(*) as count FROM alerts').get();
    
    const alertsByLevel = this.db.prepare(`
      SELECT alert_level, COUNT(*) as count
      FROM alerts
      GROUP BY alert_level
      ORDER BY alert_level
    `).all();
    
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

    const oddsInversions = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM alerts
      WHERE is_odds_inversion = 1
    `).get();

    const recentAlerts = this.db.prepare(`
      SELECT * FROM alerts
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    return {
      total: totalAlerts.count,
      byLevel: alertsByLevel,
      bySport: alertsBySport,
      byBookmaker: alertsByBookmaker,
      oddsInversions: oddsInversions.count,
      recent: recentAlerts
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