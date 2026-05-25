import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // En desarrollo, formato legible; en producción, JSON
  ...(process.env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})
