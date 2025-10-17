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
    this.alertLevels = this.loadAlertLevels();
    this.sports = this.loadSports();
    this.intervals = new Map();
    this.previousOdds = new Map();
    this.isRunning = false;
    
    // Pour la stratégie pré-match
    this.upcomingMatches = new Map(); // eventId -> matchInfo avec openingOdds
    this.activeMonitors = new Map(); // eventId -> monitorInfo
    this.periodicScanInterval = null;
  }

  loadAlertLevels() {
    try {
      const alertLevelsPath = path.join(__dirname, '../../config/alert-levels.json');
      const data = fs.readFileSync(alertLevelsPath, 'utf8');
      const levels = JSON.parse(data);
      
      logger.info(`🎯 Configuration des niveaux d'alerte chargée`);
      return levels;
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des niveaux d\'alerte:', error.message);
      return null;
    }
  }

  loadSports() {
    try {
      const sportsPath = path.join(__dirname, '../../config/sports.json');
      const data = fs.readFileSync(sportsPath, 'utf8');
      const sports = JSON.parse(data);
      
      // Extraire les ligues activées
      const activeLeagues = [];
      for (const [sportType, sportConfig] of Object.entries(sports)) {
        if (sportConfig.enabled && sportConfig.leagues) {
          activeLeagues.push(...sportConfig.leagues);
        }
      }
      
      logger.info(`⚽ ${activeLeagues.length} ligues activées pour le monitoring`);
      return activeLeagues;
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des sports:', error.message);
      return [];
    }
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
    const strategy = config.monitoring.strategy || 'continuous';
    
    logger.info(`🚀 Démarrage du monitoring en mode: ${strategy.toUpperCase()}`);

    if (strategy === 'pre-match') {
      this.startPreMatchStrategy();
    } else {
      this.startContinuousStrategy();
    }

    // Afficher le résumé
    this.logMonitoringSummary();
  }

  startContinuousStrategy() {
    logger.info('🔄 Mode continu: Monitoring avec intervalles classiques');
    
    // Démarrer le monitoring pour chaque niveau de priorité
    this.startMonitoringForPriority('high');
    this.startMonitoringForPriority('medium');
    this.startMonitoringForPriority('low');
  }

  startPreMatchStrategy() {
    logger.info('⏰ Mode pré-match: Scan périodique tous les 3 jours + monitoring intensif 15min avant match');
    
    // Lancer le premier scan immédiatement
    this.performPeriodicScan();
    
    // Planifier les scans périodiques
    if (config.monitoring.periodicScan.enabled) {
      this.schedulePeriodicScans();
    }
  }

  schedulePeriodicScans() {
    const intervalDays = config.monitoring.periodicScan.intervalDays || 3;
    const scanHour = config.monitoring.periodicScan.hour || 8;
    
    // Calculer le prochain scan
    const now = new Date();
    const nextScan = new Date();
    nextScan.setHours(scanHour, 0, 0, 0);
    
    // Si l'heure est déjà passée aujourd'hui, ajouter les jours
    if (nextScan <= now) {
      nextScan.setDate(nextScan.getDate() + intervalDays);
    }
    
    const msUntilNextScan = nextScan.getTime() - now.getTime();
    const hoursUntil = Math.round(msUntilNextScan / 1000 / 60 / 60);
    
    logger.info(`📅 Prochain scan périodique: ${nextScan.toLocaleString('fr-FR')} (dans ${hoursUntil}h)`);
    logger.info(`🔄 Fréquence des scans: tous les ${intervalDays} jours`);
    
    setTimeout(() => {
      this.performPeriodicScan();
      
      // Répéter tous les X jours
      this.periodicScanInterval = setInterval(() => {
        this.performPeriodicScan();
      }, intervalDays * 24 * 60 * 60 * 1000);
      
    }, msUntilNextScan);
  }

  async performPeriodicScan() {
    try {
      logger.info('🔍 ═══════════════════════════════════════════════════════');
      logger.info('🔍 SCAN PÉRIODIQUE: Découverte et tracking des matchs');
      logger.info('🔍 ═══════════════════════════════════════════════════════');
      
      if (this.sports.length === 0) {
        logger.warn('⚠️ Aucune ligue configurée pour le scan');
        return;
      }

      if (!this.api.checkBudget(this.sports.length)) {
        logger.warn('⚠️ Budget API insuffisant pour le scan périodique');
        return;
      }

      const now = new Date();
      const futureWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 jours

      let totalMatches = 0;
      let newMatches = 0;
      let updatedMatches = 0;

      for (const league of this.sports) {
        try {
          logger.info(`📡 Scan de ${league}...`);
          const events = await this.api.getOdds(league);
          
          if (!events || events.length === 0) {
            logger.info(`   ℹ️ Aucun match à venir`);
            continue;
          }

          totalMatches += events.length;

          for (const event of events) {
            const commenceTime = new Date(event.commence_time);
            
            // Ne garder que les matchs dans les 7 prochains jours
            if (commenceTime <= futureWindow && commenceTime > now) {
              
              // Vérifier si on a déjà ce match
              const existingMatch = this.upcomingMatches.get(event.id);
              
              if (!existingMatch) {
                // Nouveau match découvert - SAUVEGARDER LES COTES D'OUVERTURE
                const matchInfo = {
                  eventId: event.id,
                  sport: league,
                  homeTeam: event.home_team,
                  awayTeam: event.away_team,
                  commenceTime: event.commence_time,
                  commenceDate: commenceTime,
                  discovered: now.toISOString(),
                  openingOdds: JSON.parse(JSON.stringify(event.bookmakers)), // Clone profond
                  lastScan: now.toISOString()
                };

                this.upcomingMatches.set(event.id, matchInfo);
                newMatches++;
                
                // Planifier le monitoring pré-match
                this.schedulePreMatchMonitoring(matchInfo);
                
                logger.info(`   ✨ Nouveau: ${event.home_team} vs ${event.away_team} (${commenceTime.toLocaleDateString('fr-FR')})`);
              } else {
                // Match déjà connu, comparer les cotes avec l'ouverture
                if (config.monitoring.periodicScan.compareWithOpeningOdds) {
                  const alerts = this.compareWithOpeningOdds(existingMatch, event);
                  
                  if (alerts.length > 0) {
                    logger.info(`   📊 ${alerts.length} variation(s) depuis ouverture: ${event.home_team} vs ${event.away_team}`);
                    
                    for (const alert of alerts) {
                      await this.db.saveAlert(alert);
                    }
                    
                    await this.notificationManager.sendAlerts(alerts);
                    updatedMatches++;
                  }
                }
                
                // Mettre à jour les données
                existingMatch.lastScan = now.toISOString();
              }

              // Sauvegarder l'événement
              await this.db.saveEvent({
                sport: league,
                event_id: event.id,
                home_team: event.home_team,
                away_team: event.away_team,
                commence_time: event.commence_time,
                data: JSON.stringify(event)
              });
            }
          }

          await this.sleep(1000);

        } catch (error) {
          logger.error(`❌ Erreur lors du scan de ${league}:`, error.message);
        }
      }

      logger.info('🔍 ═══════════════════════════════════════════════════════');
      logger.info(`📊 Résultat du scan périodique:`);
      logger.info(`   • Total matchs trouvés: ${totalMatches}`);
      logger.info(`   • Nouveaux matchs: ${newMatches}`);
      logger.info(`   • Matchs avec variations: ${updatedMatches}`);
      logger.info(`   • Matchs trackés: ${this.upcomingMatches.size}`);
      
      const usage = this.api.getUsageStats();
      logger.info(`   • Budget API: ${usage.used}/${usage.total} (${usage.percentage}%)`);
      
      const nextScanDays = config.monitoring.periodicScan.intervalDays || 3;
      const nextScan = new Date(now.getTime() + nextScanDays * 24 * 60 * 60 * 1000);
      logger.info(`   • Prochain scan: ${nextScan.toLocaleString('fr-FR')}`);
      logger.info('🔍 ═══════════════════════════════════════════════════════');

    } catch (error) {
      logger.error('❌ Erreur lors du scan périodique:', error);
    }
  }

  compareWithOpeningOdds(matchInfo, currentEvent) {
    const alerts = [];
    
    if (!matchInfo.openingOdds || !currentEvent.bookmakers) {
      return alerts;
    }

    // Pour chaque bookmaker actuel
    for (const currentBookmaker of currentEvent.bookmakers) {
      const openingBookmaker = matchInfo.openingOdds.find(b => b.key === currentBookmaker.key);
      
      if (!openingBookmaker) continue;

      // Pour chaque marché
      for (const currentMarket of currentBookmaker.markets || []) {
        const openingMarket = (openingBookmaker.markets || []).find(m => m.key === currentMarket.key);
        
        if (!openingMarket) continue;

        // Pour chaque outcome
        for (const currentOutcome of currentMarket.outcomes || []) {
          const openingOutcome = (openingMarket.outcomes || []).find(o => o.name === currentOutcome.name);
          
          if (!openingOutcome) continue;

          const oldPrice = openingOutcome.price;
          const newPrice = currentOutcome.price;

          if (oldPrice === newPrice) continue;

          const absoluteChange = Math.abs(newPrice - oldPrice);
          const percentChange = Math.abs((newPrice - oldPrice) / oldPrice * 100);

          // Vérifier si la variation est significative
          if (percentChange >= config.monitoring.minPercentChange || 
              absoluteChange >= config.monitoring.minAbsoluteChange) {
            
            const isIncrease = newPrice > oldPrice;
            const oldProb = (1 / oldPrice * 100).toFixed(2);
            const newProb = (1 / newPrice * 100).toFixed(2);
            
            const oddsCategory = this.getOddsCategory(oldPrice);
            const variationDirection = isIncrease ? 'increase' : 'decrease';
            const alertLevel = this.determineAlertLevel(oldPrice, newPrice, percentChange, absoluteChange);
            const alertMeaning = this.getAlertMeaning(alertLevel, variationDirection);

            // Calculer le nombre de jours depuis l'ouverture
            const daysSinceOpening = Math.floor((new Date() - new Date(matchInfo.discovered)) / (1000 * 60 * 60 * 24));

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
              isIncrease: isIncrease ? 1 : 0,
              alertLevel: alertLevel,
              category: oddsCategory,
              variationDirection: variationDirection,
              meaning: `${alertMeaning} (depuis ouverture il y a ${daysSinceOpening}j)`,
              isOddsInversion: 0,
              previousFavorite: null,
              newFavorite: null
            });
          }
        }
      }
    }

    return alerts;
  }

  schedulePreMatchMonitoring(matchInfo) {
    const { eventId, commenceDate, homeTeam, awayTeam } = matchInfo;
    const now = new Date();
    const preMatchWindow = config.monitoring.preMatch.windowMinutes || 15;
    const monitoringStartTime = new Date(commenceDate.getTime() - preMatchWindow * 60 * 1000);

    // Si le match commence dans moins de 15 minutes, démarrer maintenant
    if (monitoringStartTime <= now) {
      logger.info(`⚡ Match imminent: ${homeTeam} vs ${awayTeam} - Démarrage immédiat`);
      this.startPreMatchMonitoring(matchInfo);
      return;
    }

    const msUntilStart = monitoringStartTime.getTime() - now.getTime();
    const minutesUntil = Math.round(msUntilStart / 1000 / 60);

    logger.info(`⏰ Planifié: ${homeTeam} vs ${awayTeam}`);
    logger.info(`   📅 Début match: ${commenceDate.toLocaleString('fr-FR')}`);
    logger.info(`   🚨 Monitoring à: ${monitoringStartTime.toLocaleString('fr-FR')} (dans ${minutesUntil} min)`);

    const timeoutId = setTimeout(() => {
      this.startPreMatchMonitoring(matchInfo);
    }, msUntilStart);

    this.activeMonitors.set(eventId, {
      ...matchInfo,
      timeoutId,
      status: 'scheduled'
    });
  }

  async startPreMatchMonitoring(matchInfo) {
    const { eventId, sport, homeTeam, awayTeam, commenceDate } = matchInfo;
    
    logger.info('🔥 ═══════════════════════════════════════════════════════');
    logger.info(`🔥 MONITORING PRÉ-MATCH ACTIVÉ`);
    logger.info(`🔥 ${homeTeam} vs ${awayTeam}`);
    logger.info(`🔥 Début: ${commenceDate.toLocaleString('fr-FR')}`);
    logger.info('🔥 ═══════════════════════════════════════════════════════');

    const maxChecks = config.monitoring.preMatch.maxChecks || 5;
    const intervalSeconds = config.monitoring.preMatch.intervalSeconds || 180; // 3 minutes
    let checkCount = 0;

    // Première vérification immédiate
    await this.checkMatchOdds(sport, eventId);
    checkCount++;

    // Planifier les vérifications suivantes
    const intervalId = setInterval(async () => {
      checkCount++;
      
      if (checkCount > maxChecks) {
        clearInterval(intervalId);
        logger.info(`✅ Monitoring terminé pour ${homeTeam} vs ${awayTeam} (${checkCount - 1} checks effectués)`);
        this.activeMonitors.delete(eventId);
        this.upcomingMatches.delete(eventId);
        return;
      }

      logger.info(`🔍 Check ${checkCount}/${maxChecks}: ${homeTeam} vs ${awayTeam}`);
      await this.checkMatchOdds(sport, eventId);

    }, intervalSeconds * 1000);

    // Mettre à jour le monitor actif
    this.activeMonitors.set(eventId, {
      ...matchInfo,
      intervalId,
      status: 'monitoring',
      startedAt: new Date().toISOString(),
      checksPerformed: checkCount
    });
  }

  async checkMatchOdds(sport, eventId) {
    try {
      const currentOdds = await this.api.getOdds(sport);
      
      if (!currentOdds || currentOdds.length === 0) {
        return;
      }

      // Trouver l'événement spécifique
      const event = currentOdds.find(e => e.id === eventId);
      if (!event) {
        logger.warn(`⚠️ Événement ${eventId} non trouvé dans les résultats API`);
        return;
      }

      // Comparer avec les cotes précédentes
      const previousKey = `${sport}_${eventId}`;
      const previousEvent = this.previousOdds.get(previousKey);

      if (previousEvent) {
        const alerts = this.detectChanges([previousEvent], [event]);
        
        if (alerts.length > 0) {
          logger.info(`🚨 ${alerts.length} variation(s) détectée(s)`);
          
          for (const alert of alerts) {
            await this.db.saveAlert(alert);
          }
          
          await this.notificationManager.sendAlerts(alerts);
        }
      }

      this.previousOdds.set(previousKey, event);

    } catch (error) {
      logger.error(`❌ Erreur lors de la vérification du match:`, error.message);
    }
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

              // Déterminer la catégorie de cote et le niveau d'alerte
              const oddsCategory = this.getOddsCategory(oldPrice);
              const variationDirection = isIncrease ? 'increase' : 'decrease';
              const alertLevel = this.determineAlertLevel(oldPrice, newPrice, percentChange, absoluteChange);
              const alertMeaning = this.getAlertMeaning(alertLevel, variationDirection);

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
                isIncrease: isIncrease ? 1 : 0,
                alertLevel: alertLevel,
                category: oddsCategory,
                variationDirection: variationDirection,
                meaning: alertMeaning,
                isOddsInversion: 0,
                previousFavorite: null,
                newFavorite: null
              });
            }
          }
        }
      }
    }

    // Détecter les inversions de cotes
    const inversions = this.detectOddsInversions(previousOdds, currentOdds);
    alerts.push(...inversions);

    return alerts;
  }

  getOddsCategory(price) {
    if (price < 2.0) return 'favorites';
    if (price <= 4.0) return 'medium';
    return 'outsiders';
  }

  determineAlertLevel(oldPrice, newPrice, percentChange, absoluteChange) {
    if (!this.alertLevels) return 1;

    const category = this.getOddsCategory(oldPrice);
    const isIncrease = newPrice > oldPrice;
    const direction = isIncrease ? 'increase' : 'decrease';

    // Vérifier niveau 3 (plus strict)
    const level3Threshold = this.alertLevels.level3.thresholds[direction][category];
    if (percentChange >= level3Threshold.percent && absoluteChange >= level3Threshold.absolute) {
      return 3;
    }

    // Vérifier niveau 2
    const level2Threshold = this.alertLevels.level2.thresholds[direction][category];
    if (percentChange >= level2Threshold.percent && absoluteChange >= level2Threshold.absolute) {
      return 2;
    }

    // Sinon niveau 1
    return 1;
  }

  getAlertMeaning(level, direction) {
    if (!this.alertLevels) return '';
    
    const levelConfig = this.alertLevels[`level${level}`];
    if (!levelConfig || !levelConfig.meaning) return '';

    return levelConfig.meaning[direction] || '';
  }

  detectOddsInversions(previousOdds, currentOdds) {
    const inversions = [];

    const previousEventsMap = new Map();
    for (const event of previousOdds) {
      previousEventsMap.set(event.id, event);
    }

    for (const currentEvent of currentOdds) {
      const previousEvent = previousEventsMap.get(currentEvent.id);
      
      if (!previousEvent) continue;

      for (const currentBookmaker of currentEvent.bookmakers || []) {
        const previousBookmaker = (previousEvent.bookmakers || []).find(
          b => b.key === currentBookmaker.key
        );

        if (!previousBookmaker) continue;

        for (const currentMarket of currentBookmaker.markets || []) {
          const previousMarket = (previousBookmaker.markets || []).find(
            m => m.key === currentMarket.key
          );

          if (!previousMarket) continue;

          // Pour détecter une inversion, on a besoin d'au moins 2 outcomes
          if (currentMarket.outcomes.length < 2 || previousMarket.outcomes.length < 2) continue;

          // Trouver le favori précédent (cote la plus basse)
          const previousFavorite = previousMarket.outcomes.reduce((min, outcome) => 
            outcome.price < min.price ? outcome : min
          );

          // Trouver le favori actuel
          const currentFavorite = currentMarket.outcomes.reduce((min, outcome) => 
            outcome.price < min.price ? outcome : min
          );

          // Vérifier si le favori a changé
          if (previousFavorite.name !== currentFavorite.name) {
            // Trouver la cote actuelle de l'ancien favori
            const oldFavoriteCurrentOdds = currentMarket.outcomes.find(
              o => o.name === previousFavorite.name
            );

            if (!oldFavoriteCurrentOdds) continue;

            const oddsDifference = Math.abs(oldFavoriteCurrentOdds.price - currentFavorite.price);
            
            // Vérifier si on doit reporter cette inversion
            const minDiff = this.alertLevels?.level3?.thresholds?.oddsInversion?.minOddsDifference || 0.30;
            const majorThreshold = this.alertLevels?.level3?.thresholds?.oddsInversion?.majorThreshold || 0.50;
            
            if (oddsDifference >= minDiff) {
              const isMajorInversion = oddsDifference >= majorThreshold;
              
              // Déterminer le message
              let meaning = '🔄 Inversion de favori détectée';
              if (this.alertLevels?.level3?.meaning) {
                if (isMajorInversion && this.alertLevels.level3.meaning.major) {
                  meaning = this.alertLevels.level3.meaning.major;
                } else if (!isMajorInversion && this.alertLevels.level3.meaning.minor) {
                  meaning = this.alertLevels.level3.meaning.minor;
                }
              }

              inversions.push({
                timestamp: new Date().toISOString(),
                sport: currentEvent.sport_key,
                eventId: currentEvent.id,
                eventName: `${currentEvent.home_team} vs ${currentEvent.away_team}`,
                commenceTime: currentEvent.commence_time,
                bookmaker: currentBookmaker.title,
                bookmakerKey: currentBookmaker.key,
                market: currentMarket.key,
                marketName: this.getMarketName(currentMarket.key),
                outcome: currentFavorite.name,
                oldPrice: previousFavorite.price,
                newPrice: currentFavorite.price,
                absoluteChange: oddsDifference.toFixed(2),
                percentChange: ((oddsDifference / previousFavorite.price) * 100).toFixed(2),
                direction: '🔄',
                oldProb: (1 / previousFavorite.price * 100).toFixed(2),
                newProb: (1 / currentFavorite.price * 100).toFixed(2),
                isIncrease: 0,
                alertLevel: 3,
                category: 'inversion',
                variationDirection: 'inversion',
                meaning: meaning,
                isOddsInversion: 1,
                previousFavorite: previousFavorite.name,
                newFavorite: currentFavorite.name
              });

              logger.warn(`🔥 ${isMajorInversion ? 'INVERSION MAJEURE' : 'Inversion'} détectée: ${currentEvent.home_team} vs ${currentEvent.away_team} - ${previousFavorite.name} (${previousFavorite.price}) → ${currentFavorite.name} (${currentFavorite.price}) [Δ${oddsDifference.toFixed(2)}]`);
            }
          }
        }
      }
    }

    return inversions;
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
    const strategy = config.monitoring.strategy || 'continuous';
    
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`📊 Résumé du Monitoring`);
    logger.info(`   • Stratégie: ${strategy.toUpperCase()}`);
    
    if (strategy === 'pre-match') {
      logger.info(`   • Ligues surveillées: ${this.sports.length}`);
      logger.info(`   • Fenêtre pré-match: ${config.monitoring.preMatch.windowMinutes} minutes`);
      logger.info(`   • Intervalle checks: ${config.monitoring.preMatch.intervalSeconds}s`);
      logger.info(`   • Checks par match: ${config.monitoring.preMatch.maxChecks}`);
      
      if (config.monitoring.periodicScan.enabled) {
        logger.info(`   • Scan périodique: tous les ${config.monitoring.periodicScan.intervalDays} jours à ${config.monitoring.periodicScan.hour}h00`);
        logger.info(`   • Comparaison: ${config.monitoring.periodicScan.compareWithOpeningOdds ? 'avec cotes d\'ouverture' : 'désactivée'}`);
      }
      
      // Estimation mensuelle avec scan périodique
      const scansPerMonth = Math.floor(30 / (config.monitoring.periodicScan.intervalDays || 3));
      const matchesPerWeek = 30; // Estimation
      const matchesPerMonth = matchesPerWeek * 4;
      const checksPerMatch = config.monitoring.preMatch.maxChecks;
      const scanRequests = scansPerMonth * this.sports.length;
      const monitorRequests = matchesPerMonth * checksPerMatch;
      const totalRequests = scanRequests + monitorRequests;
      
      logger.info(`   • Estimation: ~${scansPerMonth} scans + ${matchesPerMonth} matchs/mois`);
      logger.info(`   • Budget estimé: ~${totalRequests} requêtes/mois (scans: ${scanRequests}, monitoring: ${monitorRequests})`);
    } else {
      const totalSports = Object.values(this.competitions).flat().length;
      logger.info(`   • Total sports: ${totalSports}`);
      logger.info(`   • High priority: ${this.competitions.high.length}`);
      logger.info(`   • Medium priority: ${this.competitions.medium.length}`);
      logger.info(`   • Low priority: ${this.competitions.low.length}`);
    }
    
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

    // Arrêter le scan périodique
    if (this.periodicScanInterval) {
      clearInterval(this.periodicScanInterval);
      logger.info('✅ Scan périodique arrêté');
    }

    // Arrêter tous les monitors actifs
    for (const [eventId, monitorInfo] of this.activeMonitors) {
      if (monitorInfo.timeoutId) {
        clearTimeout(monitorInfo.timeoutId);
      }
      if (monitorInfo.intervalId) {
        clearInterval(monitorInfo.intervalId);
      }
      logger.info(`✅ Monitor arrêté: ${monitorInfo.homeTeam} vs ${monitorInfo.awayTeam}`);
    }

    this.activeMonitors.clear();

    // Arrêter tous les intervalles (mode continu)
    for (const [priority, intervalId] of this.intervals) {
      clearInterval(intervalId);
      logger.info(`✅ Intervalle ${priority} arrêté`);
    }

    this.intervals.clear();
    logger.info('✅ Monitoring arrêté');
  }
}

module.exports = SmartMonitor;
