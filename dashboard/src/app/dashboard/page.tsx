"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchOverview, fetchDailyTrend, fetchPopularDocs } from "@/lib/api";

interface Overview {
  totalCitizens: number;
  documentsToday: number;
  documentsThisMonth: number;
  totalSuccess: number;
  totalFailed: number;
  activeSessions: number;
}
interface TrendDay { date: string; total: number; success: number; failed: number; }
interface PopDoc  { name: string; count: number; }

function StatCard({ icon, value, label, sub, color = "#22c55e" }: {
  icon: string; value: number | string; label: string; sub?: string; color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-change up">{sub}</div>}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ flex: 1, height: "8px", background: "#1f2937", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "4px", transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: "0.78rem", color: "#9ca3af", width: "32px", textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend,    setTrend]    = useState<TrendDay[]>([]);
  const [docs,     setDocs]     = useState<PopDoc[]>([]);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, t, d] = await Promise.all([fetchOverview(), fetchDailyTrend(14), fetchPopularDocs()]);
      setOverview(o);
      setTrend(t.trend || []);
      setDocs(d.documents || []);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Simple sparkline using CSS bars
  const maxTrend = Math.max(...trend.map(t => t.total), 1);

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <div className="skeleton" style={{ width: "220px", height: "32px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ width: "300px", height: "18px" }} />
        </div>
        <div className="grid-4" style={{ marginBottom: "24px" }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: "140px", borderRadius: "16px" }} />)}
        </div>
      </div>
    );
  }

  const successRate = overview
    ? overview.totalSuccess + overview.totalFailed > 0
      ? Math.round((overview.totalSuccess / (overview.totalSuccess + overview.totalFailed)) * 100)
      : 100
    : 0;

  const maxDoc = Math.max(...docs.map(d => d.count), 1);

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">📊 Dashboard Overview</h1>
          <p className="page-subtitle">Real-time WhatsApp bot performance & citizen statistics</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="wa-dot" />
          <span className="wa-indicator">Bot Active</span>
          <button onClick={load} className="btn btn-secondary btn-sm" style={{ marginLeft: "8px" }}>🔄 Refresh</button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid-4" style={{ marginBottom: "28px" }}>
        <StatCard icon="👥" value={overview?.totalCitizens ?? "—"} label="Registered Citizens" color="#60a5fa" />
        <StatCard icon="📄" value={overview?.documentsToday ?? "—"} label="Documents Today" color="#22c55e" />
        <StatCard icon="📅" value={overview?.documentsThisMonth ?? "—"} label="This Month" color="#a78bfa" />
        <StatCard icon="💬" value={overview?.activeSessions ?? "—"} label="Active Sessions" color="#fb923c" />
      </div>

      {/* ── Second row ── */}
      <div className="grid-3" style={{ marginBottom: "28px" }}>
        {/* Success rate */}
        <div className="card">
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#9ca3af", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            📈 Delivery Success Rate
          </h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "4px", padding: "12px 0" }}>
            <div style={{ fontSize: "3.5rem", fontWeight: 800, color: successRate > 80 ? "#22c55e" : "#f59e0b", lineHeight: 1 }}>
              {successRate}%
            </div>
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              {overview?.totalSuccess ?? 0} success / {overview?.totalFailed ?? 0} failed
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <div style={{ height: "8px", background: "#1f2937", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ width: `${successRate}%`, height: "100%", background: "linear-gradient(90deg, #16a34a, #22c55e)", borderRadius: "4px", transition: "width 0.8s ease" }} />
            </div>
          </div>
        </div>

        {/* 14-day trend sparkline */}
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#9ca3af", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            📉 14-Day Request Trend
          </h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "80px" }}>
            {trend.length ? trend.map((d, i) => {
              const h = maxTrend ? Math.max(4, Math.round((d.total / maxTrend) * 72)) : 4;
              return (
                <div key={i} title={`${d.date}: ${d.total} docs`} style={{
                  flex: 1, height: `${h}px`, borderRadius: "3px 3px 0 0",
                  background: `linear-gradient(180deg, #22c55e, #16a34a)`,
                  opacity: 0.7 + (i / trend.length) * 0.3,
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }} />
              );
            }) : (
              <div style={{ color: "#4b5563", fontSize: "0.875rem", margin: "auto" }}>No data yet</div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            <span style={{ fontSize: "0.7rem", color: "#4b5563" }}>{trend[0]?.date || "—"}</span>
            <span style={{ fontSize: "0.7rem", color: "#4b5563" }}>{trend[trend.length - 1]?.date || "—"}</span>
          </div>
        </div>
      </div>

      {/* ── Popular Documents + Recent Activity ── */}
      <div className="grid-2">
        {/* Popular documents */}
        <div className="card">
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#9ca3af", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🏆 Most Requested Documents
          </h3>
          {docs.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {docs.slice(0, 6).map((d, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px", fontSize: "0.8rem" }}>
                    <span style={{ color: "#d1d5db" }}>{i < 3 ? ["🥇","🥈","🥉"][i] : "📄"} {d.name}</span>
                  </div>
                  <MiniBar value={d.count} max={maxDoc} color={["#22c55e","#60a5fa","#a78bfa","#fb923c","#f472b6","#34d399"][i]} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <h3>No data yet</h3>
              <p style={{ fontSize: "0.8rem" }}>Documents will appear after citizens start using the bot</p>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="card">
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#9ca3af", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            ⚡ Quick Actions
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { href: "/dashboard/citizens", icon: "➕", label: "Add New Citizen", desc: "Register a citizen in the system", color: "#22c55e" },
              { href: "/dashboard/documents", icon: "📤", label: "Upload Documents", desc: "Upload PDFs to citizen folders", color: "#60a5fa" },
              { href: "/dashboard/audit", icon: "📋", label: "View Audit Logs", desc: "Check recent bot transactions", color: "#a78bfa" },
              { href: "/dashboard/blocked", icon: "🚫", label: "Manage Blocked Numbers", desc: "Unblock users if needed", color: "#fb923c" },
            ].map(a => (
              <a key={a.href} href={a.href} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px", background: "#111827", borderRadius: "12px", border: "1px solid #1f2937", textDecoration: "none", transition: "all 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = a.color)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1f2937")}>
                <span style={{ fontSize: "1.4rem" }}>{a.icon}</span>
                <div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f9fafb" }}>{a.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{a.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
