"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchOverview, fetchDailyTrend, fetchPopularDocs } from "@/lib/api";

interface TrendDay { date: string; total: number; success: number; failed: number; }
interface PopDoc   { name: string; count: number; }

const COLORS = ["#22c55e","#60a5fa","#a78bfa","#fb923c","#f472b6","#34d399","#fbbf24","#f87171"];

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [trend,    setTrend]    = useState<TrendDay[]>([]);
  const [docs,     setDocs]     = useState<PopDoc[]>([]);
  const [days,     setDays]     = useState(30);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, t, d] = await Promise.all([fetchOverview(), fetchDailyTrend(days), fetchPopularDocs()]);
      setOverview(o);
      setTrend(t.trend || []);
      setDocs(d.documents || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const maxTrend = Math.max(...trend.map(t => t.total), 1);
  const maxDoc   = Math.max(...docs.map(d => d.count), 1);
  const totalDocs = docs.reduce((s, d) => s + d.count, 0);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">📈 Analytics</h1>
          <p className="page-subtitle">Usage patterns and delivery performance</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`btn btn-sm ${days === d ? "btn-primary" : "btn-secondary"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid-4" style={{ marginBottom: "28px" }}>
        {[
          { label: "Total Citizens",     val: overview.totalCitizens ?? "—",    icon: "👥", color: "#60a5fa" },
          { label: "Delivered (Total)",  val: overview.totalSuccess  ?? "—",    icon: "✅", color: "#22c55e" },
          { label: "Failed (Total)",     val: overview.totalFailed   ?? "—",    icon: "❌", color: "#f87171" },
          { label: "Active Sessions",    val: overview.activeSessions ?? "—",   icon: "💬", color: "#fb923c" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Trend chart ── */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontWeight: 700, color: "#f9fafb" }}>📉 {days}-Day Request Volume</h3>
          {loading && <span className="badge badge-info animate-pulse">Loading…</span>}
        </div>

        {/* Chart */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "140px", padding: "0 4px" }}>
          {trend.length ? trend.map((d, i) => {
            const totalH   = maxTrend ? Math.max(4, Math.round((d.total   / maxTrend) * 130)) : 4;
            const successH = d.total  ? Math.round((d.success / d.total)  * totalH) : 0;
            const failedH  = totalH - successH;
            return (
              <div key={i} title={`${d.date}\nTotal: ${d.total}\nSuccess: ${d.success}\nFailed: ${d.failed}`}
                style={{ flex: 1, display: "flex", flexDirection: "column-reverse", cursor: "pointer" }}>
                <div style={{ height: `${successH}px`, background: "#16a34a", borderRadius: "3px 3px 0 0", transition: "height 0.5s ease" }} />
                {failedH > 0 && <div style={{ height: `${failedH}px`, background: "#dc2626", opacity: 0.8 }} />}
              </div>
            );
          }) : (
            <div style={{ margin: "auto", color: "#4b5563", fontSize: "0.875rem" }}>No data for this period</div>
          )}
        </div>

        <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#9ca3af" }}>
            <span style={{ width: "12px", height: "12px", background: "#16a34a", borderRadius: "2px", display: "inline-block" }} /> Success
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#9ca3af" }}>
            <span style={{ width: "12px", height: "12px", background: "#dc2626", borderRadius: "2px", display: "inline-block" }} /> Failed
          </span>
        </div>
      </div>

      {/* ── Documents + Donut ── */}
      <div className="grid-2">
        {/* Bar chart */}
        <div className="card">
          <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "20px" }}>🏆 Document Requests ({totalDocs} total)</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {docs.length ? docs.map((d, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{ fontSize: "0.875rem", color: "#d1d5db", fontWeight: 500 }}>{d.name}</span>
                  <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{d.count} ({totalDocs ? Math.round(d.count / totalDocs * 100) : 0}%)</span>
                </div>
                <div style={{ height: "8px", background: "#111827", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${totalDocs ? (d.count / maxDoc) * 100 : 0}%`, height: "100%", background: COLORS[i % COLORS.length], borderRadius: "4px", transition: "width 0.7s ease" }} />
                </div>
              </div>
            )) : <div className="empty-state" style={{ padding: "24px" }}><div className="empty-icon">📄</div><h3>No data yet</h3></div>}
          </div>
        </div>

        {/* Success/failure pie alternative — ring chart using CSS */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "20px" }}>📊 Performance Summary</h3>
          {(() => {
            const total = (overview.totalSuccess || 0) + (overview.totalFailed || 0);
            const rate  = total ? Math.round((overview.totalSuccess || 0) / total * 100) : 0;
            const circumference = 2 * Math.PI * 54;
            const successDash = (rate / 100) * circumference;
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", flex: 1, justifyContent: "center" }}>
                <div style={{ position: "relative" }}>
                  <svg width="140" height="140" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#1f2937" strokeWidth="12" />
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#22c55e" strokeWidth="12"
                      strokeDasharray={`${successDash} ${circumference}`} strokeLinecap="round"
                      transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray 1s ease" }} />
                    {(overview.totalFailed || 0) > 0 && (
                      <circle cx="60" cy="60" r="54" fill="none" stroke="#ef4444" strokeWidth="12"
                        strokeDasharray={`${circumference - successDash} ${circumference}`}
                        strokeDashoffset={-successDash} strokeLinecap="round"
                        transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray 1s ease" }} />
                    )}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f9fafb" }}>{rate}%</span>
                    <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>success</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "24px" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>{overview.totalSuccess || 0}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Successful</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f87171" }}>{overview.totalFailed || 0}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Failed</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
