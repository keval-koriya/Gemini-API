import loglevel from 'loglevel';

const logger = loglevel.getLogger('gemini-webapi');
logger.setDefaultLevel(logger.levels.INFO);

export function setLogLevel(level: loglevel.LogLevelDesc) {
    logger.setLevel(level);
}

export { logger };
