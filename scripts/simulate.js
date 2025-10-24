#!/usr/bin/env node

/**
 * Script pour tester la simulation de betting sur les alertes existantes
 */

require('dotenv').config();
const BankrollManager = require('../src/betting/bankrollManager');
const DB = require('../src/database/db');
const logger = require('../src/utils/logger');

async function runSimulation() {
  console.log('🎲 Starting betting simulation...\n');

  const db = new DB();
  await db.initialize();

  const bankroll = new BankrollManager();

  // Récupérer les alertes historiques
  const alerts = db.getRecentAlerts(100);

  if (alerts.length === 0) {
    console.log('❌ No alerts found in database');
    process.exit(0);
  }

  console.log(`📊 Found ${alerts.length} alerts to simulate\n`);
  console.log(`💰 Starting bankroll: ${bankroll.bankroll.toFixed(2)}€`);
  console.log(`📈 Strategy: ${bankroll.strategy.name}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let betsPlaced = 0;
  let totalProfit = 0;

  for (const alert of alerts) {
    // Ajuster les cotes
    const direction = alert.is_increase ? 'increase' : 'decrease';
    const adjustedOdds = bankroll.adjustOdds(alert.new_price, direction);

    // Simuler le pari
    const bet = bankroll.simulateBet({
      level: alert.alert_level,
      event_name: alert.event_name,
      sport_title: alert.sport,
      bookmaker: alert.bookmaker,
      outcome: alert.outcome,
      original_odds: alert.new_price,
      variation: parseFloat(alert.percent_change),
      direction: direction,
      commence_time: alert.commence_time,
      home_team: alert.event_name.split(' vs ')[0],
      away_team: alert.event_name.split(' vs ')[1]
    }, adjustedOdds);

    if (bet) {
      betsPlaced++;
      totalProfit += bet.profit;

      // Sauvegarder dans la BDD
      bankroll.saveBet(bet);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SIMULATION RESULTS\n');

  const stats = bankroll.getStats();

  console.log(`💰 Initial Bankroll: ${stats.initialBankroll.toFixed(2)}€`);
  console.log(`💵 Final Bankroll: ${stats.currentBankroll.toFixed(2)}€`);
  console.log(`📈 Total Profit/Loss: ${stats.profitLoss > 0 ? '+' : ''}${stats.profitLoss.toFixed(2)}€`);
  console.log(`📊 ROI: ${stats.roi > 0 ? '+' : ''}${stats.roi.toFixed(2)}%`);
  console.log(`🎯 Bets Placed: ${betsPlaced}/${alerts.length}`);

  // Statistiques détaillées depuis la BDD
  const detailedStats = db.db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'lost' THEN 1 ELSE 0 END) as losses,
      AVG(profit) as avg_profit,
      MAX(profit) as max_win,
      MIN(profit) as max_loss
    FROM bets
  `).get();

  const winRate = detailedStats.total > 0 
    ? ((detailedStats.wins / detailedStats.total) * 100).toFixed(2)
    : 0;

  console.log(`\n🎯 Win Rate: ${winRate}% (${detailedStats.wins}W / ${detailedStats.losses}L)`);
  console.log(`💸 Average Profit: ${detailedStats.avg_profit?.toFixed(2) || 0}€`);
  console.log(`🏆 Best Win: +${detailedStats.max_win?.toFixed(2) || 0}€`);
  console.log(`📉 Worst Loss: ${detailedStats.max_loss?.toFixed(2) || 0}€`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Statistiques par niveau d'alerte
  const levelStats = db.db.prepare(`
    SELECT 
      alert_level,
      COUNT(*) as total,
      SUM(CASE WHEN result = 'won' THEN 1 ELSE 0 END) as wins,
      SUM(profit) as total_profit,
      AVG(roi) as avg_roi
    FROM bets
    GROUP BY alert_level
    ORDER BY alert_level
  `).all();

  console.log('📊 Statistics by Alert Level:\n');
  for (const level of levelStats) {
    const wr = level.total > 0 ? ((level.wins / level.total) * 100).toFixed(1) : 0;
    console.log(`   Level ${level.alert_level}: ${level.total} bets | ${wr}% WR | ${level.total_profit > 0 ? '+' : ''}${level.total_profit.toFixed(2)}€ | ROI: ${level.avg_roi?.toFixed(2) || 0}%`);
  }

  console.log('\n✅ Simulation completed!\n');
}

runSimulation().catch(error => {
  console.error('❌ Error running simulation:', error);
  process.exit(1);
});
