/**
 * Who wrote which character.
 *
 * The document is still a plain string — that keeps the editor, markdown and
 * export simple. Authorship rides alongside it as one author id per character,
 * run-length encoded on the wire so a 10,000-character document written by one
 * person costs a single run rather than 10,000 entries.
 */

/** [authorId, howManyCharacters] */
export type Runs = Array<[string, number]>

export function encode(authors: string[]): Runs {
  const runs: Runs = []
  for (const a of authors) {
    const last = runs[runs.length - 1]
    if (last && last[0] === a) last[1] += 1
    else runs.push([a, 1])
  }
  return runs
}

export function decode(runs: Runs | undefined, length: number): string[] {
  const authors: string[] = []
  if (Array.isArray(runs)) {
    for (const [id, n] of runs) {
      for (let i = 0; i < n; i++) authors.push(id)
    }
  }
  // Anything unaccounted for (older documents, or a desync) is simply unowned.
  while (authors.length < length) authors.push('')
  return authors.slice(0, length)
}

/**
 * Re-attribute after an edit.
 *
 * A textarea only reports its new value, not what changed, so recover the edit
 * by matching the common prefix and suffix: whatever sits between them is what
 * this writer just inserted. That handles typing, pasting, deleting and
 * replacing a selection without needing a real diff algorithm.
 */
export function attribute(
  prevText: string,
  prevAuthors: string[],
  nextText: string,
  authorId: string,
): string[] {
  if (prevText === nextText) return prevAuthors.slice(0, nextText.length)

  const maxPrefix = Math.min(prevText.length, nextText.length)
  let p = 0
  while (p < maxPrefix && prevText[p] === nextText[p]) p++

  const maxSuffix = Math.min(prevText.length - p, nextText.length - p)
  let s = 0
  while (
    s < maxSuffix &&
    prevText[prevText.length - 1 - s] === nextText[nextText.length - 1 - s]
  ) {
    s++
  }

  const inserted = nextText.length - p - s
  const head = prevAuthors.slice(0, p)
  const middle: string[] = new Array(Math.max(0, inserted)).fill(authorId)
  const tail = prevAuthors.slice(prevText.length - s)

  const next = head.concat(middle, tail)
  // Belt and braces: the array must always match the text exactly.
  while (next.length < nextText.length) next.push(authorId)
  return next.slice(0, nextText.length)
}

/** Collapse into contiguous same-author spans for rendering. */
export function toSpans(text: string, authors: string[]): Array<{ text: string; author: string }> {
  const spans: Array<{ text: string; author: string }> = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    const changed = i === text.length || (authors[i] ?? '') !== (authors[start] ?? '')
    if (changed) {
      spans.push({ text: text.slice(start, i), author: authors[start] ?? '' })
      start = i
    }
  }
  return spans
}
