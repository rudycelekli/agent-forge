import { describe, expect, it } from 'vitest';
import { GCNLayer, GNNSQLGenerator, GraphOperations } from '../src/integrations/ruvector/gnn.js';

const layer = () => new GCNLayer({ type: 'gcn', inputDim: 2, outputDim: 2 });
const graph = () => new GraphOperations();

describe('GNN SQL generation rejects executable input', () => {
  it('keeps valid identifier SQL unchanged', () => {
    expect(layer().toSQL('nodes', { schema: 'public', nodeColumn: 'embedding', edgeTable: 'nodes_edges' })).toContain(
      '(SELECT array_agg(embedding) FROM "public"."nodes")',
    );
    expect(graph().kHopNeighborsSQL('a', 2, 'nodes')).toContain("WHERE target_id = 'a'");
    expect(GNNSQLGenerator.createCacheTableSQL('cache', 8)).toContain('embedding vector(8) NOT NULL');
    expect(graph().pageRankSQL('nodes')).toContain('  0.85,\n  100');
    expect(graph().communityDetectionSQL('nodes', { algorithm: 'louvain' })).toContain("  'louvain',\n  1");
  });

  it.each([
    ['table', () => layer().toSQL('nodes"; DROP TABLE users; --')],
    ['schema', () => layer().toSQL('nodes', { schema: 'public"; DROP TABLE users; --' })],
    ['node column', () => layer().toSQL('nodes', { nodeColumn: 'embedding); DROP TABLE users; --' })],
    ['edge table', () => layer().toSQL('nodes', { edgeTable: 'edges"; DROP TABLE users; --' })],
    ['parameter prefix', () => layer().toSQL('nodes', { prepared: true, paramPrefix: '$1); DROP TABLE users; --' })],
    ['hop depth', () => graph().kHopNeighborsSQL('a', '1 OR true' as never, 'nodes')],
    ['PageRank damping', () => graph().pageRankSQL('nodes', { damping: '0.8); DROP TABLE users; --' as never })],
    ['cache dimension', () => GNNSQLGenerator.createCacheTableSQL('cache', '8); DROP TABLE users; --' as never)],
    ['community algorithm', () => graph().communityDetectionSQL('nodes', { algorithm: "louvain'); DROP TABLE users; --" as never })],
    ['community resolution', () => graph().communityDetectionSQL('nodes', { algorithm: 'louvain', resolution: '1); DROP TABLE users; --' as never })],
    ['PageRank iteration limit', () => graph().pageRankSQL('nodes', { maxIterations: Infinity })],
    ['batch GNN column', () => GNNSQLGenerator.batchGNNSQL([layer()], 'nodes', { nodeColumn: 'embedding); DROP TABLE users; --' })],
    ['cache insert table', () => GNNSQLGenerator.cacheEmbeddingsSQL('nodes', 'cache"; DROP TABLE users; --')],
    ['cache create table', () => GNNSQLGenerator.createCacheTableSQL('cache"; DROP TABLE users; --', 8)],
    ['message passing schema', () => GNNSQLGenerator.messagePassingSQL('nodes', 'mean', { schema: 'public"; DROP TABLE users; --' })],
    ['graph pooling column', () => GNNSQLGenerator.graphPoolingSQL('nodes', 'mean', { nodeColumn: 'embedding); DROP TABLE users; --' })],
  ])('rejects hostile %s', (_name, generate) => {
    expect(generate).toThrow(TypeError);
  });

  it('escapes node ids and JSON configuration inside SQL literals', () => {
    expect(graph().kHopNeighborsSQL("a' OR true --", 2, 'nodes')).toContain("WHERE target_id = 'a'' OR true --'");
    expect(graph().shortestPathSQL("a'", "b'", 'nodes')).toContain("WHERE source_id = 'a'''");
    expect(new GCNLayer({ type: 'gcn', inputDim: 2, outputDim: 2, params: { label: "Bob's" } }).toSQL('nodes'))
      .toContain("Bob''s");
    expect(GNNSQLGenerator.batchGNNSQL([new GCNLayer({ type: 'gcn', inputDim: 2, outputDim: 2, params: { label: "Bob's" } })], 'nodes'))
      .toContain("Bob''s");
  });
});
