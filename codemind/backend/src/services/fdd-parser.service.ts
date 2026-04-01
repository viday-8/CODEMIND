import { ValidationError } from '../middleware/error'

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]

export async function parseDocument(buffer: Buffer, mimeType: string): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ValidationError(`Unsupported file type: ${mimeType}. Allowed: PDF, DOCX, TXT, MD`)
  }

  if (mimeType === 'application/pdf') {
    // Dynamic import avoids pdf-parse reading a test file at startup
    const mod = await import('pdf-parse')
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> = (mod as any).default ?? mod
    const result = await pdfParse(buffer)
    return result.text
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // text/plain or text/markdown
  return buffer.toString('utf8')
}
