const winston = require('winston');
const path = require('path');
const config = require('./config');

// Définir un chemin par défaut si config.logFile est undefined
const logFile = config.logFile || './logs/app.log';
const logDir = path.dirname(logFile);

const logger = winston.createLogger({
    level: config.logLevel || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(info => {
            return `${info.timestamp} [${info.level}]: ${info.message} ${info.stack ? '\n' + info.stack : ''}`;
        })
    ),
    defaultMeta: { service: 'bet-variation-analytic' },
    transports: [
        // Console pour Docker (STDOUT)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.printf(info => {
                    const msg = typeof info.message === 'object' 
                        ? JSON.stringify(info.message, null, 2) 
                        : info.message;
                    return `${info.timestamp} ${info.level}: ${msg}`;
                })
            )
        }),
        // Fichier de logs
        new winston.transports.File({ 
            filename: logFile,
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        // Fichier d'erreurs séparé
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10485760,
            maxFiles: 5
        })
    ]
});

module.exports = logger;