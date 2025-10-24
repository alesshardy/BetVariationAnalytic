# 🎯 BetVariationAnalytic - Système de Betting Intelligent

Un système complet de monitoring des variations de cotes sportives avec simulation de paris et vérification des résultats réels.

## 🌟 Fonctionnalités

### 📊 Monitoring des Cotes
- Scan périodique tous les 3 jours
- Surveillance intensive 15 min avant match
- Détection en temps réel des variations
- 3 niveaux d'alerte (variations, inversions)
- 8 ligues européennes de football

### 💰 Simulation de Betting
- **3 stratégies**: Conservative, Balanced, Aggressive
- **Gestion du risque**: Stop-loss, take-profit, limites quotidiennes
- **Calcul automatique** des mises (% bankroll)
- **Paris simulés** sur alertes niveau 2 et 3
- **Dashboard web** avec graphiques en temps réel

### ✅ Vérification Résultats Réels
- Intégration **API-Football** (100 req/jour gratuit)
- Vérification automatique **chaque jour à 10h**
- Matching automatique des matchs
- Calcul ROI réel vs simulation
- Statistiques détaillées (win rate, profit, bankroll)

### 🔔 Notifications
- **Telegram**: Alertes en temps réel
- **Email**: Résumés quotidiens (optionnel)
- **Discord**: Webhooks (optionnel)

## 🚀 Démarrage Rapide

### 1. Accès Web

```
🌐 Dashboard: http://209.38.241.107:3000
💰 Betting:   http://209.38.241.107:3000/betting.html
```

### 2. Commandes Principales

```bash
# Déployer le système
make deploy-force

# Voir les logs
make deploy-logs

# Statistiques de betting
make betting-stats

# Ouvrir la page web
make betting-web

# Forcer vérification résultats
make betting-fetch
```

### 3. Configuration

Le système est configuré dans `.env`:

```env
# Stratégie de betting
SIMULATION_MODE=true              # Activer simulation
BETTING_STRATEGY=balanced         # conservative | balanced | aggressive
INITIAL_BANKROLL=1000            # Bankroll initiale (€)

# Résultats réels
USE_REAL_RESULTS=true            # Vérifier résultats réels
API_FOOTBALL_KEY=votre_cle       # Clé API-Football
RESULTS_CHECK_HOUR=10            # Vérification à 10h

# Monitoring
MONITORING_STRATEGY=pre-match    # Stratégie pré-match
PERIODIC_SCAN_INTERVAL_DAYS=3   # Scan tous les 3 jours
PRE_MATCH_WINDOW=15             # Monitoring 15min avant match

# Notifications
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=votre_token
TELEGRAM_CHAT_ID=votre_chat_id
```

## 📊 Stratégie "Balanced" (Actuelle)

### Configuration

| Niveau | % Bankroll | Mise Max | Cotes Min-Max |
|--------|-----------|----------|---------------|
| 2      | 2.5%      | 40€      | 1.50 - 3.50   |
| 3      | 6.0%      | 75€      | 1.30 - 4.50   |

### Règles de Risque
- Stop-loss: 30% de la bankroll initiale
- Risque max/jour: 10%
- Paris max/jour: 5
- Cooldown après 2 pertes consécutives

### Taux de Réussite Estimés
- Niveau 2: 52%
- Niveau 3: 58%

## 📈 Workflow Complet

