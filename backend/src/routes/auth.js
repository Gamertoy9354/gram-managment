const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { body, validationResult } = require('express-validator');

const JWT_SECRET  = process.env.JWT_SECRET || 'gp-dev-secret';
const JWT_EXPIRES = '8h';

// Middleware: verify JWT
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: require role
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login',
  async (req, res) => {
    const { email, password } = req.body;
    console.log(`[Auth] Login attempt: ${email}`);

    // Simplify the query: first check by email
    let { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .eq('email', email.toLowerCase())
      .limit(1)
      .single();

    // If not found by email, try by username
    if (!admin || error) {
      const { data: adminByUsername, error: usernameError } = await supabaseAdmin
        .from('admin_users')
        .select('*')
        .eq('username', email.toLowerCase())
        .limit(1)
        .single();
      
      admin = adminByUsername;
      if (usernameError && !admin) {
        console.log(`[Auth] No user found with email or username: ${email}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    if (!admin.is_active) {
      console.log(`[Auth] User is inactive: ${email}`);
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      console.log(`[Auth] Password mismatch for: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[Auth] Login successful: ${email}`);
    // Update last login
    await supabaseAdmin.from('admin_users').update({ last_login: new Date().toISOString() }).eq('id', admin.id);

    const adminName  = admin.full_name || admin.username || 'Admin';
    const adminRole  = admin.role      || 'operator';
    const adminEmail = admin.email     || admin.username;

    const token = jwt.sign(
      { id: admin.id, email: adminEmail, role: adminRole, name: adminName },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({ token, admin: { id: admin.id, email: adminEmail, role: adminRole, name: adminName } });
  }
);

// ─── POST /api/auth/setup (create first super admin) ─────────────────────────
router.post('/setup', async (req, res) => {
  // Only allow if no admin users exist
  const { count } = await supabaseAdmin.from('admin_users').select('id', { count: 'exact', head: true });
  if (count > 0) return res.status(403).json({ error: 'Admin already exists. Use login.' });

  const { email, password, fullName } = req.body;
  if (!email || !password || !fullName) return res.status(400).json({ error: 'Missing fields' });

  const hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabaseAdmin.from('admin_users').insert({
    email: email.toLowerCase(),
    password_hash: hash,
    full_name: fullName,
    role: 'super_admin',
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Super admin created', adminId: data.id });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = { router, authenticate, requireRole };
