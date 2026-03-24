import { Response } from 'express'

export function initSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  // Tell the browser to reconnect after 3s on connection loss
  res.write('retry: 3000\n\n')

  // Heartbeat every 20s to keep connection alive
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20_000)
  res.on('close', () => clearInterval(heartbeat))

  return {
    send(event: object) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    },
    close() {
      clearInterval(heartbeat)
      res.end()
    },
  }
}