```
1. SCAN PÉRIODIQUE (tous les 3 jours)
   └─> Découverte matchs + Cotes d'ouverture

2. MONITORING PRÉ-MATCH (15 min avant)
   └─> Vérification toutes les 3 min
       └─> VARIATION DÉTECTÉE
           ├─> Niveau 2 ou 3 ?
           │   └─> OUI: Simuler pari
           │       ├─> Calculer mise (% bankroll)
           │       ├─> Rechercher fixture_id (API-Football)
           │       └─> Sauvegarder (result = NULL)
           └─> NON: Ignorer

3. VÉRIFICATION QUOTIDIENNE (10h)
   └─> Récupérer paris pending
       └─> Pour chaque pari:
           ├─> Match terminé ?
           │   └─> OUI: Récupérer résultat (API-Football)
           │       ├─> Gagné/Perdu ?
           │       ├─> Calculer profit
           │       └─> Update result + profit
           └─> NON: Attendre

4. DASHBOARD WEB
   └─> Affichage temps réel
       ├─> Bankroll actuelle
       ├─> ROI total
       ├─> Taux de réussite
       ├─> Graphique évolution
       └─> Historique paris
```

## 🛠️ Commandes Makefile Complètes

### Déploiement

```bash
make deploy-force     # Déploiement complet (rebuild)
make deploy          # Déploiement rapide
make deploy-betting  # Déploiement betting uniquement
make deploy-logs     # Voir les logs
```

### Betting

```bash
make betting-stats   # Statistiques globales
make betting-last    # 10 derniers paris
make betting-pending # Paris en attente
make betting-fetch   # Forcer vérification résultats
make betting-web     # Ouvrir page web
make betting-api     # Tester API
```

### Maintenance

```bash
make backup-db       # Sauvegarder la BDD
make update-env      # Mettre à jour .env
make shell          # Shell dans container
make db-shell       # SQLite shell
```

## 📊 API Endpoints

### GET /api/bets
Récupère tous les paris et statistiques

```bash
curl http://209.38.241.107:3000/api/bets
```

**Réponse:**
```json
{
  "bets": [
    {
      "id": 1,
      "timestamp": "2025-10-17T14:30:00Z",
      "event_name": "PSG vs Monaco",
      "alert_level": 3,
      "bet_size": 60,
      "adjusted_odds": 1.85,
      "result": "won",
      "profit": 51,
      "home_score": 3,
      "away_score": 1,
      "winner": "home"
    }
  ],
  "stats": {
    "totalBets": 15,
    "wins": 9,
    "losses": 6,
    "pending": 0,
    "winRate": 60,
    "totalProfit": 127.50,
    "currentBankroll": 1127.50,
    "roi": 12.75
  }
}
```

### GET /api/alerts/stats
Statistiques des alertes

### GET /api/config
Configuration du système

## 📁 Structure du Projet

```
BetVariationAnalytic/
├── src/
│   ├── index.js                    # Point d'entrée
│   ├── api/
│   │   └── oddsApi.js             # The Odds API
│   ├── betting/
│   │   └── bankrollManager.js     # Gestion bankroll
│   ├── services/
│   │   ├── apiFootballService.js  # API-Football
│   │   └── resultsFetcher.js      # Vérification résultats
│   ├── monitors/
│   │   └── smartMonitor.js        # Monitoring cotes
│   ├── notifications/
│   │   ├── telegramNotifier.js
│   │   └── ...
│   ├── dashboard/
│   │   └── public/
│   │       ├── index.html         # Dashboard principal
│   │       └── betting.html       # Dashboard betting
│   └── database/
│       └── db.js                  # SQLite
├── config/
│   ├── alert-levels.json          # Niveaux d'alerte
│   ├── betting-strategy.json      # Stratégies betting
│   ├── sports.json                # Ligues surveillées
│   └── competitions.json
├── docs/
│   ├── BETTING_GUIDE.md           # Guide betting
│   └── API_FOOTBALL_SETUP.md      # Setup API-Football
├── scripts/
│   └── simulate.js                # Simulation historique
├── .env                           # Configuration
├── Makefile                       # Commandes
└── docker-compose.yml
```

## 🗄️ Base de Données

### Table: bets

