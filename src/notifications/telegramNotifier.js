const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const config = require('../utils/config');

class TelegramNotifier {
  constructor() {
    this.bot = new TelegramBot(config.notifications.telegram.botToken, { polling: false });
    this.chatId = config.notifications.telegram.chatId;
  }

  async send(alerts) {
    try {
      for (const alert of alerts) {
        const message = this.formatMessage(alert);
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      }
      
      logger.info(`✅ ${alerts.length} message(s) Telegram envoyé(s)`);
    } catch (error) {
      logger.error('❌ Erreur lors de l\'envoi Telegram:', error.message);
      throw error;
    }
  }

  formatMessage(alert) {
    const emoji = alert.isIncrease ? '📈' : '📉';
    const changeEmoji = Math.abs(parseFloat(alert.percentChange)) > 10 ? '🔥' : '⚠️';
    
    return `
${changeEmoji} *VARIATION DE COTE DÉTECTÉE*

${emoji} *${alert.percentChange}%* de variation

⚽ *Match:* ${alert.eventName}
📅 *Date:* ${new Date(alert.commenceTime).toLocaleString('fr-FR')}

🏢 *Bookmaker:* ${alert.bookmaker}
🎯 *Marché:* ${alert.marketName}
📊 *Résultat:* ${alert.outcome}

💰 *Ancienne cote:* ${alert.oldPrice} (${alert.oldProb}%)
💰 *Nouvelle cote:* ${alert.newPrice} (${alert.newProb}%)
📉 *Changement:* ${alert.absoluteChange}

⏱️ _${new Date(alert.timestamp).toLocaleString('fr-FR')}_
    `.trim();
  }
}

module.exports = TelegramNotifier;