const cron = require('node-cron');
const db = require('../database/db');
const apiFootball = require('./apiFootballService');
const logger = require('../utils/logger');

class ResultsFetcher {
  constructor() {
    this.checkInterval = process.env.SCORES_CHECK_INTERVAL || 24; // heures
    this.isRunning = false;
  }

  /**
   * Démarre le scheduler de vérification des résultats
   */
  start() {
    if (!process.env.USE_REAL_RESULTS || process.env.USE_REAL_RESULTS !== 'true') {
      logger.info('📊 Real results fetching disabled (USE_REAL_RESULTS=false)');
      return;
    }

    logger.info(`🚀 Starting results fetcher (check every ${this.checkInterval}h)`);

    const checkHour = parseInt(process.env.RESULTS_CHECK_HOUR) || 10;
    
    // Vérifier chaque jour à l'heure configurée
    const cronExpression = `0 ${checkHour} * * *`;
    
    cron.schedule(cronExpression, async () => {
      await this.fetchPendingResults();
    });

    // Première vérification au démarrage (après 2 minutes)
    setTimeout(() => {
      this.fetchPendingResults();
    }, 2 * 60 * 1000);
  }

  /**
   * Récupère les résultats de tous les paris en attente
   */
  async fetchPendingResults() {
    if (this.isRunning) {
      logger.info('⏭️ Results fetch already running, skipping...');
      return;
    }

    this.isRunning = true;
    logger.info('🔍 Fetching pending bet results...');

    try {
      const pendingBets = this.getPendingBets();
      
      if (pendingBets.length === 0) {
        logger.info('✅ No pending bets to check');
        this.isRunning = false;
        return;
      }

      logger.info(`📋 Found ${pendingBets.length} pending bets`);

      let updated = 0;
      let errors = 0;

      for (const bet of pendingBets) {
        try {
          await this.checkBetResult(bet);
          updated++;
          
          // Délai entre les requêtes pour respecter le rate limit
          await this.sleep(1000);
        } catch (error) {
          logger.error(`❌ Error checking bet ${bet.id}`, { error: error.message });
          errors++;
        }
      }

      logger.info('✅ Results fetch completed', {
        total: pendingBets.length,
        updated,
        errors,
        apiUsage: apiFootball.getUsageStats()
      });

      // Afficher les statistiques mises à jour
      this.displayBettingStats();

    } catch (error) {
      logger.error('❌ Error in fetchPendingResults', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Récupère tous les paris en attente de résultat
   */
  getPendingBets() {
    try {
      const stmt = db.prepare(`
        SELECT * FROM bets 
        WHERE result IS NULL 
        AND fixture_id IS NOT NULL
        AND datetime(commence_time) < datetime('now')
        ORDER BY commence_time ASC
      `);
      
      return stmt.all();
    } catch (error) {
      logger.error('❌ Error getting pending bets', { error: error.message });
      return [];
    }
  }

  /**
   * Vérifie le résultat d'un pari spécifique
   */
  async checkBetResult(bet) {
    try {
      logger.info(`🔍 Checking result for: ${bet.event_name}`, {
        betId: bet.id,
        fixtureId: bet.fixture_id,
        outcome: bet.outcome
      });

      // Récupérer le résultat du match
      const result = await apiFootball.getFixtureResult(bet.fixture_id);

      if (!result) {
        logger.warn(`⚠️ No result found for fixture ${bet.fixture_id}`);
        return;
      }

      if (!result.finished) {
        logger.info(`⏳ Match not finished yet: ${bet.event_name}`, {
          status: result.status
        });
        return;
      }

      // Vérifier si le pari est gagnant
      const betResult = apiFootball.checkBetResult(bet, result);

      // Calculer le profit
      let profit = 0;
      if (betResult.won) {
        profit = (bet.bet_size * bet.adjusted_odds) - bet.bet_size;
      } else {
        profit = -bet.bet_size;
      }

      // Calculer la nouvelle bankroll
      const currentBankroll = this.getCurrentBankroll();
      const newBankroll = currentBankroll + profit;

      // Calculer le ROI
      const roi = (profit / bet.bet_size) * 100;

      // Mettre à jour le pari dans la BDD
      const updateStmt = db.prepare(`
        UPDATE bets 
        SET result = ?,
            profit = ?,
            bankroll = ?,
            roi = ?,
            home_score = ?,
            away_score = ?,
            winner = ?,
            result_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateStmt.run(
        betResult.won ? 'won' : 'lost',
        profit,
        newBankroll,
        roi,
        result.homeScore,
        result.awayScore,
        result.winner,
        bet.id
      );

      const emoji = betResult.won ? '✅' : '❌';
      logger.info(`${emoji} Bet result: ${betResult.won ? 'WON' : 'LOST'}`, {
        event: bet.event_name,
        outcome: bet.outcome,
        score: `${result.homeScore}-${result.awayScore}`,
        betSize: bet.bet_size,
        odds: bet.adjusted_odds,
        profit: profit.toFixed(2),
        newBankroll: newBankroll.toFixed(2),
        roi: roi.toFixed(2) + '%'
      });

    } catch (error) {
      logger.error('❌ Error checking bet result', {
        betId: bet.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Récupère la bankroll actuelle (dernier pari)
   */
  getCurrentBankroll() {
    try {
      const stmt = db.prepare(`
        SELECT bankroll FROM bets 
        WHERE result IS NOT NULL
        ORDER BY timestamp DESC 
        LIMIT 1
      `);
      
      const lastBet = stmt.get();
      return lastBet ? lastBet.bankroll : parseFloat(process.env.INITIAL_BANKROLL || 1000);
    } catch (error) {
      logger.error('❌ Error getting current bankroll', { error: error.message });
      return parseFloat(process.env.INITIAL_BANKROLL || 1000);
    }
  }

  /**
   * Affiche les statistiques de betting
   */
  displayBettingStats() {
    try {
      const statsStmt = db.prepare(`
        SELECT 
          COUNT(*) as total_bets,
          SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN result IS NULL THEN 1 ELSE 0 END) as pending,
          SUM(profit) as total_profit,
          AVG(profit) as avg_profit,
          MIN(bankroll) as min_bankroll,
          MAX(bankroll) as max_bankroll
        FROM bets
      `);

      const stats = statsStmt.get();

      if (stats.total_bets === 0) {
        logger.info('📊 No betting stats yet');
        return;
      }

      const winRate = stats.total_bets > 0 
        ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
        : 0;

      const initialBankroll = parseFloat(process.env.INITIAL_BANKROLL || 1000);
      const currentBankroll = this.getCurrentBankroll();
      const totalROI = ((currentBankroll - initialBankroll) / initialBankroll * 100).toFixed(2);

      logger.info('📊 Betting Statistics', {
        totalBets: stats.total_bets,
        wins: stats.wins,
        losses: stats.losses,
        pending: stats.pending,
        winRate: winRate + '%',
        totalProfit: stats.total_profit?.toFixed(2) + '€',
        avgProfit: stats.avg_profit?.toFixed(2) + '€',
        initialBankroll: initialBankroll.toFixed(2) + '€',
        currentBankroll: currentBankroll.toFixed(2) + '€',
        totalROI: totalROI + '%',
        maxDrawdown: ((initialBankroll - stats.min_bankroll) / initialBankroll * 100).toFixed(2) + '%'
      });

    } catch (error) {
      logger.error('❌ Error displaying stats', { error: error.message });
    }
  }

  /**
   * Utilitaire: délai
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Vérification manuelle (pour testing)
   */
  async manualCheck() {
    logger.info('🔧 Manual results check triggered');
    await this.fetchPendingResults();
  }
}

module.exports = new ResultsFetcher();
