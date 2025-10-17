FROM node:18-slim

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier UNIQUEMENT package.json
COPY package.json ./

# Installer les dépendances (compilation dans le container)
RUN npm install --omit=dev --verbose

# Copier le code source
COPY src/ ./src/
COPY config/ ./config/
COPY .env ./.env

# Créer les dossiers
RUN mkdir -p data logs

EXPOSE 3000

CMD ["node", "src/index.js"]