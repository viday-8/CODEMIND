import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config'

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  return _client
}

export async function callClaude(
  userMessage: string,
  systemMessage: string,
  maxTokens = 4096,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const msg = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: systemMessage,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  return {
    text,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
  }
}
