const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate }  = require('./auth');

router.use(authenticate);

// ─── GET /api/analytics/overview ─────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  const today      = new Date();
  const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [citizenCount, todayTxn, monthTxn, successTxn, failedTxn, activeSessions] = await Promise.all([
    supabaseAdmin.from('citizens').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin.from('transaction_logs').select('id', { count: 'exact', head: true }).gte('request_timestamp', todayStart),
    supabaseAdmin.from('transaction_logs').select('id', { count: 'exact', head: true }).gte('request_timestamp', monthStart),
    supabaseAdmin.from('transaction_logs').select('id', { count: 'exact', head: true }).eq('delivery_status', 'success'),
    supabaseAdmin.from('transaction_logs').select('id', { count: 'exact', head: true }).eq('delivery_status', 'failed'),
    supabaseAdmin.from('bot_sessions').select('id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString()),
  ]);

  res.json({
    totalCitizens:      citizenCount.count  || 0,
    documentsToday:     todayTxn.count      || 0,
    documentsThisMonth: monthTxn.count      || 0,
    totalSuccess:       successTxn.count    || 0,
    totalFailed:        failedTxn.count     || 0,
    activeSessions:     activeSessions.count || 0,
  });
});

// ─── GET /api/analytics/daily-trend ──────────────────────────────────────────
router.get('/daily-trend', async (req, res) => {
  const days = parseInt(req.query.days || '30', 10);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('transaction_logs')
    .select('request_timestamp, delivery_status')
    .gte('request_timestamp', from)
    .order('request_timestamp', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Group by date
  const byDate = {};
  (data || []).forEach(t => {
    const date = t.request_timestamp.slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, total: 0, success: 0, failed: 0 };
    byDate[date].total++;
    if (t.delivery_status === 'success') byDate[date].success++;
    if (t.delivery_status === 'failed')  byDate[date].failed++;
  });

  res.json({ trend: Object.values(byDate) });
});

// ─── GET /api/analytics/popular-documents ────────────────────────────────────
router.get('/popular-documents', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transaction_logs')
    .select('document_requested')
    .eq('delivery_status', 'success')
    .not('document_requested', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const counts = {};
  (data || []).forEach(t => {
    const doc = t.document_requested;
    counts[doc] = (counts[doc] || 0) + 1;
  });

  const sorted = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({ documents: sorted });
});

// ─── GET /api/analytics/transactions — audit log ─────────────────────────────
router.get('/transactions', async (req, res) => {
  const page   = parseInt(req.query.page   || '1', 10);
  const limit  = parseInt(req.query.limit  || '20', 10);
  const status = req.query.status;
  const from   = req.query.from;
  const to     = req.query.to;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('transaction_logs')
    .select(`
      id, whatsapp_number, document_requested, request_timestamp,
      delivery_status, failure_reason, session_id,
      citizens(full_name, mobile_number, village)
    `, { count: 'exact' })
    .order('request_timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('delivery_status', status);
  if (from)   query = query.gte('request_timestamp', from);
  if (to)     query = query.lte('request_timestamp', to);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ transactions: data, total: count, page, totalPages: Math.ceil(count / limit) });
});

// ─── GET /api/analytics/blocked-numbers ──────────────────────────────────────
router.get('/blocked-numbers', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('failed_attempts')
    .select('whatsapp_number, blocked_until, attempt_type, attempt_count')
    .not('blocked_until', 'is', null)
    .gt('blocked_until', new Date().toISOString())
    .order('blocked_until', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ blocked: data });
});

// ─── DELETE /api/analytics/blocked/:number — unblock ─────────────────────────
router.delete('/blocked/:number', async (req, res) => {
  const num = decodeURIComponent(req.params.number);
  await supabaseAdmin.from('failed_attempts').delete().eq('whatsapp_number', num);
  res.json({ message: `Unblocked ${num}` });
});

module.exports = router;
