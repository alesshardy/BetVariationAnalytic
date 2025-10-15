const logger = require('../utils/logger');
const config = require('../utils/config');

class UsageTracker {
  constructor() {
    this.requestsUsed = 0;
    this.requestsRemaining = config.api.monthlyBudget;
    this.totalBudget = config.api.monthlyBudget;
    this.resetDate = null;
    this.lastUpdate = new Date();
  }

  updateFromHeaders(headers) {
    const remaining = headers['x-requests-remaining'];
    const used = headers['x-requests-used'];

    if (remaining) {
      this.requestsRemaining = parseInt(remaining);
      this.requestsUsed = this.totalBudget - this.requestsRemaining;
      this.lastUpdate = new Date();

      if (this.requestsRemaining < 50) {
        logger.warn(`⚠️ ATTENTION: Seulement ${this.requestsRemaining} requêtes restantes ce mois-ci!`);
      } else if (this.requestsRemaining < 100) {
        logger.warn(`⚡ Budget API faible: ${this.requestsRemaining} requêtes restantes`);
      }
    }
  }

  getUsage() {
    return {
      used: this.requestsUsed,
      remaining: this.requestsRemaining,
      total: this.totalBudget,
      percentage: ((this.requestsUsed / this.totalBudget) * 100).toFixed(2),
      lastUpdate: this.lastUpdate
    };
  }

  checkBudget(requestsNeeded = 1) {
    const canProceed = this.requestsRemaining >= requestsNeeded;
    
    if (!canProceed) {
      logger.error(`❌ Budget API insuffisant: ${this.requestsRemaining} restantes, ${requestsNeeded} nécessaires`);
    }
    
    return canProceed;
  }

  getDailyEstimate() {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const averagePerDay = this.requestsUsed / dayOfMonth;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projectedTotal = Math.ceil(averagePerDay * daysInMonth);

    return {
      averagePerDay: averagePerDay.toFixed(2),
      projectedTotal,
      willExceedBudget: projectedTotal > this.totalBudget
    };
  }
}

module.exports = UsageTracker;