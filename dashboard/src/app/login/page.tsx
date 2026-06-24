"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("gp_token", data.token);
      localStorage.setItem("gp_admin", JSON.stringify(data.admin));
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #FFF7ED 0%, #FAF9F6 40%, #ECFCE8 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* ── Decorative background blobs ── */}
      <div style={{ position:"absolute", top:"-100px", right:"-100px", width:"380px", height:"380px", borderRadius:"50%", background:"radial-gradient(circle, rgba(255,153,51,0.15), transparent)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:"-60px", left:"-60px", width:"280px", height:"280px", borderRadius:"50%", background:"radial-gradient(circle, rgba(19,136,8,0.12), transparent)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", top:"40%", left:"8%", width:"160px", height:"160px", borderRadius:"50%", background:"radial-gradient(circle, rgba(26,95,180,0.07), transparent)", pointerEvents:"none" }} />

      {/* ── Tricolour top bar ── */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: "5px",
        background: "linear-gradient(90deg, #FF9933 0%, #FF9933 33.3%, #FFFFFF 33.3%, #FFFFFF 66.6%, #138808 66.6%, #138808 100%)",
      }} />

      <div style={{ width:"100%", maxWidth:"440px" }}>
        {/* ── Logo ── */}
        <div style={{ textAlign:"center", marginBottom:"36px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "72px", height: "72px",
            borderRadius: "20px",
            background: "linear-gradient(135deg, #FF9933 0%, #E8821A 100%)",
            fontSize: "2.2rem",
            marginBottom: "16px",
            boxShadow: "0 8px 24px rgba(255,153,51,0.35)",
          }}>
            🏛️
          </div>
          <h1 style={{ fontSize:"1.7rem", fontWeight:800, color:"#1F2937", lineHeight:1.2 }}>
            Gram Panchayat
          </h1>
          <p style={{ color:"#138808", fontWeight:700, marginTop:"4px", fontSize:"0.9rem", letterSpacing:"0.02em" }}>
            Digital Services Platform
          </p>
          <div style={{
            display: "inline-flex", alignItems:"center", gap:"6px",
            background: "linear-gradient(90deg, rgba(255,153,51,0.12), rgba(19,136,8,0.1))",
            border: "1px solid rgba(255,153,51,0.2)",
            borderRadius: "99px",
            padding: "3px 12px",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#374151",
            marginTop: "10px",
          }}>
            🇮🇳 Admin Dashboard
          </div>
        </div>

        {/* ── Login Card ── */}
        <div style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        }}>
          {/* Card header accent */}
          <div style={{
            height: "3px",
            borderRadius: "2px",
            background: "linear-gradient(90deg, #FF9933, #138808)",
            marginBottom: "24px",
          }} />

          <h2 style={{ fontSize:"1.15rem", fontWeight:700, marginBottom:"22px", color:"#1F2937" }}>
            Sign in to your account
          </h2>

          {error && (
            <div style={{
              background:"#FEE2E2",
              border:"1px solid rgba(220,38,38,0.3)",
              borderRadius:"10px",
              padding:"12px 14px",
              marginBottom:"20px",
              color:"#DC2626",
              fontSize:"0.875rem",
              display:"flex",
              alignItems:"center",
              gap:"8px",
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"18px" }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email"
                className="form-input"
                placeholder="admin@panchayat.gov.in"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width:"100%", justifyContent:"center", padding:"13px 20px", fontSize:"0.95rem", marginTop:"4px" }}
            >
              {loading ? "⏳ Signing in..." : "Sign In →"}
            </button>
          </form>

          <div style={{
            marginTop:"22px",
            padding:"13px 14px",
            background:"#ECFCE8",
            borderRadius:"10px",
            border:"1px solid rgba(19,136,8,0.2)",
          }}>
            <p style={{ fontSize:"0.78rem", color:"#138808", fontWeight:700, marginBottom:"4px" }}>
              🛠 First time? Create admin account:
            </p>
            <code style={{ fontSize:"0.72rem", color:"#6B7280", wordBreak:"break-all" }}>
              POST /api/auth/setup {"{ email, password, fullName }"}
            </code>
          </div>
        </div>

        <p style={{ textAlign:"center", color:"#9CA3AF", fontSize:"0.75rem", marginTop:"20px" }}>
          Powered by <strong style={{ color:"#E8821A" }}>Flowlytix.in</strong> — Digital Bharat Initiative v2.0
        </p>
      </div>
    </div>
  );
}
