const OddsAPI = require('../api/oddsApi');
const DB = require('../database/db');
const NotificationManager = require('../notifications/notificationManager');
const logger = require('../utils/logger');
const config = require('../utils/config');
const fs = require('fs');
const path = require('path');

class SmartMonitor {
  constructor() {
    this.api = new OddsAPI();
    this.db = new DB();
    this.notificationManager = new NotificationManager();
    this.competitions = this.loadCompetitions();
    this.intervals = new Map();
    this.previousOdds = new Map();
    this.isRunning = false;
  }

  loadCompetitions() {
    try {
      const competitionsPath = path.join(__dirname, '../../config/competitions.json');
      const data = fs.readFileSync(competitionsPath, 'utf8');
      const competitions = JSON.parse(data);
      
      logger.info(`📋 ${Object.keys(competitions).length} niveaux de priorité chargés`);
      return competitions;
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des compétitions:', error.message);
      return { high: [], medium: [], low: [] };
    }
  }

  async initialize() {
    try {
      logger.info('🔧 Initialisation du SmartMonitor...');
      await this.db.initialize();
      logger.info('✅ SmartMonitor initialisé');
    } catch (error) {
      logger.error('❌ Erreur lors de l\'initialisation:', error);
      throw error;
    }
  }

  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Le moniteur est déjà en cours d\'exécution');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Démarrage du monitoring intelligent...');

    // Démarrer le monitoring pour chaque niveau de priorité
    this.startMonitoringForPriority('high');
    this.startMonitoringForPriority('medium');
    this.startMonitoringForPriority('low');

    // Afficher le résumé
    this.logMonitoringSummary();
  }

  startMonitoringForPriority(priority) {
    const sports = this.competitions[priority] || [];
    if (sports.length === 0) {
      logger.info(`ℹ️ Aucun sport configuré pour la priorité ${priority}`);
      return;
    }

    const interval = this.getInterval(priority);
    
    if (interval === 0) {
      logger.info(`⏸️ Monitoring désactivé pour la priorité ${priority} (intervalle = 0)`);
      return;
    }

    logger.info(`⏱️ Priorité ${priority}: ${sports.length} sport(s), intervalle ${interval}s`);

    // Première vérification immédiate
    this.checkSportsOdds(sports, priority);

    // Planifier les vérifications suivantes
    const intervalId = setInterval(() => {
      this.checkSportsOdds(sports, priority);
    }, interval * 1000);

    this.intervals.set(priority, intervalId);
  }

  getInterval(priority) {
    const now = new Date();
    const hour = now.getHours();
    const isMatchDay = this.isMatchDay();
    const isNightTime = hour >= 1 && hour < 7;

    let timeCategory;
    if (isNightTime) {
      timeCategory = 'nightTime';
    } else if (isMatchDay) {
      timeCategory = 'matchDay';
    } else {
      timeCategory = 'normalDay';
    }

    return config.monitoring.pollingIntervals[timeCategory][priority] || 300;
  }

  isMatchDay() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    // Samedi (6) et Dimanche (0) sont considérés comme jours de match
    // Mercredi (3) pour la Ligue des Champions
    return [0, 3, 6].includes(dayOfWeek);
  }

  async checkSportsOdds(sports, priority) {
    try {
      // Vérifier le budget avant de faire des requêtes
      if (!this.api.checkBudget(sports.length)) {
        logger.warn('⚠️ Budget API insuffisant, attente...');
        return;
      }

      logger.info(`🔍 Vérification des cotes pour ${sports.length} sport(s) (${priority})...`);

      for (const sport of sports) {
        try {
          await this.checkSportOdds(sport);
          // Petit délai entre chaque sport pour éviter de surcharger l'API
          await this.sleep(1000);
        } catch (error) {
          logger.error(`❌ Erreur lors de la vérification de ${sport}:`, error.message);
        }
      }

      // Afficher les stats d'utilisation de l'API
      const usage = this.api.getUsageStats();
      logger.info(`📊 Utilisation API: ${usage.used}/${usage.total} (${usage.percentage}%)`);

    } catch (error) {
      logger.error('❌ Erreur lors de la vérification des cotes:', error);
    }
  }

  async checkSportOdds(sport) {
    try {
      const currentOdds = await this.api.getOdds(sport);
      
      if (!currentOdds || currentOdds.length === 0) {
        logger.info(`ℹ️ Aucun événement disponible pour ${sport}`);
        return;
      }

      // Sauvegarder les événements dans la base de données
      for (const event of currentOdds) {
        await this.db.saveEvent({
          sport: sport,
          event_id: event.id,
          home_team: event.home_team,
          away_team: event.away_team,
          commence_time: event.commence_time,
          data: JSON.stringify(event)
        });
      }

      // Comparer avec les cotes précédentes
      const previousKey = `${sport}`;
      const previousOdds = this.previousOdds.get(previousKey);

      if (previousOdds) {
        const alerts = this.detectChanges(previousOdds, currentOdds);
        
        if (alerts.length > 0) {
          logger.info(`🚨 ${alerts.length} variation(s) détectée(s) pour ${sport}`);
          
          // Sauvegarder les alertes
          for (const alert of alerts) {
            await this.db.saveAlert(alert);
          }
          
          // Envoyer les notifications
          await this.notificationManager.sendAlerts(alerts);
        }
      }

      // Mettre à jour les cotes précédentes
      this.previousOdds.set(previousKey, currentOdds);

    } catch (error) {
      logger.error(`❌ Erreur lors de la vérification de ${sport}:`, error.message);
      throw error;
    }
  }

  detectChanges(previousOdds, currentOdds) {
    const alerts = [];

    // Créer un map des événements précédents pour un accès rapide
    const previousEventsMap = new Map();
    for (const event of previousOdds) {
      previousEventsMap.set(event.id, event);
    }

    for (const currentEvent of currentOdds) {
      const previousEvent = previousEventsMap.get(currentEvent.id);
      
      if (!previousEvent) {
        continue; // Nouvel événement, pas de comparaison possible
      }

      // Comparer les bookmakers et les cotes
      for (const currentBookmaker of currentEvent.bookmakers || []) {
        const previousBookmaker = (previousEvent.bookmakers || []).find(
          b => b.key === currentBookmaker.key
        );

        if (!previousBookmaker) {
          continue;
        }

        // Comparer les marchés
        for (const currentMarket of currentBookmaker.markets || []) {
          const previousMarket = (previousBookmaker.markets || []).find(
            m => m.key === currentMarket.key
          );

          if (!previousMarket) {
            continue;
          }

          // Comparer les outcomes
          for (const currentOutcome of currentMarket.outcomes || []) {
            const previousOutcome = (previousMarket.outcomes || []).find(
              o => o.name === currentOutcome.name
            );

            if (!previousOutcome) {
              continue;
            }

            const oldPrice = previousOutcome.price;
            const newPrice = currentOutcome.price;

            if (oldPrice === newPrice) {
              continue;
            }

            const absoluteChange = Math.abs(newPrice - oldPrice);
            const percentChange = Math.abs((newPrice - oldPrice) / oldPrice * 100);

            // Vérifier si la variation est significative
            if (percentChange >= config.monitoring.minPercentChange || 
                absoluteChange >= config.monitoring.minAbsoluteChange) {
              
              const isIncrease = newPrice > oldPrice;
              const oldProb = (1 / oldPrice * 100).toFixed(2);
              const newProb = (1 / newPrice * 100).toFixed(2);

              alerts.push({
                timestamp: new Date().toISOString(),
                sport: currentEvent.sport_key,
                eventId: currentEvent.id,
                eventName: `${currentEvent.home_team} vs ${currentEvent.away_team}`,
                commenceTime: currentEvent.commence_time,
                bookmaker: currentBookmaker.title,
                bookmakerKey: currentBookmaker.key,
                market: currentMarket.key,
                marketName: this.getMarketName(currentMarket.key),
                outcome: currentOutcome.name,
                oldPrice: oldPrice,
                newPrice: newPrice,
                absoluteChange: absoluteChange.toFixed(2),
                percentChange: percentChange.toFixed(2),
                direction: isIncrease ? '📈' : '📉',
                oldProb: oldProb,
                newProb: newProb,
                isIncrease: isIncrease ? 1 : 0
              });
            }
          }
        }
      }
    }

    return alerts;
  }

  getMarketName(marketKey) {
    const marketNames = {
      'h2h': 'Match Winner',
      'spreads': 'Point Spread',
      'totals': 'Over/Under'
    };
    return marketNames[marketKey] || marketKey;
  }

  logMonitoringSummary() {
    const totalSports = Object.values(this.competitions).flat().length;
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`📊 Résumé du Monitoring`);
    logger.info(`   • Total sports: ${totalSports}`);
    logger.info(`   • High priority: ${this.competitions.high.length}`);
    logger.info(`   • Medium priority: ${this.competitions.medium.length}`);
    logger.info(`   • Low priority: ${this.competitions.low.length}`);
    logger.info(`   • Variation min: ${config.monitoring.minPercentChange}%`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn('⚠️ Le moniteur n\'est pas en cours d\'exécution');
      return;
    }

    logger.info('🛑 Arrêt du monitoring...');
    this.isRunning = false;

    // Arrêter tous les intervalles
    for (const [priority, intervalId] of this.intervals) {
      clearInterval(intervalId);
      logger.info(`✅ Intervalle ${priority} arrêté`);
    }

    this.intervals.clear();
    logger.info('✅ Monitoring arrêté');
  }
}

module.exports = SmartMonitor;
