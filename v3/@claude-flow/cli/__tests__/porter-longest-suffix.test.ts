import { describe, expect, it } from 'vitest';
import { buildLuceneCorpusStats, luceneBM25, luceneTokenize, porterStem } from '../src/memory/lucene-bm25.js';

// The original Porter algorithm chooses the longest matching suffix once,
// even when its measure condition fails:
// https://snowballstem.org/algorithms/porter/stemmer.html

describe('Porter step 4 longest suffix selection', () => {
  it.each(['argument', 'agreement', 'document', 'complement', 'element'])(
    'retains %s when the longest suffix fails its measure condition', (word) => {
      expect(porterStem(word)).toBe(word);
    },
  );

  it('retains the same stem after ordinary plural handling', () => {
    expect(porterStem('arguments')).toBe('argument');
    expect(porterStem('documents')).toBe('document');
  });

  it('still removes longest suffixes whose measure permits removal', () => {
    expect(porterStem('replacement')).toBe('replac');
    expect(porterStem('revival')).toBe('reviv');
    expect(porterStem('adoption')).toBe('adopt');
    expect(porterStem('running')).toBe('run');
  });

  it('keeps distinct corpus tokens out of a BM25 query match', () => {
    const docs = ['argument', 'arguments', 'argum'].map(luceneTokenize);
    const stats = buildLuceneCorpusStats(docs);
    const query = luceneTokenize('argument');
    expect(luceneBM25(query, docs[0], stats)).toBeGreaterThan(0);
    expect(luceneBM25(query, docs[1], stats)).toBeGreaterThan(0);
    expect(luceneBM25(query, docs[2], stats)).toBe(0);
  });
});
