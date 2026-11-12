/**
 * npm run embeddings:rebuild            → embed every chunk that has no vector yet
 * npm run embeddings:rebuild -- --full  → re-chunk and re-embed every active source
 */
import { env } from '../src/config/env.js';
import { one, pool } from '../src/config/supabase.js';
import { embedMissingChunks, reindexAll } from '../src/services/knowledge/source-management.service.js';

async function main() {
  if (!env.openaiConfigured) throw new Error('OPENAI_API_KEY is not set — embeddings cannot be generated.');
  if (process.argv.includes('--full')) {
    console.log('Re-chunking and re-embedding all active sources…');
    const r = await reindexAll();
    console.log(`Done: ${r.sources} sources, ${r.chunks} chunks.`);
  } else {
    const r = await embedMissingChunks({ onProgress: (n) => process.stdout.write(`\r  embedded ${n}`) });
    console.log(`\nDone: ${r.embedded} chunk(s) embedded.`);
  }
  const s = await one('select count(*)::int total, count(embedding)::int embedded from public.seo_virji_knowledge_chunks');
  console.log(`Knowledge chunks: ${s.total} total, ${s.embedded} with embeddings.`);
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
