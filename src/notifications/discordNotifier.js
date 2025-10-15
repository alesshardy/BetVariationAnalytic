const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');

class DiscordNotifier {
  constructor() {
    this.webhookUrl = config.notifications.discord.webhookUrl;
  }

  async send(alerts) {
    try {
      const embeds = alerts.map(alert => this.createEmbed(alert));
      
      // Discord limite à 10 embeds par message
      const chunks = [];
      for (let i = 0; i < embeds.length; i += 10) {
        chunks.push(embeds.slice(i, i + 10));
      }
      
      for (const chunk of chunks) {
        await axios.post(this.webhookUrl, {
          username: 'BetVariationAnalytic',
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/3176/3176366.png',
          embeds: chunk
        });
      }
      
      logger.info(`✅ ${alerts.length} message(s) Discord envoyé(s)`);
    } catch (error) {
      logger.error('❌ Erreur lors de l\'envoi Discord:', error.message);
      throw error;
    }
  }

  createEmbed(alert) {
    const color = alert.isIncrease ? 0xff6b6b : 0x51cf66; // Rouge si hausse, vert si baisse
    const emoji = alert.isIncrease ? '📈' : '📉';
    
    return {
      title: `${emoji} Variation détectée: ${alert.eventName}`,
      color: color,
      fields: [
        {
          name: '📅 Date du match',
          value: new Date(alert.commenceTime).toLocaleString('fr-FR'),
          inline: true
        },
        {
          name: '🏢 Bookmaker',
          value: alert.bookmaker,
          inline: true
        },
        {
          name: '🎯 Marché',
          value: alert.marketName,
          inline: false
        },
        {
          name: '📊 Résultat',
          value: alert.outcome,
          inline: true
        },
        {
          name: '💰 Ancienne cote',
          value: `${alert.oldPrice} (${alert.oldProb}%)`,
          inline: true
        },
        {
          name: '💰 Nouvelle cote',
          value: `${alert.newPrice} (${alert.newProb}%)`,
          inline: true
        },
        {
          name: `${emoji} Variation`,
          value: `**${alert.percentChange}%** (${alert.absoluteChange})`,
          inline: false
        }
      ],
      footer: {
        text: `Détecté le ${new Date(alert.timestamp).toLocaleString('fr-FR')}`,
      },
      timestamp: alert.timestamp
    };
  }
}

module.exports = DiscordNotifier;