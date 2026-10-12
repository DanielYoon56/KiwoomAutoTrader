import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes/api.js';
import { getDb } from './server/db/database.js';
import { MarketFeedManager } from './server/services/marketFeed.js';
import { SessionManager } from './server/services/sessionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : null;
  const PORT = portFromArg || Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Initialize DB and Seed
  await getDb();
  MarketFeedManager.initialize();
  await SessionManager.logAudit('SYSTEM', 'APP_STARTED', undefined, 'KiwoomAutoTrader v1.0 서버 시작 (모의투자 독립 실행 모드)');

  // Mount API router
  app.use('/api', apiRouter);

  // Dedicated 404 JSON response for any unhandled /api/* endpoint to prevent Vite from returning HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ success: false, error: '요청한 API 엔드포인트를 찾을 수 없습니다.' });
  });

  // Background Market Feed & Position Risk Loop (every 3 seconds)
  setInterval(async () => {
    try {
      await MarketFeedManager.tickMarket();
    } catch (err) {
      console.error('Market tick error:', err);
    }
  }, 3000);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KiwoomAutoTrader] Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
