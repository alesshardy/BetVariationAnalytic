const axios = require('axios');
const logger = require('../utils/logger');

class ApiFootballService {
  constructor() {
    this.apiKey = process.env.API_FOOTBALL_KEY;
    this.baseUrl = 'https://v3.football.api-sports.io';
    this.requestCount = 0;
    this.dailyLimit = 100;
    this.lastResetDate = new Date().toDateString();
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      },
      timeout: 10000
    });
  }

  /**
   * Vérifie et réinitialise le compteur de requêtes si nécessaire
   */
  checkRateLimit() {
    const currentDate = new Date().toDateString();
    if (currentDate !== this.lastResetDate) {
      this.requestCount = 0;
      this.lastResetDate = currentDate;
      logger.info('🔄 API-Football rate limit reset');
    }

    if (this.requestCount >= this.dailyLimit) {
      throw new Error(`API-Football daily limit reached (${this.dailyLimit} requests)`);
    }
  }

  /**
   * Exécute une requête avec gestion du rate limiting
   */
  async makeRequest(endpoint, params = {}) {
    this.checkRateLimit();
    
    try {
      const response = await this.client.get(endpoint, { params });
      this.requestCount++;
      
      logger.info(`📊 API-Football request [${this.requestCount}/${this.dailyLimit}]: ${endpoint}`, {
        params,
        results: response.data.results
      });

      return response.data;
    } catch (error) {
      logger.error('❌ API-Football request failed', {
        endpoint,
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Récupère les fixtures à venir pour une date donnée
   * @param {string} date - Format YYYY-MM-DD
   * @param {string} league - League ID (optionnel)
   */
  async getFixtures(date, league = null) {
    const params = { date };
    if (league) params.league = league;
    
    const data = await this.makeRequest('/fixtures', params);
    return data.response || [];
  }

  /**
   * Récupère les résultats d'un match spécifique
   * @param {number} fixtureId - ID du match
   */
  async getFixtureResult(fixtureId) {
    const data = await this.makeRequest('/fixtures', { id: fixtureId });
    
    if (!data.response || data.response.length === 0) {
      return null;
    }

    const fixture = data.response[0];
    return this.parseFixtureResult(fixture);
  }

  /**
   * Parse les résultats d'un match
   */
  parseFixtureResult(fixture) {
    const status = fixture.fixture.status.short;
    
    // Match pas encore terminé
    if (!['FT', 'AET', 'PEN'].includes(status)) {
      return {
        fixtureId: fixture.fixture.id,
        status: status,
        finished: false,
        homeTeam: fixture.teams.home.name,
        awayTeam: fixture.teams.away.name,
        date: fixture.fixture.date
      };
    }

    // Match terminé
    const homeScore = fixture.goals.home;
    const awayScore = fixture.goals.away;
    
    let winner = null;
    if (homeScore > awayScore) winner = 'home';
    else if (awayScore > homeScore) winner = 'away';
    else winner = 'draw';

    return {
      fixtureId: fixture.fixture.id,
      status: status,
      finished: true,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      homeScore,
      awayScore,
      winner,
      date: fixture.fixture.date
    };
  }

  /**
   * Map un match The Odds API vers API-Football
   * Cherche le fixture_id correspondant
   */
  async findFixtureByMatch(homeTeam, awayTeam, matchDate) {
    try {
      // Extraire la date (format YYYY-MM-DD)
      const date = matchDate.split('T')[0];
      
      // Chercher les fixtures de cette date
      const fixtures = await this.getFixtures(date);
      
      // Normaliser les noms d'équipes pour la comparaison
      const normalizeTeam = (name) => {
        return name.toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/fc|sc|afc|united|city/g, '');
      };
      
      const homeNorm = normalizeTeam(homeTeam);
      const awayNorm = normalizeTeam(awayTeam);
      
      // Chercher une correspondance
      for (const fixture of fixtures) {
        const fixtureHome = normalizeTeam(fixture.teams.home.name);
        const fixtureAway = normalizeTeam(fixture.teams.away.name);
        
        if (fixtureHome.includes(homeNorm) && fixtureAway.includes(awayNorm)) {
          logger.info('✅ Match found on API-Football', {
            oddsApi: `${homeTeam} vs ${awayTeam}`,
            apiFootball: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
            fixtureId: fixture.fixture.id
          });
          
          return fixture.fixture.id;
        }
      }
      
      logger.warn('⚠️ No matching fixture found on API-Football', {
        homeTeam,
        awayTeam,
        date
      });
      
      return null;
    } catch (error) {
      logger.error('❌ Error finding fixture', { error: error.message });
      return null;
    }
  }

  /**
   * Vérifie le résultat d'un pari
   * @param {object} bet - Objet pari avec outcome (h2h winner)
   * @param {object} result - Résultat du match
   */
  checkBetResult(bet, result) {
    if (!result.finished) {
      return { status: 'pending', won: null };
    }

    const betOutcome = bet.outcome.toLowerCase();
    const winner = result.winner;

    let won = false;

    // Match du winner
    if (betOutcome.includes(result.homeTeam.toLowerCase()) && winner === 'home') {
      won = true;
    } else if (betOutcome.includes(result.awayTeam.toLowerCase()) && winner === 'away') {
      won = true;
    } else if (betOutcome === 'draw' && winner === 'draw') {
      won = true;
    }

    return {
      status: 'settled',
      won,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winner: result.winner
    };
  }

  /**
   * Statistiques de consommation API
   */
  getUsageStats() {
    return {
      requestsToday: this.requestCount,
      dailyLimit: this.dailyLimit,
      remaining: this.dailyLimit - this.requestCount,
      percentUsed: ((this.requestCount / this.dailyLimit) * 100).toFixed(1),
      resetDate: this.lastResetDate
    };
  }
}

module.exports = new ApiFootballService();
