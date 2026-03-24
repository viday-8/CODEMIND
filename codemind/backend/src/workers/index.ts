import 'dotenv/config'
import '../config' // validate env on startup
import { startIngestWorker } from './ingest.worker'
import { startAgentWorker }  from './agent.worker'
import { startReviewWorker } from './review.worker'
import { startPatchWorker }  from './patch.worker'
import { logger } from '../lib/logger'
import { getEmbedder } from '../lib/embedder'

async function main() {
  logger.info('Starting CodeMind workers...')

  // Pre-load embedding model so first job doesn't cold-start
  await getEmbedder()

  startIngestWorker()
  startAgentWorker()
  startReviewWorker()
  startPatchWorker()

  logger.info('All workers running')
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start workers')
  process.exit(1)
})
