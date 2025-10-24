.PHONY: help build up down restart logs clean deploy test status prune full-clean

# Variables
COMPOSE = docker-compose
SERVER = root@209.38.241.107
SERVER_PATH = /root/BetVariationAnalytic

# Couleurs pour les messages
GREEN = \033[0;32m
YELLOW = \033[1;33m
RED = \033[0;31m
NC = \033[0m # No Color

help: ## Affiche cette aide
	@echo "$(GREEN)Commandes disponibles:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'

build: ## Construit les images Docker
	@echo "$(GREEN)📦 Construction des images...$(NC)"
	$(COMPOSE) build

up: ## Démarre les containers
	@echo "$(GREEN)🚀 Démarrage des containers...$(NC)"
	$(COMPOSE) up -d

down: ## Arrête les containers
	@echo "$(YELLOW)🛑 Arrêt des containers...$(NC)"
	$(COMPOSE) down

restart: ## Redémarre les containers
	@echo "$(YELLOW)🔄 Redémarrage des containers...$(NC)"
	$(COMPOSE) restart

logs: ## Affiche les logs en temps réel
	@echo "$(GREEN)📋 Affichage des logs...$(NC)"
	$(COMPOSE) logs -f

logs-variations: ## Affiche uniquement les logs de variations
	@echo "$(GREEN)🔍 Filtrage des variations...$(NC)"
	$(COMPOSE) logs -f | grep -E "🚨|variation"

status: ## Affiche le statut des containers
	@echo "$(GREEN)📊 Statut des containers:$(NC)"
	$(COMPOSE) ps

clean: ## Arrête et supprime les containers
	@echo "$(RED)🧹 Nettoyage des containers...$(NC)"
	$(COMPOSE) down -v

prune: ## Nettoie Docker (images, volumes, cache)
	@echo "$(RED)🗑️  Nettoyage complet de Docker...$(NC)"
	docker system prune -af
	docker volume prune -f

full-clean: clean prune ## Nettoyage complet (containers + Docker)
	@echo "$(RED)✨ Nettoyage complet terminé!$(NC)"

rebuild: clean build up logs ## Arrête, reconstruit et redémarre tout
	@echo "$(GREEN)✅ Reconstruction complète terminée!$(NC)"

# Commandes de déploiement sur le serveur
deploy: ## Déploie sur le serveur distant
	@echo "$(GREEN)🚀 Déploiement sur le serveur...$(NC)"
	rsync -avz --progress --exclude 'node_modules' --exclude '.git' --exclude 'data' --exclude 'logs' ./ $(SERVER):$(SERVER_PATH)/
	@echo "$(GREEN)✅ Fichiers transférés!$(NC)"

deploy-restart: deploy ## Déploie et redémarre sur le serveur
	@echo "$(YELLOW)🔄 Redémarrage sur le serveur...$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker-compose restart"
	@echo "$(GREEN)✅ Redémarrage terminé!$(NC)"

deploy-rebuild: deploy ## Déploie et reconstruit sur le serveur
	@echo "$(GREEN)🔨 Reconstruction sur le serveur...$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker-compose down && docker-compose up --build -d"
	@echo "$(GREEN)✅ Reconstruction terminée!$(NC)"

deploy-force: deploy ## Déploie avec reconstruction complète (sans cache)
	@echo "$(GREEN)🔨 Reconstruction FORCÉE sur le serveur (sans cache)...$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker-compose down && docker-compose build --no-cache && docker-compose up -d"
	@echo "$(GREEN)✅ Reconstruction forcée terminée!$(NC)"

deploy-clean-rebuild: deploy-clean deploy ## Nettoie complètement puis redéploie
	@echo "$(GREEN)🔨 Nettoyage + reconstruction sur le serveur...$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker-compose up --build -d"
	@echo "$(GREEN)✅ Nettoyage + reconstruction terminés!$(NC)"

deploy-logs: ## Affiche les logs du serveur distant
	@echo "$(GREEN)📋 Logs du serveur:$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker-compose logs -f"

deploy-clean: ## Nettoie complètement le serveur distant
	@echo "$(RED)🧹 Nettoyage du serveur...$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker-compose down -v && docker system prune -af"
	@echo "$(GREEN)✅ Serveur nettoyé!$(NC)"

# Commandes de test
test-api: ## Teste les endpoints API localement
	@echo "$(GREEN)🧪 Test des endpoints API...$(NC)"
	@curl -s http://localhost:3000/api/config | jq || echo "$(RED)❌ /api/config échoué$(NC)"
	@curl -s http://localhost:3000/api/alerts/stats | jq || echo "$(RED)❌ /api/alerts/stats échoué$(NC)"
	@curl -s http://localhost:3000/api/alerts/recent?limit=5 | jq || echo "$(RED)❌ /api/alerts/recent échoué$(NC)"

test-api-remote: ## Teste les endpoints API sur le serveur distant
	@echo "$(GREEN)🧪 Test des endpoints API distants...$(NC)"
	@curl -s http://209.38.241.107:3000/api/config | jq || echo "$(RED)❌ /api/config échoué$(NC)"
	@curl -s http://209.38.241.107:3000/api/alerts/stats | jq || echo "$(RED)❌ /api/alerts/stats échoué$(NC)"

# Commandes de monitoring
shell: ## Ouvre un shell dans le container
	@echo "$(GREEN)💻 Ouverture du shell...$(NC)"
	$(COMPOSE) exec bet-monitor sh

db-shell: ## Ouvre SQLite dans le container
	@echo "$(GREEN)🗄️  Ouverture de la base de données...$(NC)"
	$(COMPOSE) exec bet-monitor sqlite3 data/odds.db

show-variations: ## Affiche les variations en base de données
	@echo "$(GREEN)📊 Variations détectées:$(NC)"
	$(COMPOSE) exec bet-monitor sqlite3 data/odds.db "SELECT COUNT(*) as total FROM variations;"

# Commandes utiles
update-env: ## Met à jour le fichier .env sur le serveur
	@echo "$(YELLOW)📝 Mise à jour de .env sur le serveur...$(NC)"
	scp .env $(SERVER):$(SERVER_PATH)/
	@echo "$(GREEN)✅ .env mis à jour! N'oubliez pas de redémarrer.$(NC)"

backup-db: ## Télécharge la base de données depuis le serveur
	@echo "$(GREEN)💾 Sauvegarde de la base de données...$(NC)"
	scp $(SERVER):$(SERVER_PATH)/data/odds.db ./backup_$(shell date +%Y%m%d_%H%M%S).db
	@echo "$(GREEN)✅ Base de données sauvegardée!$(NC)"

# Commandes Betting Simulation
betting-stats: ## Affiche les statistiques de betting
	@echo "$(GREEN)💰 Statistiques de Betting:$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker exec bet-variation-analytic node -e \"const db = require('better-sqlite3')('./data/odds.db'); const stats = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN result=\\\"won\\\" THEN 1 ELSE 0 END) as wins, SUM(CASE WHEN result=\\\"lost\\\" THEN 1 ELSE 0 END) as losses, SUM(CASE WHEN result IS NULL THEN 1 ELSE 0 END) as pending, SUM(profit) as totalProfit FROM bets').get(); console.log(JSON.stringify(stats, null, 2)); db.close();\""

betting-last: ## Affiche les 10 derniers paris
	@echo "$(GREEN)📋 Derniers paris:$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker exec bet-variation-analytic sqlite3 data/odds.db 'SELECT datetime(timestamp), event_name, alert_level, bet_size, adjusted_odds, result, profit FROM bets ORDER BY timestamp DESC LIMIT 10;'"

betting-pending: ## Affiche les paris en attente de résultat
	@echo "$(GREEN)⏳ Paris en attente:$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker exec bet-variation-analytic sqlite3 data/odds.db 'SELECT COUNT(*) as pending, SUM(bet_size) as total_stake FROM bets WHERE result IS NULL;'"

betting-fetch: ## Force la vérification des résultats
	@echo "$(GREEN)🔍 Vérification des résultats...$(NC)"
	ssh $(SERVER) "cd $(SERVER_PATH) && docker exec bet-variation-analytic node -e \"const fetcher = require('./src/services/resultsFetcher'); fetcher.fetchPendingResults();\""

betting-web: ## Ouvre la page web de betting
	@echo "$(GREEN)🌐 Ouverture de la page betting...$(NC)"
	@echo "$(YELLOW)📱 URL: http://209.38.241.107:3000/betting.html$(NC)"
	@command -v xdg-open > /dev/null && xdg-open http://209.38.241.107:3000/betting.html || command -v open > /dev/null && open http://209.38.241.107:3000/betting.html || echo "$(RED)Ouvrez manuellement: http://209.38.241.107:3000/betting.html$(NC)"

betting-api: ## Teste l'API de betting
	@echo "$(GREEN)🧪 Test de l'API betting...$(NC)"
	@curl -s http://209.38.241.107:3000/api/bets | jq '.stats' || echo "$(RED)❌ API échouée$(NC)"

# Commandes de déploiement rapide
deploy-betting: ## Déploie uniquement les fichiers de betting
	@echo "$(GREEN)🚀 Déploiement betting...$(NC)"
	rsync -avz --progress src/betting/ $(SERVER):$(SERVER_PATH)/src/betting/
	rsync -avz --progress src/services/ $(SERVER):$(SERVER_PATH)/src/services/
	rsync -avz --progress src/dashboard/public/betting.html $(SERVER):$(SERVER_PATH)/src/dashboard/public/
	rsync -avz --progress .env $(SERVER):$(SERVER_PATH)/
	ssh $(SERVER) "cd $(SERVER_PATH) && docker-compose restart"
	@echo "$(GREEN)✅ Betting déployé!$(NC)"

# Commande par défaut
.DEFAULT_GOAL := help