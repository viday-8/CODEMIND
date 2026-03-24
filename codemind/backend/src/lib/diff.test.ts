import { describe, it, expect } from 'vitest'
import { parseDiff, applyDiff } from './diff'

const SAMPLE_DIFF = `--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,6 @@
 export function add(a: number, b: number) {
-  return a + b
+  // Add two numbers and return the result
+  return a + b
 }

 export function sub(a: number, b: number) {`

describe('parseDiff', () => {
  it('happy path — extracts diff and explanation from Claude response', () => {
    const response = `<diff>${SAMPLE_DIFF}</diff><explanation>Added a comment to the add function.</explanation>`
    const result = parseDiff(response)

    expect(result.diff).toBe(SAMPLE_DIFF)
    expect(result.explanation).toBe('Added a comment to the add function.')
    expect(result.additions).toBe(2)
    expect(result.deletions).toBe(1)
  })

  it('error path — returns empty diff when tags are missing', () => {
    const result = parseDiff('No tags here, just plain text.')

    expect(result.diff).toBe('')
    expect(result.explanation).toBe('')
    expect(result.additions).toBe(0)
    expect(result.deletions).toBe(0)
  })

  it('counts additions and deletions correctly', () => {
    const response = `<diff>--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,4 @@
 line1
-line2
+line2a
+line2b
 line3</diff><explanation>x</explanation>`
    const result = parseDiff(response)
    expect(result.additions).toBe(2)
    expect(result.deletions).toBe(1)
  })
})

describe('applyDiff', () => {
  it('happy path — applies an addition to source', () => {
    const original = 'line1\nline2\nline3'
    const diff = `--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,4 @@
 line1
 line2
+line2b
 line3`
    const result = applyDiff(original, diff)
    expect(result).toContain('line2b')
    expect(result).toContain('line3')
  })

  it('error path — returns original when diff is empty', () => {
    const original = 'hello world'
    expect(applyDiff(original, '')).toBe(original)
  })
})
