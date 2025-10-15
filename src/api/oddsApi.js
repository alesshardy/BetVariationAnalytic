const axios = require('axios');
const config = require('../utils/config');
const logger = require('../utils/logger');
const UsageTracker = require('./usageTracker');

class OddsAPI {
  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.apiKey = config.api.key;
    this.usageTracker = new UsageTracker();
  }

  async getSports() {
    try {
      const response = await axios.get(`${this.baseUrl}/sports`, {
        params: { apiKey: this.apiKey }
      });
      
      this.usageTracker.updateFromHeaders(response.headers);
      logger.info(`✅ ${response.data.length} sports disponibles`);
      
      return response.data;
    } catch (error) {
      logger.error('❌ Erreur getSports:', error.message);
      throw error;
    }
  }

  async getOdds(sport, options = {}) {
    try {
      const params = {
        apiKey: this.apiKey,
        regions: options.regions || 'eu',
        markets: options.markets || 'h2h,spreads,totals',
        oddsFormat: options.oddsFormat || 'decimal',
        dateFormat: 'iso'
      };

      const response = await axios.get(`${this.baseUrl}/sports/${sport}/odds`, {
        params,
        timeout: 30000
      });

      this.usageTracker.updateFromHeaders(response.headers);
      
      const usage = this.usageTracker.getUsage();
      logger.info(`📊 ${sport}: ${response.data.length} événements | Budget: ${usage.used}/${usage.total}`);

      return response.data;
    } catch (error) {
      logger.error(`❌ Erreur getOdds pour ${sport}:`, error.message);
      throw error;
    }
  }

  async getCompetitionOdds(competition, options = {}) {
    try {
      const params = {
        apiKey: this.apiKey,
        regions: options.regions || 'eu',
        markets: options.markets || 'h2h,spreads,totals',
        oddsFormat: options.oddsFormat || 'decimal',
        dateFormat: 'iso'
      };

      const response = await axios.get(`${this.baseUrl}/odds/competitions/${competition}`, {
        params,
        timeout: 30000
      });

      this.usageTracker.updateFromHeaders(response.headers);
      
      return response.data;
    } catch (error) {
      logger.error(`❌ Erreur getCompetitionOdds pour ${competition}:`, error.message);
      throw error;
    }
  }

  getUsageStats() {
    return this.usageTracker.getUsage();
  }

  checkBudget(requestsNeeded = 1) {
    return this.usageTracker.checkBudget(requestsNeeded);
  }
}

module.exports = OddsAPI;