# 💰 Guide d'Utilisation - Betting Simulation

## 🌐 Accès Web

### Dashboard Principal
```
http://209.38.241.107:3000
```

### Page Betting Simulation
```
http://209.38.241.107:3000/betting.html
```

## 📊 API Endpoints

### Récupérer les statistiques de betting
```bash
curl http://209.38.241.107:3000/api/bets
```

**Réponse:**
```json
{
  "bets": [...],  // Liste des paris
  "stats": {
    "totalBets": 0,
    "wins": 0,
    "losses": 0,
    "pending": 0,
    "winRate": 0,
    "totalProfit": 0,
    "avgProfit": 0,
    "initialBankroll": 1000,
    "currentBankroll": 1000,
    "roi": 0
  }
}
```

## 🛠️ Commandes Makefile

### Gestion du Système

```bash
# Déployer le système complet
make deploy-force

# Déployer uniquement le betting
make deploy-betting

# Voir les logs en temps réel
make deploy-logs

# Redémarrer le système
ssh root@209.38.241.107 "cd /root/BetVariationAnalytic && docker-compose restart"
```

### Statistiques de Betting

```bash
# Afficher les statistiques globales
make betting-stats

# Afficher les 10 derniers paris
make betting-last

# Afficher les paris en attente de résultat
make betting-pending

# Ouvrir la page web de betting
make betting-web

# Tester l'API de betting
make betting-api
```

### Résultats Réels

```bash
# Forcer la vérification des résultats (API-Football)
make betting-fetch

# Note: La vérification automatique se fait chaque jour à 10h
```

## 📋 Fonctionnement du Système

### Phase 1: Détection et Paris

1. **Scan périodique** (tous les 3 jours à 8h)
   - Découverte des matchs à venir
   - Enregistrement des cotes d'ouverture

2. **Monitoring pré-match** (15 min avant match)
   - Vérification toutes les 3 minutes
   - Détection des variations importantes

3. **Alerte déclenchée**
   - Niveau 1: Variation significative (désactivé par défaut)
   - Niveau 2: Variation importante (2.5% bankroll)
   - Niveau 3: Inversion majeure (6% bankroll)

4. **Simulation du pari**
   - Calcul de la mise selon la stratégie (balanced)
   - Ajustement des cotes selon la direction
   - Vérification des limites de risque
   - Recherche du `fixture_id` sur API-Football
   - Sauvegarde en base avec `result = NULL`

### Phase 2: Vérification Quotidienne

1. **Scheduler automatique** (chaque jour à 10h)
   - Récupération des paris avec `result = NULL`
   - Filtrage: matchs terminés depuis >2h

2. **Appel API-Football**
   - Récupération des scores finaux
   - Détermination du winner (home/away/draw)
   - Limite: 100 requêtes/jour

3. **Mise à jour des résultats**
   - Calcul: pari gagné ou perdu
   - Profit: `(mise × cote) - mise` si gagné, `-mise` si perdu
   - Update: `result`, `home_score`, `away_score`, `profit`

4. **Recalcul de la bankroll**
   - Bankroll réelle = initiale + somme des profits
   - ROI = (profit total / bankroll initiale) × 100
   - Win rate = (gagnés / total) × 100

## 🎯 Stratégie "Balanced" (Actuelle)

### Configuration des Niveaux

| Niveau | Activé | % Bankroll | Mise Max | Cotes Min | Cotes Max |
|--------|--------|-----------|----------|-----------|-----------|
| 1      | ❌ Non | 0%        | -        | -         | -         |
| 2      | ✅ Oui | 2.5%      | 40€      | 1.50      | 3.50      |
| 3      | ✅ Oui | 6%        | 75€      | 1.30      | 4.50      |

### Règles de Gestion du Risque

- **Stop-Loss**: Arrêter si bankroll < 30% de l'initiale
- **Risque quotidien max**: 10% de la bankroll
- **Paris max/jour**: 5
- **Cooldown**: 2 paris de cooldown après pertes consécutives

### Taux de Réussite Estimés

- Niveau 1: 48% (désactivé)
- Niveau 2: 52%
- Niveau 3: 58%

## 📈 Exemple d'Utilisation

### 1. Vérifier l'état du système

```bash
# Voir les logs
make deploy-logs

# Statistiques actuelles
make betting-stats
```

### 2. Consulter les résultats en ligne

```bash
# Ouvrir la page web
make betting-web

# Ou directement dans le navigateur:
# http://209.38.241.107:3000/betting.html
```

### 3. Forcer une vérification des résultats

```bash
make betting-fetch
```

### 4. Sauvegarder la base de données

```bash
make backup-db
```

## 🔧 Configuration

### Modifier la stratégie

Éditez `.env` et changez:

```env
BETTING_STRATEGY=balanced  # conservative, balanced, aggressive
INITIAL_BANKROLL=1000      # Bankroll initiale en euros
USE_REAL_RESULTS=true      # true pour résultats réels, false pour simulation
RESULTS_CHECK_HOUR=10      # Heure de vérification quotidienne
```

Puis redéployez:

```bash
make deploy-betting
```

### Modifier les seuils d'alerte

Éditez `config/betting-strategy.json` puis:

```bash
make deploy-betting
```

## 📊 Interprétation des Résultats

### Sur la page web

- **Bankroll Actuelle**: Montant disponible pour parier
- **ROI Total**: Rendement sur investissement (%)
- **Taux de Réussite**: Pourcentage de paris gagnés
- **Total Paris**: Nombre de paris placés

### Graphique d'évolution

- Ligne verte qui monte = Profit
- Ligne rouge qui descend = Perte
- Objectif: Courbe ascendante stable

### Tableau des paris

- **✅ Gagné**: Paris gagnants (vert)
- **❌ Perdu**: Paris perdants (rouge)
- **⏳ En attente**: Résultats pas encore vérifiés (jaune)

## 🚨 Alertes et Notifications

Les alertes sont envoyées sur Telegram lors de:

- **Niveau 2**: Variation importante détectée
- **Niveau 3**: Inversion majeure de cotes

Le pari est automatiquement simulé et enregistré.

## 📱 Accès Mobile

La page `betting.html` est responsive et fonctionne sur mobile:

```
http://209.38.241.107:3000/betting.html
```

## 🔍 Debugging

### Voir les paris en base

```bash
ssh root@209.38.241.107
docker exec -it bet-variation-analytic sh
sqlite3 data/odds.db

SELECT * FROM bets ORDER BY timestamp DESC LIMIT 10;
.quit
```

### Voir les logs du results fetcher

```bash
make deploy-logs | grep "Results fetcher\|fixture\|API-Football"
```

### Tester API-Football manuellement

```bash
curl -H "x-rapidapi-key: YOUR_KEY" \
  "https://v3.football.api-sports.io/fixtures?date=2025-10-17"
```

## 💡 Conseils

1. **Patience**: Les premiers résultats arrivent après les premiers matchs (48h)
2. **Monitoring**: Vérifiez régulièrement la page web
3. **Budget API**: 100 req/jour API-Football = ~50 matchs vérifiés/jour
4. **Ajustements**: Modifiez la stratégie selon les résultats observés

## 🎯 Objectifs

- **Court terme**: Observer 20-30 paris minimum
- **Moyen terme**: Valider le taux de réussite (>50%)
- **Long terme**: ROI positif stable (>5%)

---

**Status actuel**: ✅ Système déployé et opérationnel

**Prochaine vérification automatique**: Demain à 10h00

**URL principale**: http://209.38.241.107:3000/betting.html
