"use client";
import { useState, FormEvent, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function DocumentsPage() {
  const [citizenId, setCitizenId] = useState("");
  const [file,      setFile]      = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast,     setToast]     = useState<{ msg: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || !citizenId) return notify("Please select a file and enter Citizen ID", "error");
    setUploading(true);
    try {
      const token    = localStorage.getItem("gp_token");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("citizenId", citizenId);
      const res = await fetch(`${API}/api/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      notify(`✅ Document uploaded: ${data.fileName}`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Upload failed", "error");
    } finally { setUploading(false); }
  }

  return (
    <div>
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            <span>{toast.type === "success" ? "✅" : "❌"}</span>
            <span style={{ flex: 1, fontSize: "0.875rem", color: "#d1d5db" }}>{toast.msg}</span>
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">📄 Documents</h1>
        <p className="page-subtitle">Upload official documents to citizen Google Drive folders</p>
      </div>

      <div className="grid-2">
        {/* Upload form */}
        <div className="card">
          <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "20px" }}>📤 Upload Document</h3>
          <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="form-group">
              <label className="form-label">Citizen Mobile Number or ID</label>
              <input className="form-input" placeholder="9876543210 or citizen-uuid"
                value={citizenId} onChange={e => setCitizenId(e.target.value)} required />
              <span style={{ fontSize: "0.72rem", color: "#4b5563" }}>Used as the folder name in Google Drive</span>
            </div>
            <div className="form-group">
              <label className="form-label">PDF Document</label>
              <div
                style={{
                  border: "2px dashed #374151", borderRadius: "12px", padding: "32px",
                  textAlign: "center", cursor: "pointer",
                  background: file ? "rgba(34,197,94,0.06)" : "transparent",
                  borderColor: file ? "#22c55e" : "#374151",
                  transition: "all 0.2s",
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#22c55e"; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = file ? "#22c55e" : "#374151"; }}
                onDrop={e => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files[0];
                  if (dropped?.type === "application/pdf") setFile(dropped);
                  else notify("Only PDF files are allowed", "error");
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>{file ? "📄" : "📁"}</div>
                <div style={{ fontSize: "0.875rem", color: file ? "#22c55e" : "#6b7280" }}>
                  {file ? file.name : "Click or drag & drop a PDF here"}
                </div>
                {file && <div style={{ fontSize: "0.75rem", color: "#4b5563", marginTop: "4px" }}>
                  {(file.size / 1024).toFixed(0)} KB
                </div>}
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }}
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={uploading || !file || !citizenId}>
              {uploading ? "Uploading..." : "📤 Upload to Google Drive"}
            </button>
          </form>
        </div>

        {/* Instructions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card" style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.2)" }}>
            <h3 style={{ fontWeight: 700, color: "#22c55e", marginBottom: "12px", fontSize: "0.95rem" }}>
              📁 Local Folder Structure
            </h3>
            <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "10px" }}>
              Documents are stored securely on the server&apos;s local disk.
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#9ca3af", lineHeight: "1.8" }}>
              <div>📁 backend/storage/documents/</div>
              <div style={{ paddingLeft: "20px" }}>📁 9876543210/ <span style={{ color: "#4b5563" }}>(mobile no.)</span></div>
              <div style={{ paddingLeft: "40px" }}>📄 Ration_Card.pdf</div>
              <div style={{ paddingLeft: "40px" }}>📄 Income_Certificate.pdf</div>
              <div style={{ paddingLeft: "20px" }}>📁 8765432109/</div>
              <div style={{ paddingLeft: "40px" }}>📄 Birth_Certificate.pdf</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "12px", fontSize: "0.95rem" }}>📋 Supported Document Types</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                "Ration_Card.pdf", "Income_Certificate.pdf", "Domicile_Certificate.pdf",
                "Birth_Certificate.pdf", "Caste_Certificate.pdf", "Death_Certificate.pdf",
              ].map(d => (
                <div key={d} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.825rem", color: "#9ca3af" }}>
                  <span style={{ color: "#22c55e" }}>✓</span> {d}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
