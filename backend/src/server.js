const express  = require('express');
const cors     = require('cors');
const rateLimit = require('express-rate-limit');
const cron     = require('node-cron');
const path     = require('path');
const fs       = require('fs');
require('dotenv').config();

const webhookRouter   = require('./routes/webhook');
const { router: authRouter } = require('./routes/auth');
const citizensRouter  = require('./routes/citizens');
const analyticsRouter = require('./routes/analytics');
const documentsRouter = require('./routes/documents');
const broadcastRouter = require('./routes/broadcast');
const formsRouter = require('./routes/forms');
const taxRouter = require('./routes/tax');
const templatesRouter = require('./routes/templates');
const configRouter = require('./routes/config');
const { cleanExpiredSessions } = require('./services/sessionManager');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Trust proxy (Ngrok / Nginx) ──────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── Global Rate Limiter ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Stricter limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts.' },
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.DASHBOARD_URL || 'http://localhost:3001']
    : '*',
  credentials: true,
}));

// ─── Body Parsers ─────────────────────────────────────────────────────────────
// Twilio sends urlencoded form data
app.use('/webhook', express.urlencoded({ extended: false }));
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(globalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/webhook/whatsapp', webhookRouter);
app.use('/api/auth',         authLimiter, authRouter);
app.use('/api/citizens',     citizensRouter);
app.use('/api/analytics',    analyticsRouter);
app.use('/api/documents',    documentsRouter);
app.use('/api/broadcast',    broadcastRouter);
app.use('/api/forms',        formsRouter);
app.use('/api/tax',          taxRouter);
app.use('/api/templates',    templatesRouter);
app.use('/api/config',       configRouter);

// ─── Static Media Serving (for Twilio PDF delivery) ─────────────────────────
const os = require('os');
// On Render (free tier), use the OS temp dir since the filesystem is ephemeral.
// On local/Railway use a persistent storage folder.
const MEDIA_DIR = (process.env.NODE_ENV === 'production' || process.env.RENDER)
  ? os.tmpdir()
  : path.join(__dirname, '../storage/temp-media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
app.use('/media', express.static(MEDIA_DIR));
console.log(`[Media] Serving temp PDFs/QRs from: ${MEDIA_DIR}`);
console.log(`[Media] Public URL: ${process.env.PUBLIC_URL || 'NOT SET — add PUBLIC_URL to .env'}/media/`);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    service: 'Gram Panchayat WhatsApp Bot',
    version: '2.0.0',
    status:  'running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Scheduled Jobs / Cron ────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  // Session cleanup every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    cleanExpiredSessions().catch(err => console.error('[Cron] Session cleanup error:', err.message));
  });

  // ── Render free-tier keep-alive ping ──────────────────────────────────────
  // Render's free plan spins down after 15 min of inactivity.
  // This self-ping every 13 min prevents mid-conversation cold starts.
  if (process.env.NODE_ENV === 'production' && process.env.PUBLIC_URL) {
    const https = require('https');
    const http  = require('http');
    cron.schedule('*/13 * * * *', () => {
      const url    = `${process.env.PUBLIC_URL.replace(/\/$/, '')}/health`;
      const mod    = url.startsWith('https') ? https : http;
      const req    = mod.get(url, (res) => {
        console.log(`[KeepAlive] Ping → ${url} | status ${res.statusCode}`);
      });
      req.on('error', (e) => console.warn(`[KeepAlive] Ping failed: ${e.message}`));
      req.end();
    });
    console.log('[KeepAlive] Self-ping cron active (every 13 min).');
  }
}

// Vercel cron endpoint
app.get('/api/cron/cleanup', async (req, res) => {
  try {
    await cleanExpiredSessions();
    res.json({ success: true, message: 'Sessions cleaned' });
  } catch (err) {
    console.error('[Vercel Cron] Cleanup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🏛  Gram Panchayat WhatsApp Bot Backend`);
    console.log(`📡  Server running on http://localhost:${PORT}`);
    console.log(`🔗  Webhook: http://localhost:${PORT}/webhook/whatsapp`);
    console.log(`🛠️  Admin API: http://localhost:${PORT}/api`);
    console.log(`🌱  Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

module.exports = app;

