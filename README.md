# 🎯 BetVariationAnalytic

Système intelligent de monitoring des variations de cotes sportives en temps réel.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

## 📋 Fonctionnalités

- ✅ **Smart Polling**: Adapte automatiquement la fréquence de monitoring selon le jour et l'heure
- ✅ **Multi-sports**: Football, Tennis, Basketball (extensible)
- ✅ **Détection intelligente**: Identifie les variations significatives de cotes
- ✅ **Notifications multi-canaux**: Email, Telegram, Discord, Webhooks
- ✅ **Dashboard web**: Visualisation en temps réel avec graphiques
- ✅ **Base de données**: Historique complet des cotes et variations
- ✅ **Gestion du budget API**: Optimise l'utilisation de vos 500 requêtes/mois
- ✅ **Docker Ready**: Déploiement facile avec Docker

## 🚀 Installation rapide

### Prérequis

- Node.js >= 18.0.0
- npm ou yarn
- Clé API de [The Odds API](https://the-odds-api.com)

### Installation

```bash
# Cloner le repository
git clone https://github.com/alesshardy/BetVariationAnalytic.git
cd BetVariationAnalytic

# Installer les dépendances
npm install

# Copier le fichier de configuration
cp .env.example .env

# Éditer .env avec vos clés API
nano .env
```

### Configuration

1. **Obtenir votre clé API**:
   - Inscrivez-vous sur [The Odds API](https://the-odds-api.com)
   - Copiez votre clé API gratuite (500 requêtes/mois)

2. **Configurer les notifications** (optionnel):
   - **Email**: Utilisez un mot de passe d'application Gmail
   - **Telegram**: Créez un bot avec [@BotFather](https://t.me/botfather)
   - **Discord**: Créez un webhook dans les paramètres du canal

3. **Lancer l'application**:

```bash
# Démarrer le monitoring
npm start

# Démarrer en mode développement
npm run dev

# Lancer uniquement le dashboard
npm run dashboard
```

## 📊 Dashboard

Accédez au dashboard sur: `http://localhost:3000`

Le dashboard affiche:
- 📈 Graphiques des variations de cotes en temps réel
- 📊 Statistiques de consommation API
- 🎯 Liste des alertes récentes
- ⚙️ Configuration du monitoring

## 🔧 Configuration avancée

### Priorités des compétitions

Éditez `config/competitions.json`:

```json
{
  "high": ["soccer_epl", "soccer_france_ligue_one"],
  "medium": ["soccer_spain_la_liga", "soccer_uefa_champs_league"],
  "low": ["soccer_italy_serie_a"]
}
```

### Seuils de détection

Dans `.env`:
```env
MIN_PERCENT_CHANGE=5      # Variation minimum en %
MIN_ABSOLUTE_CHANGE=0.10  # Variation minimum absolue
```

## 📖 Documentation

- [Guide de configuration](docs/SETUP.md)
- [Documentation API](docs/API.md)
- [Guide de déploiement](docs/DEPLOYMENT.md)

## 🐳 Docker

```bash
# Construire l'image
docker-compose build

# Lancer le conteneur
docker-compose up -d

# Voir les logs
docker-compose logs -f
```

## 📈 Optimisation du budget API

Avec 500 requêtes/mois, le système adapte automatiquement:

| Type de jour | Fréquence haute priorité | Fréquence moyenne | Fréquence basse |
|--------------|-------------------------|-------------------|-----------------|
| Jour de match | 60 min | 120 min | 240 min |
| Jour normal | 120 min | 240 min | 480 min |
| Nuit (0h-8h) | 360 min | 720 min | Désactivé |

**Estimation**: ~350 requêtes/mois avec 5 compétitions

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à:
- 🐛 Reporter des bugs
- 💡 Proposer des nouvelles fonctionnalités
- 📝 Améliorer la documentation
- 🔧 Soumettre des Pull Requests

## 📝 License

MIT License - voir le fichier [LICENSE](LICENSE)

## 🙏 Remerciements

- [The Odds API](https://the-odds-api.com) pour l'API de cotes
- La communauté open source

## 📧 Contact

Pour toute question: [Créer une issue](https://github.com/alesshardy/BetVariationAnalytic/issues)

---

⭐ Si ce projet vous est utile, n'hésitez pas à lui donner une étoile !
