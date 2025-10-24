# Configuration API-Football

## Obtenir votre clé API gratuite

1. **Inscription sur RapidAPI** (où API-Football est hébergé)
   - Allez sur: https://rapidapi.com/api-sports/api/api-football
   - Cliquez sur "Sign Up" en haut à droite
   - Créez un compte (gratuit)

2. **Souscrire au plan gratuit**
   - Une fois connecté, vous verrez les différents plans
   - Sélectionnez le plan "**FREE**" (0€/mois)
   - Limitations: **100 requêtes/jour**

3. **Obtenir votre clé API**
   - Une fois inscrit au plan FREE, vous verrez votre clé dans la section "**X-RapidAPI-Key**"
   - Copiez cette clé

4. **Ajouter la clé dans .env**
   ```bash
   API_FOOTBALL_KEY=votre_cle_ici
   USE_REAL_RESULTS=true
   ```

## Consommation estimée

Avec le plan gratuit (100 req/jour):

- **Monitoring quotidien**: 
  - ~30-50 matchs détectés/jour
  - 1 requête par match pour récupérer le fixture_id
  - 1 requête 24h après pour le résultat
  - **Total: ~60-100 requêtes/jour** (limite atteinte si beaucoup de matchs)

- **Optimisations possibles**:
  - Grouper les requêtes par date (1 requête = tous les matchs du jour)
  - Ne vérifier que les paris de niveau 2 et 3
  - Augmenter SCORES_CHECK_INTERVAL à 48h au lieu de 24h

## Alternative sans API-Football

Si vous ne voulez pas utiliser API-Football, vous pouvez désactiver:

```bash
USE_REAL_RESULTS=false
```

Dans ce cas, la simulation utilise des **taux de réussite probabilistes** définis dans `config/betting-strategy.json`:

```json
"simulation": {
  "winRate": {
    "level1": 0.48,  // 48% de réussite
    "level2": 0.52,  // 52% de réussite
    "level3": 0.58   // 58% de réussite
  }
}
```

## Notes importantes

⚠️ **Le plan gratuit est limité**:
- 100 requêtes/jour max
- Si limite atteinte, les résultats ne seront pas mis à jour ce jour-là
- Les paris resteront en "pending" jusqu'au lendemain

✅ **Recommandation**:
- Commencer avec USE_REAL_RESULTS=false
- Tester la simulation probabiliste
- Activer les résultats réels quand vous êtes prêt
- Surveiller la consommation avec `apiFootball.getUsageStats()`
