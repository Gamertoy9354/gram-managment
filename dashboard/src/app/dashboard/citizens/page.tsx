"use client";
import { useEffect, useState, useCallback, FormEvent } from "react";
import { fetchCitizens, createCitizen, updateCitizen, deleteCitizen, uploadDocument } from "@/lib/api";

interface Citizen {
  id: string; mobile_number: string; full_name: string; aadhaar_last4: string;
  date_of_birth: string; village: string; address: string; is_active: boolean; created_at: string;
}

function Toast({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="toast-container">
      <div className={`toast toast-${type}`}>
        <span>{type === "success" ? "✅" : "❌"}</span>
        <span style={{ flex: 1, fontSize: "0.875rem", color: "#d1d5db" }}>{msg}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "1rem" }}>×</button>
      </div>
    </div>
  );
}

const EMPTY_FORM = { mobile_number: "", full_name: "", aadhaar_number: "", date_of_birth: "", address: "", village: "" };

export default function CitizensPage() {
  const [citizens, setCitizens]   = useState<Citizen[]>([]);
  const [total,    setTotal]      = useState(0);
  const [page,     setPage]       = useState(1);
  const [search,   setSearch]     = useState("");
  const [loading,  setLoading]    = useState(true);
  const [modal,    setModal]      = useState<"add" | "edit" | null>(null);
  const [editId,   setEditId]     = useState<string | null>(null);
  const [form,     setForm]       = useState({ ...EMPTY_FORM });
  const [saving,   setSaving]     = useState(false);
  const [toast,    setToast]      = useState<{ msg: string; type: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [uploadModal, setUploadModal] = useState<Citizen | null>(null);
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  
  const LIMIT = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCitizens(page, LIMIT, search);
      setCitizens(data.citizens || []);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const notify = (msg: string, type = "success") => setToast({ msg, type });

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!uploadModal || !uploadFile) return;
    
    setSaving(true);
    try {
      await uploadDocument(uploadModal.mobile_number, uploadFile);
      notify("Document uploaded successfully!");
      setUploadModal(null);
      setUploadFile(null);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to upload document", "error");
    } finally {
      setSaving(false);
    }
  };

  function openAdd() { setForm({ ...EMPTY_FORM }); setEditId(null); setModal("add"); }
  function openEdit(c: Citizen) {
    setForm({ mobile_number: c.mobile_number, full_name: c.full_name, aadhaar_number: `XXXX XXXX ${c.aadhaar_last4}`, date_of_birth: c.date_of_birth, address: c.address || "", village: c.village || "" });
    setEditId(c.id);
    setModal("edit");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "add") {
        await createCitizen(form);
        notify("Citizen registered successfully!");
      } else if (editId) {
        await updateCitizen(editId, { full_name: form.full_name, date_of_birth: form.date_of_birth, address: form.address, village: form.village });
        notify("Citizen updated successfully!");
      }
      setModal(null);
      load();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed", "error");
    } finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    try {
      await deleteCitizen(id);
      notify("Citizen deactivated");
      setShowConfirm(null);
      load();
    } catch (err: unknown) { notify(err instanceof Error ? err.message : "Failed", "error"); }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">👥 Citizens</h1>
          <p className="page-subtitle">Manage registered citizens — {total} total</p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <a href="/dashboard/citizens/bulk" className="btn btn-secondary btn-sm">📂 Bulk Upload CSV</a>
          <button onClick={openAdd} className="btn btn-primary btn-sm">➕ Add Citizen</button>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ marginBottom: "20px" }}>
        <div className="search-bar" style={{ maxWidth: "400px" }}>
          <span className="search-icon">🔍</span>
          <input
            type="text" className="form-input" placeholder="Search name, mobile or village..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Citizen</th>
                <th>Mobile</th>
                <th>Aadhaar (Last 4)</th>
                <th>Date of Birth</th>
                <th>Village</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: "18px", borderRadius: "4px" }} /></td>
                    ))}
                  </tr>
                ))
              ) : citizens.length ? citizens.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: "#f9fafb" }}>{c.full_name}</div>
                    <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>ID: {c.id.slice(0, 8)}…</div>
                  </td>
                  <td><span style={{ fontFamily: "monospace", color: "#d1d5db" }}>{c.mobile_number}</span></td>
                  <td>
                    <span style={{ fontFamily: "monospace", color: "#9ca3af", letterSpacing: "0.08em" }}>
                      XXXX XXXX {c.aadhaar_last4}
                    </span>
                  </td>
                  <td style={{ color: "#d1d5db" }}>{c.date_of_birth ? new Date(c.date_of_birth).toLocaleDateString("en-IN") : "—"}</td>
                  <td style={{ color: "#d1d5db" }}>{c.village || "—"}</td>
                  <td>
                    <span className={`badge ${c.is_active ? "badge-success" : "badge-gray"}`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => setUploadModal(c)} className="btn btn-secondary btn-sm btn-icon" title="Upload Document">📄</button>
                      <button onClick={() => openEdit(c)} className="btn btn-secondary btn-sm btn-icon" title="Edit">✏️</button>
                      <button onClick={() => setShowConfirm(c.id)} className="btn btn-danger btn-sm btn-icon" title="Deactivate">🗑</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-icon">👤</div>
                      <h3>No citizens found</h3>
                      <p>Add a citizen or adjust your search filter</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination" style={{ padding: "16px" }}>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {[...Array(Math.min(totalPages, 5))].map((_, i) => {
              const p = i + 1;
              return <button key={p} className={`page-btn ${page === p ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>;
            })}
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f9fafb" }}>
                {modal === "add" ? "➕ Register New Citizen" : "✏️ Edit Citizen"}
              </h2>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "1.25rem", cursor: "pointer" }}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input className="form-input" placeholder="Ramesh Kumar Verma" value={form.full_name}
                      onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mobile Number *</label>
                    <input className="form-input" placeholder="9876543210" value={form.mobile_number}
                      onChange={e => setForm(f => ({ ...f, mobile_number: e.target.value }))}
                      required disabled={modal === "edit"} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Aadhaar Number *</label>
                    <input className="form-input" placeholder="1234 5678 9012" value={form.aadhaar_number}
                      onChange={e => setForm(f => ({ ...f, aadhaar_number: e.target.value }))}
                      required disabled={modal === "edit"} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date of Birth *</label>
                    <input type="date" className="form-input" value={form.date_of_birth}
                      onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} required />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Village</label>
                    <input className="form-input" placeholder="Rampur" value={form.village}
                      onChange={e => setForm(f => ({ ...f, village: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <input className="form-input" placeholder="Near Temple, Main Road" value={form.address}
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : modal === "add" ? "Register Citizen" : "Update Citizen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Deactivate ── */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(null)}>
          <div className="modal" style={{ maxWidth: "380px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f87171" }}>⚠️ Deactivate Citizen</h2>
              <button onClick={() => setShowConfirm(null)} style={{ background:"none", border:"none", color:"#6b7280", fontSize:"1.25rem", cursor:"pointer" }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: "#d1d5db", fontSize: "0.9rem" }}>
                This citizen will no longer be able to use the WhatsApp bot. You can reactivate them later.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeactivate(showConfirm)}>Deactivate</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Document Upload Modal ── */}
      {uploadModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setUploadModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f9fafb" }}>
                📄 Upload Document for {uploadModal.full_name}
              </h2>
              <button onClick={() => { setUploadModal(null); setUploadFile(null); }} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "1.25rem", cursor: "pointer" }}>×</button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="form-group">
                  <label className="form-label">Select PDF Document *</label>
                  <input 
                    type="file" 
                    className="form-input" 
                    accept="application/pdf"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    required 
                    style={{ padding: '8px' }}
                  />
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
                    Document must be in PDF format.
                  </p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setUploadModal(null); setUploadFile(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !uploadFile}>
                  {saving ? "Uploading..." : "Upload Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
