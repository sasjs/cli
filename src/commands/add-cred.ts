import { Logger, LogLevel } from '@sasjs/utils/logger/index'

export const addCredential = async (targetName: string): Promise<void> => {
    const logger = new Logger(LogLevel.Debug)
    logger.info(`You are here: ${targetName}`)
}