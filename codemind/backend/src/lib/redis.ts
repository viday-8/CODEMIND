import { Redis } from 'ioredis'
import { config } from '../config'
import { logger } from './logger'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null })
    _redis.on('error', (err) => logger.error({ err }, 'Redis error'))
    _redis.on('connect', () => logger.info('Redis connected'))
  }
  return _redis
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return Reflect.get(getRedis(), prop)
  },
})
