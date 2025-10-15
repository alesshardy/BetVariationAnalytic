const EmailNotifier = require('./emailNotifier');
const TelegramNotifier = require('./telegramNotifier');
const DiscordNotifier = require('./discordNotifier');
const logger = require('../utils/logger');
const config = require('../utils/config');

class NotificationManager {
  constructor() {
    this.notifiers = [];
    
    // Initialiser les notifiers activés
    if (config.notifications.email.enabled) {
      this.notifiers.push(new EmailNotifier());
    }
    
    if (config.notifications.telegram.enabled) {
      this.notifiers.push(new TelegramNotifier());
    }
    
    if (config.notifications.discord.enabled) {
      this.notifiers.push(new DiscordNotifier());
    }
    
    logger.info(`📢 ${this.notifiers.length} canal(aux) de notification activé(s)`);
  }

  async sendAlerts(alerts) {
    if (this.notifiers.length === 0) {
      logger.info('ℹ️ Aucun canal de notification configuré');
      return;
    }

    for (const notifier of this.notifiers) {
      try {
        await notifier.send(alerts);
      } catch (error) {
        logger.error(`❌ Erreur lors de l'envoi via ${notifier.constructor.name}:`, error.message);
      }
    }
  }

  formatAlert(alert) {
    return `
🚨 VARIATION DE COTE DÉTECTÉE

📅 Match: ${alert.eventName}
⏰ Date: ${new Date(alert.commenceTime).toLocaleString('fr-FR')}
🏢 Bookmaker: ${alert.bookmaker}
🎯 Marché: ${alert.marketName}
📊 Résultat: ${alert.outcome}

${alert.direction} Variation:
  • Ancienne cote: ${alert.oldPrice} (${alert.oldProb}%)
  • Nouvelle cote: ${alert.newPrice} (${alert.newProb}%)
  • Changement: ${alert.percentChange}% (${alert.absoluteChange})

⏱️ ${new Date(alert.timestamp).toLocaleString('fr-FR')}
    `.trim();
  }
}

module.exports = NotificationManager;