```sql
CREATE TABLE bets (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_name TEXT NOT NULL,
    sport TEXT NOT NULL,
    bookmaker TEXT NOT NULL,
    outcome TEXT NOT NULL,
    original_odds REAL NOT NULL,
    adjusted_odds REAL NOT NULL,
    alert_level INTEGER NOT NULL,
    variation REAL NOT NULL,
    direction TEXT NOT NULL,
    bet_size REAL NOT NULL,
    result TEXT,                    -- 'won', 'lost', NULL (pending)
    profit REAL,
    bankroll REAL NOT NULL,
    roi REAL,
    commence_time TEXT NOT NULL,
    home_team TEXT,
    away_team TEXT,
    fixture_id INTEGER,             -- ID API-Football
    home_score INTEGER,
    away_score INTEGER,
    winner TEXT,                    -- 'home', 'away', 'draw'
    result_updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🎯 Résultats Attendus

### Court Terme (1 mois)
- **Objectif**: 20-30 paris
- **Win Rate**: >50%
- **ROI**: Observer tendance

### Moyen Terme (3 mois)
- **Objectif**: 100+ paris
- **Win Rate**: 52-58%
- **ROI**: >5%

### Long Terme (6+ mois)
- **Objectif**: Stratégie validée
- **ROI**: >10%
- **Ajustements**: Optimisation continue

## 📱 Interface Web

### Dashboard Principal
- Vue d'ensemble du système
- Alertes récentes
- Statistiques API
- Configuration

### Dashboard Betting
- **Statistiques**: Bankroll, ROI, Win Rate
- **Graphique**: Évolution de la bankroll
- **Historique**: Tous les paris détaillés
- **Filtres**: Gagnés, Perdus, En attente, Par niveau
- **Auto-refresh**: Toutes les 30 secondes

## 🔐 Sécurité

- Fichier `.env` non versionné
- Clés API protégées
- Accès serveur par SSH
- Docker isolé

## 📊 Budget API

### The Odds API
- **Limite**: 500 requêtes/mois
- **Consommation**:
  - Scans périodiques: ~80 req/mois
  - Monitoring pré-match: ~420 req/mois
- **Total estimé**: ~500 req/mois ✅

### API-Football
- **Limite gratuite**: 100 req/jour
- **Consommation**:
  - Recherche fixtures: ~5-10 req/jour
  - Vérification résultats: ~20-40 req/jour
- **Total estimé**: ~30-50 req/jour ✅

## 🆘 Support & Debugging

### Logs ne s'affichent pas
```bash
ssh root@209.38.241.107
docker ps
docker logs bet-variation-analytic --tail 100
```

### API ne répond pas
```bash
curl http://209.38.241.107:3000/api/config
docker-compose restart
```

### Base de données corrompue
```bash
make backup-db
ssh root@209.38.241.107
rm /root/BetVariationAnalytic/data/odds.db
docker-compose restart
```

### Résultats pas mis à jour
```bash
make betting-fetch
# Vérifier l'heure: devrait être 10h UTC+0
```

## 📚 Documentation

- [Guide Betting](docs/BETTING_GUIDE.md) - Guide complet d'utilisation
- [API Football Setup](docs/API_FOOTBALL_SETUP.md) - Configuration API-Football

## 🎓 Concepts Clés

### Kelly Criterion Adapté
Formule de calcul de mise optimale selon la valeur perçue

### Gestion du Risque
- Stop-loss pour limiter les pertes
- Diversification des paris
- Limites quotidiennes

### Value Betting
Parier uniquement quand la cote offre une valeur positive

## 🚀 Prochaines Étapes

1. ✅ Système déployé et opérationnel
2. ⏳ Attendre premiers matchs et résultats
3. 📊 Analyser performances après 20 paris
4. 🔧 Ajuster stratégie si nécessaire
5. 📈 Optimiser selon ROI observé

## 📞 Contact

Pour toute question sur le système:
- Logs: `make deploy-logs`
- Stats: `make betting-stats`
- Web: http://209.38.241.107:3000/betting.html

---

**Status**: ✅ Opérationnel  
**Version**: 2.0  
**Dernière mise à jour**: 17 octobre 2025  
**URL**: http://209.38.241.107:3000
