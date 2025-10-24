const SmartMonitor = require('./monitors/smartMonitor');
const resultsFetcher = require('./services/resultsFetcher');
const logger = require('./utils/logger');
const config = require('./utils/config');

// Démarrer le monitoring
const monitor = new SmartMonitor();

async function startDashboard() {
    if (!config.dashboard?.enabled) return;

    const express = require('express');
    const path = require('path');
    const app = express();

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'dashboard/public')));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'dashboard/public/index.html'));
    });

    // API endpoint pour les statistiques d'alertes
    app.get('/api/alerts/stats', async (req, res) => {
        try {
            if (!monitor.db) {
                return res.status(503).json({ error: 'Base de données non initialisée' });
            }
            
            const stats = monitor.db.getAlertStats();
            
            // Formater les stats pour le dashboard
            const formattedStats = {
                total: stats.total,
                byLevel: {
                    level1: stats.byLevel.find(l => l.alert_level === 1)?.count || 0,
                    level2: stats.byLevel.find(l => l.alert_level === 2)?.count || 0,
                    level3: stats.byLevel.find(l => l.alert_level === 3)?.count || 0
                },
                bySport: stats.bySport,
                byBookmaker: stats.byBookmaker,
                inversions: stats.oddsInversions,
                byDirection: {
                    increase: stats.byLevel.reduce((sum, l) => sum + (l.is_increase === 1 ? l.count : 0), 0),
                    decrease: stats.byLevel.reduce((sum, l) => sum + (l.is_increase === 0 ? l.count : 0), 0)
                }
            };
            
            res.json(formattedStats);
        } catch (error) {
            logger.error('Erreur API /api/alerts/stats:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API endpoint pour les alertes récentes
    app.get('/api/alerts/recent', async (req, res) => {
        try {
            if (!monitor.db) {
                return res.status(503).json({ error: 'Base de données non initialisée' });
            }

            const limit = parseInt(req.query.limit) || 50;
            const alerts = await monitor.db.getRecentAlerts(limit);
            res.json(alerts);
        } catch (error) {
            logger.error('Erreur API /api/alerts/recent:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // API endpoint pour la configuration
    app.get('/api/config', async (req, res) => {
        try {
            res.json({
                monitoring: {
                    minPercentChange: config.monitoring?.minPercentChange || 5,
                    minAbsoluteChange: config.monitoring?.minAbsoluteChange || 0.10
                },
                api: {
                    monthlyBudget: config.api?.monthlyBudget || 500
                }
            });
        } catch (error) {
            logger.error('Erreur API /api/config:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // API endpoint pour l'utilisation de l'API
    app.get('/api/usage', async (req, res) => {
        try {
            if (!monitor.oddsApi) {
                return res.status(503).json({ error: 'API non initialisée' });
            }
            const usage = monitor.oddsApi.getUsageStats();
            res.json(usage);
        } catch (error) {
            logger.error('Erreur API /api/usage:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // API endpoint pour les alertes par niveau
    app.get('/api/alerts/level/:level', async (req, res) => {
        try {
            const level = parseInt(req.params.level);
            if (![1, 2, 3].includes(level)) {
                return res.status(400).json({ error: 'Niveau invalide. Utilisez 1, 2 ou 3.' });
            }
            const limit = parseInt(req.query.limit) || 50;
            const alerts = monitor.db.getAlertsByLevel(level, limit);
            res.json({ level, count: alerts.length, alerts });
        } catch (error) {
            logger.error(`Erreur API /api/alerts/level/${req.params.level}:`, error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // API endpoint pour les inversions de cotes
    app.get('/api/alerts/inversions', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const inversions = monitor.db.getOddsInversions(limit);
            res.json({ count: inversions.length, inversions });
        } catch (error) {
            logger.error('Erreur API /api/alerts/inversions:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // API endpoint pour les paris (betting simulation)
    app.get('/api/bets', async (req, res) => {
        try {
            if (!monitor.db) {
                return res.status(503).json({ error: 'Base de données non initialisée' });
            }

            // Récupérer tous les paris
            const bets = monitor.db.db.prepare(`
                SELECT * FROM bets
                ORDER BY timestamp DESC
                LIMIT 200
            `).all();

            // Calculer les statistiques
            const stats = monitor.db.db.prepare(`
                SELECT 
                    COUNT(*) as totalBets,
                    SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wins,
                    SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as losses,
                    SUM(CASE WHEN result IS NULL THEN 1 ELSE 0 END) as pending,
                    SUM(profit) as totalProfit,
                    AVG(profit) as avgProfit
                FROM bets
                WHERE result IS NOT NULL
            `).get();

            const initialBankroll = parseFloat(process.env.INITIAL_BANKROLL) || 1000;
            const currentBankroll = initialBankroll + (stats.totalProfit || 0);
            const roi = stats.totalBets > 0 ? ((stats.totalProfit || 0) / initialBankroll * 100) : 0;
            const winRate = (stats.wins + stats.losses) > 0 
                ? (stats.wins / (stats.wins + stats.losses) * 100)
                : 0;

            res.json({
                bets: bets,
                stats: {
                    totalBets: stats.totalBets || 0,
                    wins: stats.wins || 0,
                    losses: stats.losses || 0,
                    pending: stats.pending || 0,
                    winRate: winRate,
                    totalProfit: stats.totalProfit || 0,
                    avgProfit: stats.avgProfit || 0,
                    initialBankroll: initialBankroll,
                    currentBankroll: currentBankroll,
                    roi: roi
                }
            });
        } catch (error) {
            logger.error('Erreur API /api/bets:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    const PORT = config.dashboard?.port || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`🌐 Dashboard accessible sur http://0.0.0.0:${PORT}`);
    });
}

async function main() {
    try {
        logger.info('🚀 Démarrage de BetVariationAnalytic...');
        logger.info(`📊 Budget API: ${config.api.monthlyBudget} requêtes/mois`);
        
        const notificationCount = [
            config.notifications?.email?.enabled,
            config.notifications?.telegram?.enabled,
            config.notifications?.discord?.enabled
        ].filter(Boolean).length;
        logger.info(`📢 ${notificationCount} canal(aux) de notification activé(s)`);

        await monitor.initialize();
        await startDashboard();
        await monitor.start();
        
        // Démarrer le fetcher de résultats si activé
        if (process.env.USE_REAL_RESULTS === 'true') {
            resultsFetcher.start();
            logger.info('✅ Results fetcher started');
        }
        
        logger.info('✅ Application démarrée avec succès');
    } catch (error) {
        logger.error('❌ Erreur fatale:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', async () => {
    logger.info('📴 Arrêt demandé...');
    await monitor.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('📴 Interruption détectée...');
    await monitor.stop();
    process.exit(0);
});

main();