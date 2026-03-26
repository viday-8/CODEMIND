import type { FileContent } from './github'

export interface ParsedFile extends FileContent {
  imports: Array<{ what: string; from: string; line: number }>
  exports: Array<{ name: string; line: number }>
  functions: Array<{ name: string; startLine: number; endLine: number; kind: string }>
  classes: Array<{ name: string; startLine: number; endLine: number }>
}

// Regex-based lightweight parser (tree-sitter WASM can be wired in per-language as needed)
export class ParserService {
  async parseAll(files: FileContent[]): Promise<ParsedFile[]> {
    return files.map((f) => this.parseFile(f))
  }

  parseFile(file: FileContent): ParsedFile {
    const lines = file.content.split('\n')
    const ext = '.' + file.path.split('.').pop()?.toLowerCase()

    return {
      ...file,
      imports: this.extractImports(lines, ext),
      exports: this.extractExports(lines, ext),
      functions: this.extractFunctions(lines, ext),
      classes: this.extractClasses(lines, ext),
    }
  }

  private extractImports(lines: string[], ext: string) {
    const results: ParsedFile['imports'] = []

    if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
      lines.forEach((line, i) => {
        // import X from 'Y' | import { X } from 'Y' | import * as X from 'Y'
        const m = line.match(/^import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/)
        if (m) results.push({ what: line.trim(), from: m[1], line: i + 1 })
        // require('Y')
        const r = line.match(/require\(['"]([^'"]+)['"]\)/)
        if (r) results.push({ what: line.trim(), from: r[1], line: i + 1 })
      })
    } else if (ext === '.py') {
      lines.forEach((line, i) => {
        const m = line.match(/^(?:from\s+(\S+)\s+import|import\s+(\S+))/)
        if (m) results.push({ what: line.trim(), from: m[1] ?? m[2], line: i + 1 })
      })
    } else if (ext === '.go') {
      lines.forEach((line, i) => {
        const m = line.match(/^\s*"([^"]+)"/)
        if (m) results.push({ what: line.trim(), from: m[1], line: i + 1 })
      })
    } else if (ext === '.java') {
      lines.forEach((line, i) => {
        const m = line.match(/^import\s+([\w.]+);/)
        if (m) results.push({ what: line.trim(), from: m[1], line: i + 1 })
      })
    }

    return results
  }

  private extractExports(lines: string[], ext: string) {
    const results: ParsedFile['exports'] = []
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) return results

    lines.forEach((line, i) => {
      const m = line.match(/^export\s+(?:default\s+)?(?:const|let|var|function|class|type|interface|enum)?\s*(\w+)/)
      if (m) results.push({ name: m[1], line: i + 1 })
    })
    return results
  }

  private extractFunctions(lines: string[], ext: string) {
    const results: ParsedFile['functions'] = []
    const stack: Array<{ name: string; startLine: number; kind: string }> = []
    let braceDepth = 0

    lines.forEach((line, i) => {
      const lineNum = i + 1
      let m: RegExpMatchArray | null = null

      if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
        m = line.match(/(?:^|\s)(?:async\s+)?function\s+(\w+)\s*\(/)
          ?? line.match(/(?:^|const|let|var)\s+(\w+)\s*(?::[^=<]*(?:<[^>]*>)?)?\s*=\s*(?:async\s+)?\(/)
          ?? line.match(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/)
      } else if (ext === '.py') {
        m = line.match(/^def\s+(\w+)\s*\(/)
          ?? line.match(/^\s{4}def\s+(\w+)\s*\(/)
      } else if (ext === '.go') {
        m = line.match(/^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/)
      } else if (ext === '.java') {
        m = line.match(/(?:public|private|protected|static|final)\s+(?:\S+\s+)+(\w+)\s*\(/)
      }

      if (m) stack.push({ name: m[1], startLine: lineNum, kind: 'function' })

      braceDepth += (line.match(/\{/g) ?? []).length
      braceDepth -= (line.match(/\}/g) ?? []).length

      if (braceDepth <= 0 && stack.length) {
        const fn = stack.pop()!
        results.push({ name: fn.name, startLine: fn.startLine, endLine: lineNum, kind: fn.kind })
        braceDepth = 0
      }
    })

    return results
  }

  private extractClasses(lines: string[], ext: string) {
    const results: ParsedFile['classes'] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      let m: RegExpMatchArray | null = null
      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        m = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/)
      } else if (ext === '.py') {
        m = line.match(/^class\s+(\w+)/)
      } else if (ext === '.java') {
        m = line.match(/(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)/)
      } else if (ext === '.go') {
        m = line.match(/^type\s+(\w+)\s+struct/)
      }

      if (!m) continue
      const name = m[1]
      const startLine = i + 1
      let depth = 0
      let started = false
      let endLine = startLine

      for (let j = i; j < lines.length; j++) {
        const opens = (lines[j].match(/\{/g) ?? []).length
        const closes = (lines[j].match(/\}/g) ?? []).length
        depth += opens - closes
        if (opens > 0) started = true
        if (started && depth <= 0) { endLine = j + 1; break }
        endLine = j + 1
      }

      results.push({ name, startLine, endLine })
    }

    return results
  }
}
