const SmartMonitor = require('./monitors/smartMonitor');
const logger = require('./utils/logger');
const config = require('./utils/config');

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Démarrage de l'application
async function start() {
  try {
    logger.info('🚀 Démarrage de BetVariationAnalytic...');
    logger.info(`📊 Budget API: ${config.api.monthlyBudget} requêtes/mois`);
    
    // Initialiser le moniteur
    const monitor = new SmartMonitor();
    await monitor.initialize();
    
    // Démarrer le monitoring
    monitor.start();
    
    logger.info('✅ Application démarrée avec succès');
    
    // Gestion de l'arrêt propre
    const shutdown = async () => {
      logger.info('🛑 Arrêt en cours...');
      await monitor.stop();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    logger.error('❌ Erreur fatale au démarrage:', error);
    process.exit(1);
  }
}

// Lancer l'application
start();
