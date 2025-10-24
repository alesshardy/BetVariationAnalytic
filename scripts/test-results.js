#!/usr/bin/env node

/**
 * Script pour tester manuellement la récupération des résultats
 */

require('dotenv').config();
const resultsFetcher = require('../src/services/resultsFetcher');
const apiFootball = require('../src/services/apiFootballService');
const logger = require('../src/utils/logger');

async function testResultsFetcher() {
  console.log('🔍 Testing Results Fetcher...\n');

  // Vérifier la clé API
  if (!process.env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY === 'your_api_football_key_here') {
    console.log('❌ API_FOOTBALL_KEY not configured in .env');
    console.log('📖 See docs/API_FOOTBALL_SETUP.md for instructions');
    process.exit(1);
  }

  if (!process.env.USE_REAL_RESULTS || process.env.USE_REAL_RESULTS !== 'true') {
    console.log('⚠️  USE_REAL_RESULTS is not enabled in .env');
    console.log('   Set USE_REAL_RESULTS=true to enable real results fetching\n');
  }

  console.log('📊 Current API Usage:');
  const stats = apiFootball.getUsageStats();
  console.log(`   • Requests today: ${stats.requestsToday}/${stats.dailyLimit}`);
  console.log(`   • Remaining: ${stats.remaining}`);
  console.log(`   • Used: ${stats.percentUsed}%\n`);

  console.log('🔍 Fetching pending bet results...\n');

  try {
    await resultsFetcher.manualCheck();
    
    console.log('\n✅ Test completed!\n');
    
    const finalStats = apiFootball.getUsageStats();
    console.log('📊 Final API Usage:');
    console.log(`   • Requests today: ${finalStats.requestsToday}/${finalStats.dailyLimit}`);
    console.log(`   • Remaining: ${finalStats.remaining}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testResultsFetcher();
