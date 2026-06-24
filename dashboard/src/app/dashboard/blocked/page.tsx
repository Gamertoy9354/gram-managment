"use client";
import { useEffect, useState, useCallback } from "react";
import { fetchBlocked, unblockNumber } from "@/lib/api";

interface BlockedEntry {
  whatsapp_number: string; blocked_until: string;
  attempt_type: string; attempt_count: number;
}

export default function BlockedPage() {
  const [blocked, setBlocked]  = useState<BlockedEntry[]>([]);
  const [loading, setLoading]  = useState(true);
  const [toast,   setToast]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await fetchBlocked(); setBlocked(d.blocked || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  async function handleUnblock(number: string) {
    try {
      await unblockNumber(number);
      setToast(`✅ Unblocked ${number}`);
      load();
    } catch (e) { console.error(e); }
  }

  function timeLeft(until: string) {
    const mins = Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
    return `${mins} min${mins !== 1 ? "s" : ""}`;
  }

  return (
    <div>
      {toast && (
        <div className="toast-container">
          <div className="toast toast-success"><span>{toast}</span></div>
        </div>
      )}

      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">🚫 Blocked Numbers</h1>
          <p className="page-subtitle">Numbers temporarily blocked due to failed verification attempts</p>
        </div>
        <button onClick={load} className="btn btn-secondary btn-sm">🔄 Refresh</button>
      </div>

      {/* Info card */}
      <div className="card card-sm" style={{ marginBottom: "20px", background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)" }}>
        <p style={{ fontSize: "0.875rem", color: "#fbbf24" }}>
          ⚠️ Numbers are automatically blocked for <strong>30 minutes</strong> after {" "}
          <strong>3 failed verification attempts</strong>. They unblock automatically, or you can manually unblock them below.
        </p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>WhatsApp Number</th>
                <th>Failed Step</th>
                <th>Attempt Count</th>
                <th>Blocked Until</th>
                <th>Time Remaining</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: "18px" }} /></td>)}</tr>
                ))
              ) : blocked.length ? blocked.map((b, i) => (
                <tr key={i}>
                  <td>
                    <span style={{ fontFamily: "monospace", color: "#f87171", fontWeight: 600 }}>
                      {b.whatsapp_number.replace("whatsapp:", "")}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-warning">{b.attempt_type}</span>
                  </td>
                  <td style={{ color: "#fbbf24", fontWeight: 600 }}>{b.attempt_count}× failed</td>
                  <td style={{ fontSize: "0.8rem", color: "#d1d5db" }}>
                    {new Date(b.blocked_until).toLocaleString("en-IN")}
                  </td>
                  <td>
                    <span style={{ color: "#fbbf24", fontSize: "0.875rem", fontWeight: 600 }}>
                      ⏱ {timeLeft(b.blocked_until)}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => handleUnblock(b.whatsapp_number)} className="btn btn-primary btn-sm">
                      🔓 Unblock
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-icon">✅</div>
                      <h3>No blocked numbers</h3>
                      <p>All citizens can currently access the bot</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
