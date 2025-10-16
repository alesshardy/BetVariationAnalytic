FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p data logs

EXPOSE 3000

CMD ["node", "src/index.js"]
