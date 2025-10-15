const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../utils/config');

class EmailNotifier {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: config.notifications.email.service,
      auth: {
        user: config.notifications.email.user,
        pass: config.notifications.email.password
      }
    });
  }

  async send(alerts) {
    try {
      const subject = `🚨 ${alerts.length} variation(s) de cotes détectée(s)`;
      const html = this.formatHTML(alerts);

      await this.transporter.sendMail({
        from: config.notifications.email.user,
        to: config.notifications.email.to,
        subject: subject,
        html: html
      });

      logger.info(`✅ Email envoyé avec ${alerts.length} alerte(s)`);
    } catch (error) {
      logger.error('❌ Erreur lors de l\'envoi d\'email:', error.message);
      throw error;
    }
  }

  formatHTML(alerts) {
    let html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
            .container { background-color: white; border-radius: 8px; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { background-color: #ff6b6b; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .alert { border-left: 4px solid #ff6b6b; padding: 15px; margin: 15px 0; background-color: #fff5f5; }
            .alert-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
            .detail { margin: 5px 0; }
            .price-change { font-size: 16px; color: #333; background-color: #ffe5e5; padding: 10px; border-radius: 5px; margin: 10px 0; }
            .increase { color: #c92a2a; }
            .decrease { color: #2b8a3e; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>🚨 Alertes de variations de cotes</h2>
              <p>Détection automatique par BetVariationAnalytic</p>
            </div>
    `;

    alerts.forEach((alert, index) => {
      const changeClass = alert.isIncrease ? 'increase' : 'decrease';
      html += `
        <div class="alert">
          <div class="alert-title">${index + 1}. ${alert.eventName}</div>
          <div class="detail">📅 <strong>Date:</strong> ${new Date(alert.commenceTime).toLocaleString('fr-FR')}</div>
          <div class="detail">🏢 <strong>Bookmaker:</strong> ${alert.bookmaker}</div>
          <div class="detail">🎯 <strong>Marché:</strong> ${alert.marketName}</div>
          <div class="detail">📊 <strong>Résultat:</strong> ${alert.outcome}</div>
          
          <div class="price-change">
            <strong class="${changeClass}">
              ${alert.direction} Variation: ${alert.percentChange}%
            </strong>
            <br>
            Ancienne cote: ${alert.oldPrice} (${alert.oldProb}%)
            <br>
            Nouvelle cote: ${alert.newPrice} (${alert.newProb}%)
            <br>
            Changement absolu: ${alert.absoluteChange}
          </div>
          
          <div class="detail" style="color: #666; font-size: 12px;">
            ⏱️ ${new Date(alert.timestamp).toLocaleString('fr-FR')}
          </div>
        </div>
      `;
    });

    html += `
            <div class="footer">
              <p>Ce message a été généré automatiquement par BetVariationAnalytic</p>
              <p>Ne pas répondre à cet email</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return html;
  }
}

module.exports = EmailNotifier;