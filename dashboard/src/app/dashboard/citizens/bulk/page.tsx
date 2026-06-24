"use client";
import { useState, useRef, FormEvent } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface UploadResult { success: number; failed: number; errors: string[]; }

const SAMPLE_CSV = `full_name,mobile_number,aadhaar_number,date_of_birth,village,address
Priya Sharma,9123456789,456789012345,1992-08-20,Nandpur,Near School Road
Arjun Patel,8234567890,567890123456,1988-04-10,Kesarpur,Old Market Street
Meena Devi,7345678901,678901234567,1975-12-03,Rampur,Behind Post Office`;

export default function BulkUploadPage() {
  const [file,     setFile]     = useState<File | null>(null);
  const [uploading,setUploading]= useState(false);
  const [result,   setResult]   = useState<UploadResult | null>(null);
  const [preview,  setPreview]  = useState<string[][]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(f: File | null) {
    setFile(f);
    setResult(null);
    if (!f) { setPreview([]); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const rows = text.split("\n").filter(r => r.trim()).slice(0, 6);
      setPreview(rows.map(r => r.split(",").map(v => v.trim().replace(/^"|"$/g, ""))));
    };
    reader.readAsText(f);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "sample_citizens.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const token    = localStorage.getItem("gp_token");
      const formData = new FormData();
      formData.append("csv", file);
      const res  = await fetch(`${API}/api/citizens/bulk-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err: unknown) {
      setResult({ success: 0, failed: 0, errors: [err instanceof Error ? err.message : "Upload failed"] });
    } finally { setUploading(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📂 Bulk Upload Citizens</h1>
        <p className="page-subtitle">Import multiple citizens at once via CSV file</p>
      </div>

      <div className="grid-2">
        {/* Upload form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="card">
            <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "16px" }}>📋 CSV Format</h3>
            <div style={{ background: "#111827", borderRadius: "10px", padding: "14px", fontFamily: "monospace", fontSize: "0.75rem", color: "#86efac", lineHeight: 1.8, overflowX: "auto" }}>
              <div style={{ color: "#6b7280", marginBottom: "4px" }}># Required columns (in order):</div>
              <div>full_name, mobile_number, aadhaar_number,</div>
              <div>date_of_birth, village, address</div>
              <div style={{ color: "#6b7280", marginTop: "10px", marginBottom: "4px" }}># Example:</div>
              <div>Ramesh Kumar,9876543210,123456789012,</div>
              <div>1985-06-15,Rampur,Near Temple</div>
            </div>
            <button onClick={downloadSample} className="btn btn-secondary btn-sm" style={{ marginTop: "12px" }}>
              ⬇️ Download Sample CSV
            </button>
          </div>

          <div className="card">
            <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "16px" }}>📤 Upload CSV File</h3>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  border: "2px dashed #374151", borderRadius: "12px", padding: "36px",
                  textAlign: "center", cursor: "pointer",
                  background: file ? "rgba(34,197,94,0.06)" : "transparent",
                  borderColor: file ? "#22c55e" : "#374151", transition: "all 0.2s",
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#22c55e"; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = file ? "#22c55e" : "#374151"; }}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f?.name.endsWith(".csv")) handleFileChange(f);
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>{file ? "📊" : "📁"}</div>
                <div style={{ fontSize: "0.875rem", color: file ? "#22c55e" : "#6b7280" }}>
                  {file ? file.name : "Click or drag & drop a .csv file"}
                </div>
                {file && <div style={{ fontSize: "0.75rem", color: "#4b5563", marginTop: "4px" }}>{(file.size / 1024).toFixed(1)} KB</div>}
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={e => handleFileChange(e.target.files?.[0] || null)} />

              <div style={{ display: "flex", gap: "12px" }}>
                {file && <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleFileChange(null)}>✕ Clear</button>}
                <button type="submit" className="btn btn-primary" disabled={!file || uploading} style={{ flex: 1, justifyContent: "center" }}>
                  {uploading ? "Uploading..." : "🚀 Start Bulk Import"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Preview + Result */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {preview.length > 0 && (
            <div className="card">
              <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "14px" }}>👁 CSV Preview (first 5 rows)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ fontSize: "0.75rem" }}>
                  <thead>
                    <tr>{preview[0]?.map((h, i) => <th key={i} style={{ textTransform: "none", fontSize: "0.72rem" }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((row, i) => (
                      <tr key={i}>{row.map((cell, j) => (
                        <td key={j} style={{ color: "#9ca3af", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {j === 2 ? `XXXX XXXX ${cell.slice(-4)}` : cell}
                        </td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="card" style={{
              borderColor: result.failed === 0 ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)",
              background: result.failed === 0 ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)",
            }}>
              <h3 style={{ fontWeight: 700, color: "#f9fafb", marginBottom: "16px" }}>📊 Import Results</h3>
              <div style={{ display: "flex", gap: "24px", marginBottom: "16px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "#22c55e" }}>{result.success}</div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Imported</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", fontWeight: 800, color: "#f87171" }}>{result.failed}</div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Failed</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div style={{ background: "#111827", borderRadius: "8px", padding: "12px", maxHeight: "200px", overflowY: "auto" }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: "0.78rem", color: "#f87171", marginBottom: "4px" }}>⚠️ {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card card-sm" style={{ background: "rgba(59,130,246,0.06)", borderColor: "rgba(59,130,246,0.2)" }}>
            <h4 style={{ fontWeight: 600, color: "#60a5fa", marginBottom: "10px", fontSize: "0.875rem" }}>ℹ️ Notes</h4>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                "Duplicate mobile numbers are automatically skipped",
                "Aadhaar numbers are encrypted before storage",
                "Date of birth format: YYYY-MM-DD (e.g. 1985-06-15)",
                "Mobile must be 10-digit Indian number starting with 6-9",
                "Google Drive folders are auto-created for each citizen",
              ].map((n, i) => <li key={i} style={{ fontSize: "0.8rem", color: "#9ca3af" }}>• {n}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
