const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const db = require('../database/db');

class BankrollManager {
  constructor() {
    this.loadStrategy();
    this.bankroll = parseFloat(process.env.INITIAL_BANKROLL) || this.config.bankroll.initial;
    this.initialBankroll = this.bankroll;
    this.betsToday = 0;
    this.dailyRisk = 0;
    this.lastBetDate = null;
    this.consecutiveLosses = 0;
  }

  /**
   * Charge la configuration de betting
   */
  loadStrategy() {
    try {
      const configPath = path.join(__dirname, '../../config/betting-strategy.json');
      this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const strategyName = process.env.BETTING_STRATEGY || 'balanced';
      this.strategy = this.config.strategies[strategyName];
      
      if (!this.strategy) {
        throw new Error(`Strategy '${strategyName}' not found`);
      }
      
      logger.info(`💰 Bankroll Manager initialized`, {
        strategy: this.strategy.name,
        initialBankroll: this.bankroll,
        currency: this.config.bankroll.currency
      });
    } catch (error) {
      logger.error('❌ Error loading betting strategy', { error: error.message });
      throw error;
    }
  }

  /**
   * Calcule la mise pour un pari
   */
  calculateBetSize(alertLevel, odds) {
    const levelConfig = this.strategy[`level${alertLevel}`];
    
    // Niveau désactivé
    if (!levelConfig.enabled) {
      return 0;
    }

    // Vérifier les odds min/max
    if (levelConfig.minOdds && odds < levelConfig.minOdds) {
      logger.debug(`⚠️ Odds too low: ${odds} < ${levelConfig.minOdds}`);
      return 0;
    }
    
    if (levelConfig.maxOdds && odds > levelConfig.maxOdds) {
      logger.debug(`⚠️ Odds too high: ${odds} > ${levelConfig.maxOdds}`);
      return 0;
    }

    // Calculer la mise (% de la bankroll)
    let betSize = this.bankroll * (levelConfig.percentBankroll / 100);

    // Appliquer les limites
    betSize = Math.max(betSize, this.config.bankroll.minBet);
    betSize = Math.min(betSize, levelConfig.maxBet || this.config.bankroll.maxBet);
    
    // Arrondir à 2 décimales
    betSize = Math.round(betSize * 100) / 100;

    return betSize;
  }

  /**
   * Simule un pari (appliqué immédiatement, résultat vérifié plus tard)
   */
  simulateBet(alert, adjustedOdds) {
    const betSize = this.calculateBetSize(alert.level, adjustedOdds);
    
    if (betSize === 0) {
      return null;
    }

    // Vérifier si on peut parier
    if (!this.canBet(betSize)) {
      return null;
    }

    // Estimer le profit (simulation probabiliste)
    const winRate = this.config.simulation.winRate[`level${alert.level}`];
    const willWin = Math.random() < winRate;
    const profit = willWin ? (betSize * adjustedOdds) - betSize : -betSize;

    // Mettre à jour la bankroll (simulation)
    this.bankroll += profit;
    this.dailyRisk += betSize;
    this.betsToday++;
    this.lastBetDate = new Date();

    if (willWin) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
    }

    const roi = (profit / betSize) * 100;

    logger.info(`💸 Bet simulated: ${willWin ? '✅ WON' : '❌ LOST'}`, {
      event: alert.event_name,
      outcome: alert.outcome,
      level: alert.level,
      betSize: betSize.toFixed(2),
      odds: adjustedOdds.toFixed(2),
      profit: profit.toFixed(2),
      newBankroll: this.bankroll.toFixed(2),
      roi: roi.toFixed(2) + '%'
    });

    return {
      timestamp: new Date().toISOString(),
      event_name: alert.event_name,
      sport: alert.sport_title,
      bookmaker: alert.bookmaker,
      outcome: alert.outcome,
      original_odds: alert.original_odds,
      adjusted_odds: adjustedOdds,
      alert_level: alert.level,
      variation: alert.variation,
      direction: alert.direction,
      bet_size: betSize,
      result: willWin ? 'won' : 'lost', // Simulation temporaire
      profit: profit,
      bankroll: this.bankroll,
      roi: roi,
      commence_time: alert.commence_time,
      home_team: alert.home_team,
      away_team: alert.away_team
    };
  }

  /**
   * Vérifie si un pari peut être placé
   */
  canBet(betSize) {
    // Vérifier le stop-loss
    if (this.config.rules.stopLoss.enabled) {
      const threshold = this.initialBankroll * this.config.rules.stopLoss.threshold;
      if (this.bankroll <= threshold) {
        logger.warn('🛑 Stop-loss triggered!', {
          currentBankroll: this.bankroll.toFixed(2),
          threshold: threshold.toFixed(2)
        });
        return false;
      }
    }

    // Réinitialiser les compteurs quotidiens
    const today = new Date().toDateString();
    if (this.lastBetDate && this.lastBetDate.toDateString() !== today) {
      this.betsToday = 0;
      this.dailyRisk = 0;
    }

    // Vérifier le nombre de paris quotidiens
    if (this.betsToday >= this.config.rules.maxBetsPerDay) {
      logger.debug('⚠️ Max daily bets reached', {
        betsToday: this.betsToday,
        limit: this.config.rules.maxBetsPerDay
      });
      return false;
    }

    // Vérifier le risque quotidien
    const maxDailyRiskAmount = this.bankroll * this.config.rules.maxDailyRisk;
    if (this.dailyRisk + betSize > maxDailyRiskAmount) {
      logger.debug('⚠️ Max daily risk exceeded', {
        dailyRisk: this.dailyRisk.toFixed(2),
        betSize: betSize.toFixed(2),
        limit: maxDailyRiskAmount.toFixed(2)
      });
      return false;
    }

    // Cooldown après pertes consécutives
    if (this.consecutiveLosses >= this.config.rules.cooldownAfterLoss) {
      logger.debug('⚠️ Cooldown active after consecutive losses', {
        consecutiveLosses: this.consecutiveLosses
      });
      return false;
    }

    // Vérifier la bankroll minimale
    if (this.bankroll < betSize) {
      logger.warn('⚠️ Insufficient bankroll', {
        bankroll: this.bankroll.toFixed(2),
        betSize: betSize.toFixed(2)
      });
      return false;
    }

    return true;
  }

  /**
   * Ajuste les cotes en fonction de la direction de variation
   */
  adjustOdds(originalOdds, direction) {
    const adjustment = this.config.simulation.oddsAdjustment[direction];
    const adjustedOdds = originalOdds * (1 + adjustment);
    return Math.max(1.01, adjustedOdds); // Minimum 1.01
  }

  /**
   * Sauvegarde un pari dans la BDD
   */
  saveBet(bet, fixtureId = null) {
    try {
      const stmt = db.prepare(`
        INSERT INTO bets (
          timestamp, event_name, sport, bookmaker, outcome,
          original_odds, adjusted_odds, alert_level, variation, direction,
          bet_size, result, profit, bankroll, roi,
          commence_time, home_team, away_team, fixture_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        bet.timestamp,
        bet.event_name,
        bet.sport,
        bet.bookmaker,
        bet.outcome,
        bet.original_odds,
        bet.adjusted_odds,
        bet.alert_level,
        bet.variation,
        bet.direction,
        bet.bet_size,
        bet.result,
        bet.profit,
        bet.bankroll,
        bet.roi,
        bet.commence_time,
        bet.home_team,
        bet.away_team,
        fixtureId
      );

      logger.debug('💾 Bet saved to database', { event: bet.event_name });
    } catch (error) {
      logger.error('❌ Error saving bet', { error: error.message });
    }
  }

  /**
   * Récupère les statistiques de betting
   */
  getStats() {
    const profitLoss = this.bankroll - this.initialBankroll;
    const roi = (profitLoss / this.initialBankroll) * 100;

    return {
      initialBankroll: this.initialBankroll,
      currentBankroll: this.bankroll,
      profitLoss: profitLoss,
      roi: roi,
      betsToday: this.betsToday,
      dailyRisk: this.dailyRisk,
      consecutiveLosses: this.consecutiveLosses,
      strategy: this.strategy.name
    };
  }

  /**
   * Réinitialise la bankroll (pour simulation)
   */
  reset() {
    this.bankroll = this.initialBankroll;
    this.betsToday = 0;
    this.dailyRisk = 0;
    this.consecutiveLosses = 0;
    logger.info('🔄 Bankroll manager reset');
  }
}

module.exports = BankrollManager;
