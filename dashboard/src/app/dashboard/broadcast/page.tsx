"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { fetchCitizens, uploadBroadcastImage, sendBulkMessage, importBroadcastRecipients, fetchTemplates, createTemplate, deleteTemplate } from "@/lib/api";

interface Citizen {
  id: string;
  full_name: string;
  mobile_number: string;
  village: string | null;
}

export default function BroadcastPage() {
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [audienceType, setAudienceType] = useState<"all" | "selected" | "imported">("all");

  const [importedContacts, setImportedContacts] = useState<Array<{ name: string; mobile: string }>>([]);
  const [importingContacts, setImportingContacts] = useState(false);

  const [message, setMessage] = useState("Namaskar {name},\n\nThis is an official announcement from your Gram Panchayat. Please review the attachments or details below.\n\nDhanyawad!");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [loadingCitizens, setLoadingCitizens] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [reportDetails, setReportDetails] = useState<any[]>([]);

  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  
  // Custom WhatsApp Templates States
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [templateValues, setTemplateValues] = useState<string[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [submittingTemplate, setSubmittingTemplate] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contactsFileInputRef = useRef<HTMLInputElement>(null);

  // Load WhatsApp Templates
  const loadTemplatesList = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetchTemplates();
      setTemplates(res.templates || []);
    } catch (err) {
      console.error("Failed to load templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    loadTemplatesList();
  }, [loadTemplatesList]);

  // Poll for updates if any template is pending
  useEffect(() => {
    const hasPending = templates.some(t => t.status === "pending");
    if (hasPending) {
      const interval = setInterval(async () => {
        try {
          const res = await fetchTemplates();
          setTemplates(res.templates || []);
        } catch (err) {
          console.error("Templates polling error:", err);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [templates]);

  const getTemplateVariablesCount = (body: string) => {
    const matches = body.match(/\{\{(\d+)\}\}/g);
    if (!matches) return 0;
    const nums = matches.map(m => parseInt(m.replace(/[^0-9]/g, ""), 10));
    return Math.max(...nums, 0);
  };

  const handleTemplateChange = (templateName: string) => {
    setSelectedTemplateName(templateName);
    const selected = templates.find(t => t.name === templateName);
    if (selected) {
      const varCount = getTemplateVariablesCount(selected.body);
      const initialValues = Array(varCount).fill("");
      if (varCount >= 1) {
        initialValues[0] = "{name}"; // default var 1 to citizen name
      }
      setTemplateValues(initialValues);
    } else {
      setTemplateValues([]);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !newTemplateBody.trim()) {
      showToast("error", "Template name and body content are required.");
      return;
    }

    setSubmittingTemplate(true);
    showToast("info", "Submitting WhatsApp template for verification...");
    try {
      await createTemplate(
        newTemplateName,
        newTemplateTitle || newTemplateName,
        newTemplateBody,
        "broadcast"
      );
      showToast("success", "Template submitted! Meta verification in progress...");
      setNewTemplateName("");
      setNewTemplateTitle("");
      setNewTemplateBody("");
      setShowTemplateModal(false);
      loadTemplatesList();
    } catch (err: any) {
      console.error(err);
      showToast("error", err.message || "Failed to submit template.");
    } finally {
      setSubmittingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (name: string) => {
    if (!confirm(`Are you sure you want to delete template '${name}'?`)) return;
    try {
      await deleteTemplate(name);
      showToast("success", "Template deleted successfully.");
      loadTemplatesList();
      if (selectedTemplateName === name) {
        setSelectedTemplateName("");
        setTemplateValues([]);
      }
    } catch (err: any) {
      console.error(err);
      showToast("error", err.message || "Failed to delete template.");
    }
  };

  // Load active citizens for selector list
  const loadCitizensList = useCallback(async () => {
    setLoadingCitizens(true);
    try {
      // Fetch a large range to allow comprehensive selection
      const res = await fetchCitizens(1, 500, "");
      setCitizens(res.citizens || []);
    } catch (err) {
      console.error("Failed to load citizens:", err);
      showToast("error", "Failed to load citizens list.");
    } finally {
      setLoadingCitizens(false);
    }
  }, []);

  useEffect(() => {
    loadCitizensList();
  }, [loadCitizensList]);

  // Handle toast timers
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (type: "success" | "error" | "info", text: string) => {
    setToast({ type, text });
  };

  // Insert {name} tag at current cursor index
  const insertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    const textBefore = value.substring(0, start);
    const textAfter = value.substring(end, value.length);

    const newValue = textBefore + "{name}" + textAfter;
    setMessage(newValue);

    // Set cursor position right after the inserted tag
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 6, start + 6);
    }, 50);
  };

  // Handle image upload to Supabase Storage
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("error", "Please select a valid image file (JPG/PNG).");
      return;
    }

    setImageFile(file);
    setUploadingImage(true);
    showToast("info", "Uploading image to secure storage...");

    try {
      const res = await uploadBroadcastImage(file);
      setImageUrl(res.imageUrl);
      showToast("success", "Image uploaded successfully!");
    } catch (err: any) {
      console.error("Upload failure:", err);
      showToast("error", err.message || "Failed to upload image.");
      setImageFile(null);
      setImageUrl(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("info", "Image attachment removed.");
  };

  // Handle contacts sheet import
  async function handleContactsFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingContacts(true);
    showToast("info", "Uploading and parsing contacts sheet... Please wait");
    try {
      const res = await importBroadcastRecipients(file);
      setImportedContacts(res.contacts || []);
      showToast("success", res.message || "Spreadsheet contacts imported successfully!");
    } catch (err: any) {
      console.error(err);
      showToast("error", err.message || "Failed to parse contacts spreadsheet.");
    } finally {
      setImportingContacts(false);
      if (contactsFileInputRef.current) contactsFileInputRef.current.value = "";
    }
  }

  // Selection managers
  const handleSelectToggle = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = (filteredList: Citizen[]) => {
    const filteredIds = filteredList.map(c => c.id);
    const allSelected = filteredIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      // Uncheck all filtered
      setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      // Check all filtered (merge)
      setSelectedIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  // Submit bulk message to Twilio
  const triggerSend = async () => {
    if (!useTemplate && !message.trim()) {
      showToast("error", "Message content cannot be empty.");
      return;
    }
    if (useTemplate && !selectedTemplateName) {
      showToast("error", "Please select a template to send.");
      return;
    }

    let recipientsParam: any = "all";
    let recipientCount = 0;

    if (audienceType === "all") {
      recipientsParam = "all";
      recipientCount = citizens.length;
    } else if (audienceType === "selected") {
      if (selectedIds.length === 0) {
        showToast("error", "Please select at least one recipient.");
        return;
      }
      recipientsParam = selectedIds;
      recipientCount = selectedIds.length;
    } else if (audienceType === "imported") {
      if (importedContacts.length === 0) {
        showToast("error", "Please import at least one contact from Excel first.");
        return;
      }
      recipientsParam = { type: "imported", contacts: importedContacts };
      recipientCount = importedContacts.length;
    }

    setSending(true);
    setProgress({ current: 0, total: recipientCount, success: 0, failed: 0 });
    setReportDetails([]);
    showToast("info", `Initiating bulk broadcast to ${recipientCount} citizens...`);

    try {
      const res = await sendBulkMessage(
        useTemplate ? null : message,
        recipientsParam,
        imageUrl || undefined,
        useTemplate ? selectedTemplateName : undefined,
        useTemplate ? templateValues : undefined
      );
      
      const report = res.report || { success: 0, failed: 0, details: [] };
      setProgress({
        current: report.total || recipientCount,
        total: report.total || recipientCount,
        success: report.success || 0,
        failed: report.failed || 0
      });
      setReportDetails(report.details || []);

      if (report.failed > 0) {
        showToast("info", `Broadcast finished. Success: ${report.success}, Failed: ${report.failed}`);
      } else {
        showToast("success", `Successfully broadcasted to all ${report.success} citizens!`);
      }
    } catch (err: any) {
      console.error("Broadcast failed:", err);
      showToast("error", err.message || "Failed to deliver broadcast.");
    } finally {
      setSending(false);
    }
  };

  // Recipient search filtering
  const filteredCitizens = citizens.filter(c => {
    const q = search.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.mobile_number.includes(q) ||
      (c.village && c.village.toLowerCase().includes(q))
    );
  });

  const getLivePreview = () => {
    if (useTemplate) {
      const selected = templates.find(t => t.name === selectedTemplateName);
      if (!selected) return "Select a template to preview";
      let previewText = selected.body;
      templateValues.forEach((val, idx) => {
        let displayVal = val || `[Variable ${idx + 1}]`;
        if (displayVal === "{name}" || displayVal === "{{name}}") {
          displayVal = "Ramesh Kumar Verma";
        }
        previewText = previewText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), displayVal);
      });
      return previewText;
    }
    return message
      .replace(/{name}/gi, "Ramesh Kumar Verma")
      .replace(/{{name}}/gi, "Ramesh Kumar Verma");
  };

  const livePreviewMessage = getLivePreview();

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* ── Page Header ── */}
      <div className="page-header">
        <h1 className="page-title">📢 Circular Bulk Broadcast</h1>
        <p className="page-subtitle">Circulate dynamic WhatsApp circulars, emergency announcements, or notifications to all citizens instantly.</p>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            <span>
              {toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "ℹ️"}
            </span>
            <span style={{ fontWeight: 500 }}>{toast.text}</span>
          </div>
        </div>
      )}

      {/* ── Main Two-Column Layout ── */}
      <div className="grid-3" style={{ gridTemplateColumns: "1.7fr 1.3fr", gap: "28px" }}>
        
        {/* Left Column: composer and audience selectors */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Card 1: message compose */}
          <div className="card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px", color: "var(--text-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>✍️ Message Composer</span>
              <button 
                type="button" 
                onClick={() => setShowTemplateManager(true)}
                className="btn btn-secondary btn-sm" 
                style={{ fontSize: "0.72rem", padding: "4px 10px" }}
              >
                ⚙️ Templates Console
              </button>
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Toggle modes */}
              <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
                <button 
                  type="button"
                  className={`btn btn-sm ${!useTemplate ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setUseTemplate(false)}
                  style={{ flex: 1, fontSize: "0.8rem", padding: "8px" }}
                >
                  💬 Raw Text Broadcast
                </button>
                <button 
                  type="button"
                  className={`btn btn-sm ${useTemplate ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setUseTemplate(true);
                    const approved = templates.filter(t => t.status === "approved" && t.type === "broadcast");
                    if (approved.length > 0 && !selectedTemplateName) {
                      handleTemplateChange(approved[0].name);
                    }
                  }}
                  style={{ flex: 1, fontSize: "0.8rem", padding: "8px" }}
                >
                  📋 WhatsApp Template
                </button>
              </div>

              {!useTemplate ? (
                <>
                  {/* Personalization tool helper */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#111827", borderRadius: "8px", border: "1px dashed var(--border)" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      💡 Use personalization tags to address citizens by their full names dynamically.
                    </span>
                    <button type="button" onClick={insertTag} className="btn btn-secondary btn-sm" style={{ border: "1px solid var(--border-light)", fontSize: "0.75rem", padding: "4px 8px" }}>
                      👤 Insert Name Tag
                    </button>
                  </div>

                  {/* Message text textarea */}
                  <div className="form-group">
                    <label className="form-label">Message Body</label>
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your circular message here..."
                      style={{
                        background: "var(--gray-900)",
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        padding: "12px",
                        color: "var(--text-primary)",
                        fontSize: "0.875rem",
                        minHeight: "180px",
                        resize: "vertical",
                        outline: "none",
                        fontFamily: "inherit",
                        lineHeight: 1.5
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Choose WhatsApp Template */}
                  <div className="form-group">
                    <label className="form-label">Choose WhatsApp Template</label>
                    <select
                      className="form-input"
                      value={selectedTemplateName}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      style={{
                        background: "var(--gray-900)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        padding: "10px",
                        width: "100%",
                        outline: "none"
                      }}
                    >
                      <option value="">-- Choose Template --</option>
                      {templates
                        .filter(t => t.status === "approved" && t.type === "broadcast")
                        .map(t => (
                          <option key={t.name} value={t.name}>{t.title} ({t.name})</option>
                        ))
                      }
                    </select>
                    {templates.filter(t => t.status === "approved" && t.type === "broadcast").length === 0 && (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                        ⚠️ No approved templates found. Go to Templates Console to create one.
                      </span>
                    )}
                  </div>

                  {/* Template parameters mappings */}
                  {selectedTemplateName && templateValues.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px", background: "rgba(31,41,55,0.2)" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-light)" }}>📊 Template Variables Mapping</span>
                      
                      {templateValues.map((val, idx) => {
                        const isVar1 = idx === 0;
                        return (
                          <div key={idx} className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontSize: "0.75rem", marginBottom: "4px" }}>
                              Variable {idx + 1} (replacing {"{{"}{idx + 1}{"}}"})
                            </label>
                            <div style={{ display: "flex", gap: "8px" }}>
                              {isVar1 ? (
                                <select
                                  className="form-input"
                                  value={val === "{name}" ? "citizen_name" : "custom"}
                                  onChange={(e) => {
                                    const newVals = [...templateValues];
                                    newVals[idx] = e.target.value === "citizen_name" ? "{name}" : "";
                                    setTemplateValues(newVals);
                                  }}
                                  style={{ flex: "0 0 140px", fontSize: "0.8rem" }}
                                >
                                  <option value="citizen_name">👤 Citizen Name</option>
                                  <option value="custom">✍️ Custom Value</option>
                                </select>
                              ) : null}
                              
                              {(!isVar1 || val !== "{name}") && (
                                <input
                                  type="text"
                                  className="form-input"
                                  placeholder={`Enter value for {{${idx + 1}}}`}
                                  value={val}
                                  onChange={(e) => {
                                    const newVals = [...templateValues];
                                    newVals[idx] = e.target.value;
                                    setTemplateValues(newVals);
                                  }}
                                  style={{ flex: 1, fontSize: "0.8rem" }}
                                />
                              )}
                              
                              {isVar1 && val === "{name}" && (
                                <input
                                  type="text"
                                  className="form-input"
                                  value="[Citizen Name dynamically injected]"
                                  disabled
                                  style={{ flex: 1, fontSize: "0.8rem", opacity: 0.7, background: "var(--gray-900)" }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* Image upload attachment */}
              <div className="form-group">
                <label className="form-label">Attach Image (Optional)</label>
                {!imageUrl ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: "2px dashed var(--border)",
                      borderRadius: "12px",
                      padding: "24px",
                      textAlign: "center",
                      background: "rgba(31,41,55,0.4)",
                      cursor: "pointer",
                      transition: "border-color 0.2s, background 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                  >
                    {uploadingImage ? (
                      <div>
                        <div style={{ fontSize: "1.8rem", animation: "pulse 1.5s infinite" }}>⏳</div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent)", marginTop: "8px" }}>Uploading to secure cloud storage...</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: "2rem" }}>🖼️</div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginTop: "6px" }}>Click to select an image</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>PNG, JPG or JPEG (Max 10MB)</div>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageChange} 
                      accept="image/*" 
                      style={{ display: "none" }} 
                    />
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px", background: "#111827", borderRadius: "12px", border: "1px solid var(--border)" }}>
                    <img 
                      src={imageUrl} 
                      alt="attachment preview" 
                      style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--border)" }} 
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f9fafb" }}>{imageFile?.name || "Broadcast Circular Attachment"}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 500, marginTop: "2px" }}>✓ Cloud storage URL ready</div>
                    </div>
                    <button type="button" onClick={removeImage} className="btn btn-danger btn-sm" style={{ padding: "6px 10px" }}>
                      🗑 Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Audience target selector */}
          <div className="card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
              🎯 Target Recipients
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Radio selectors */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div 
                  onClick={() => setAudienceType("all")}
                  style={{
                    flex: "1 1 200px", padding: "14px", borderRadius: "12px", border: `1px solid ${audienceType === "all" ? "var(--accent)" : "var(--border)"}`,
                    background: audienceType === "all" ? "rgba(34,197,94,0.06)" : "var(--bg-secondary)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", transition: "all 0.15s"
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>👥</span>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: audienceType === "all" ? "var(--accent-light)" : "var(--text-primary)" }}>All Active Citizens</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Send to all ({citizens.length}) registered citizens</div>
                  </div>
                </div>

                <div 
                  onClick={() => setAudienceType("selected")}
                  style={{
                    flex: "1 1 200px", padding: "14px", borderRadius: "12px", border: `1px solid ${audienceType === "selected" ? "var(--accent)" : "var(--border)"}`,
                    background: audienceType === "selected" ? "rgba(34,197,94,0.06)" : "var(--bg-secondary)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", transition: "all 0.15s"
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>✅</span>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: audienceType === "selected" ? "var(--accent-light)" : "var(--text-primary)" }}>Select Citizens</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>({selectedIds.length}) selected recipients</div>
                  </div>
                </div>

                <div 
                  onClick={() => setAudienceType("imported")}
                  style={{
                    flex: "1 1 200px", padding: "14px", borderRadius: "12px", border: `1px solid ${audienceType === "imported" ? "var(--accent)" : "var(--border)"}`,
                    background: audienceType === "imported" ? "rgba(34,197,94,0.06)" : "var(--bg-secondary)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", transition: "all 0.15s"
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>📊</span>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: audienceType === "imported" ? "var(--accent-light)" : "var(--text-primary)" }}>Import Excel</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>({importedContacts.length}) imported contacts</div>
                  </div>
                </div>
              </div>

              {/* Excel import upload zone */}
              {audienceType === "imported" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", background: "var(--bg-secondary)" }}>
                  <input 
                    type="file" 
                    ref={contactsFileInputRef} 
                    onChange={handleContactsFileChange} 
                    accept=".xlsx, .xls" 
                    style={{ display: "none" }} 
                  />
                  
                  {importedContacts.length === 0 ? (
                    <div 
                      onClick={() => contactsFileInputRef.current?.click()}
                      style={{
                        border: "2px dashed var(--border)",
                        borderRadius: "12px",
                        padding: "24px",
                        textAlign: "center",
                        background: "rgba(31,41,55,0.4)",
                        cursor: "pointer",
                        transition: "border-color 0.2s, background 0.2s"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                    >
                      {importingContacts ? (
                        <div>
                          <div style={{ fontSize: "1.8rem", animation: "pulse 1.5s infinite" }}>⏳</div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent)", marginTop: "8px" }}>Parsing contacts spreadsheet...</div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: "2rem" }}>📊</div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginTop: "6px" }}>Click to import contacts Excel</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>Must contain columns: sr. No. | Name | Mobile No.</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px", background: "#111827", borderRadius: "12px", border: "1px solid var(--border)" }}>
                        <span style={{ fontSize: "2rem" }}>📊</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#f9fafb" }}>Imported Recipients Sheet</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 500, marginTop: "2px" }}>✓ Loaded {importedContacts.length} contacts successfully</div>
                        </div>
                        <button type="button" onClick={() => setImportedContacts([])} className="btn btn-danger btn-sm" style={{ padding: "6px 10px" }}>
                          🗑 Clear
                        </button>
                      </div>

                      {/* Mini contacts checklist preview */}
                      <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-card)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={{ padding: "6px 10px", fontSize: "0.68rem", textAlign: "left" }}>Name</th>
                              <th style={{ padding: "6px 10px", fontSize: "0.68rem", textAlign: "left" }}>Mobile</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importedContacts.map((c, idx) => (
                              <tr key={idx} style={{ borderBottom: "1px solid var(--border-light)" }}>
                                <td style={{ padding: "6px 10px", fontSize: "0.75rem", fontWeight: 600 }}>{c.name}</td>
                                <td style={{ padding: "6px 10px", fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>+91 {c.mobile}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Checkable Filtered Citizens List */}
              {audienceType === "selected" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", background: "var(--bg-secondary)" }}>
                  
                  {/* Search input */}
                  <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search by citizen name, mobile or village..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  {/* Checklist wrapper */}
                  <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-card)" }}>
                    {loadingCitizens ? (
                      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>⏳</span> Loading active citizens list...
                      </div>
                    ) : filteredCitizens.length === 0 ? (
                      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        No matching citizens found.
                      </div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ width: "40px", padding: "8px 12px" }}>
                              <input
                                type="checkbox"
                                checked={filteredCitizens.length > 0 && filteredCitizens.every(c => selectedIds.includes(c.id))}
                                onChange={() => handleSelectAllFiltered(filteredCitizens)}
                                style={{ cursor: "pointer" }}
                              />
                            </th>
                            <th style={{ padding: "8px 12px", fontSize: "0.7rem" }}>Citizen Name</th>
                            <th style={{ padding: "8px 12px", fontSize: "0.7rem" }}>Mobile Number</th>
                            <th style={{ padding: "8px 12px", fontSize: "0.7rem" }}>Village</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCitizens.map(c => {
                            const isChecked = selectedIds.includes(c.id);
                            return (
                              <tr 
                                key={c.id} 
                                onClick={() => handleSelectToggle(c.id)}
                                style={{ cursor: "pointer", background: isChecked ? "rgba(34,197,94,0.03)" : "transparent" }}
                              >
                                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // Controlled by row click
                                    style={{ cursor: "pointer" }}
                                  />
                                </td>
                                <td style={{ padding: "8px 12px", fontWeight: 600, fontSize: "0.8rem" }}>{c.full_name}</td>
                                <td style={{ padding: "8px 12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>{c.mobile_number}</td>
                                <td style={{ padding: "8px 12px", fontSize: "0.8rem" }}>{c.village || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Counter tracker */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    <span>Showing {filteredCitizens.length} of {citizens.length} citizens</span>
                    <span style={{ color: "var(--accent-light)", fontWeight: 600 }}>{selectedIds.length} recipients selected</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Action Trigger Button */}
          <button
            onClick={triggerSend}
            disabled={sending || uploadingImage}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "0.95rem", borderRadius: "12px", boxShadow: "0 4px 16px rgba(34,197,94,0.2)" }}
          >
            {sending ? "📡 Sending Circular..." : "🚀 Deliver WhatsApp Broadcast"}
          </button>
        </div>

        {/* Right Column: smartphone WhatsApp mock circular preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Smartphone mockup card */}
          <div className="card" style={{ padding: "16px", background: "#070a0f", display: "flex", flexDirection: "column", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
              📱 Live WhatsApp preview
            </h2>
            
            {/* Phone shell */}
            <div style={{
              background: "#0b141a",
              borderRadius: "32px",
              border: "12px solid #1f2937",
              width: "100%",
              aspectRatio: "9/18",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 12px 48px rgba(0,0,0,0.6)"
            }}>
              {/* Status/Speaker notch bar */}
              <div style={{ height: "24px", background: "#111b21", position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", fontSize: "0.68rem", color: "var(--text-muted)" }}>
                <span>16:45</span>
                <div style={{ background: "#000", width: "70px", height: "14px", borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px", position: "absolute", left: "50%", transform: "translateX(-50%)", top: 0 }}></div>
                <div style={{ display: "flex", gap: "3px" }}>
                  <span>📶</span>
                  <span>🔋</span>
                </div>
              </div>

              {/* Chat head top panel */}
              <div style={{ background: "#202c33", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #313d45" }}>
                <span style={{ fontSize: "1.4rem" }}>🏛️</span>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#e9edef" }}>Gram Panchayat Circular</div>
                  <div style={{ fontSize: "0.62rem", color: "#8696a0" }}>Official Account</div>
                </div>
              </div>

              {/* Chat screen panel body */}
              <div style={{
                flex: 1,
                backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                backgroundSize: "cover",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end"
              }}>
                {/* Chat Message Bubble */}
                <div style={{
                  background: "#005c4b",
                  borderRadius: "10px",
                  borderTopLeftRadius: 0,
                  padding: "8px",
                  maxWidth: "88%",
                  alignSelf: "flex-start",
                  position: "relative",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}>
                  {/* Bubble Image */}
                  {imageUrl && (
                    <img 
                      src={imageUrl} 
                      alt="WhatsApp preview attachment" 
                      style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: "6px" }} 
                    />
                  )}

                  {/* Bubble Body text */}
                  <div style={{ 
                    fontSize: "0.75rem", 
                    color: "#e9edef", 
                    whiteSpace: "pre-line", 
                    fontFamily: "'Segoe UI', Roboto, sans-serif",
                    lineHeight: 1.4
                  }}>
                    {livePreviewMessage}
                  </div>

                  {/* Time badge */}
                  <span style={{ fontSize: "0.55rem", color: "rgba(233,237,239,0.6)", alignSelf: "flex-end", marginTop: "2px" }}>
                    16:45 ✓✓
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Sending Overlay Modal ── */}
      {sending && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: "480px" }}>
            <div className="modal-header" style={{ padding: "20px 24px" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                📡 Broadcasting Circular
              </h3>
              <span className="wa-dot" />
            </div>

            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Progress Counters */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 600 }}>
                <span style={{ color: "var(--text-secondary)" }}>
                  Processed: {progress.current} of {progress.total}
                </span>
                <span style={{ color: "var(--success)" }}>
                  {Math.round((progress.current / progress.total) * 100)}% Complete
                </span>
              </div>

              {/* Progress Visualizer Bar */}
              <div style={{ height: "10px", background: "var(--gray-900)", borderRadius: "5px", overflow: "hidden", border: "1px solid var(--border)" }}>
                <div 
                  style={{ 
                    height: "100%", 
                    width: `${(progress.current / progress.total) * 100}%`, 
                    background: "linear-gradient(90deg, var(--green-600), var(--green-400))", 
                    borderRadius: "5px",
                    transition: "width 0.4s ease"
                  }} 
                />
              </div>

              {/* Status Breakdown Counters */}
              <div className="grid-2" style={{ gap: "12px" }}>
                <div style={{ background: "#111827", padding: "10px", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--success)" }}>{progress.success}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Successful</div>
                </div>
                <div style={{ background: "#111827", padding: "10px", borderRadius: "10px", textAlign: "center", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: progress.failed > 0 ? "var(--danger)" : "var(--text-muted)" }}>{progress.failed}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Failed</div>
                </div>
              </div>

              {/* Status message logs inside modal */}
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", fontStyle: "italic", marginTop: "4px" }}>
                Please keep this page open. Twilio is delivering WhatsApp messages sequentially...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Templates Manager Console --- */}
      {showTemplateManager && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal" style={{ maxWidth: "720px", width: "90%" }}>
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>⚙️ WhatsApp Templates Console</h3>
              <button 
                onClick={() => setShowTemplateManager(false)}
                className="btn btn-secondary btn-sm"
                style={{ padding: "4px 8px" }}
              >
                ✕ Close
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "500px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Create and verify custom utility templates under Meta&apos;s guidelines.
                </span>
                <button 
                  onClick={() => setShowTemplateModal(true)}
                  className="btn btn-primary btn-sm"
                >
                  ➕ New Template
                </button>
              </div>

              {loadingTemplates ? (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>Loading templates...</div>
              ) : templates.filter(t => t.type === "broadcast").length === 0 ? (
                <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                  No custom templates registered yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {templates
                    .filter(t => t.type === "broadcast")
                    .map(t => {
                      const varCount = getTemplateVariablesCount(t.body);
                      return (
                        <div key={t.name} style={{ background: "#111827", padding: "14px", border: "1px solid var(--border)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#f9fafb" }}>{t.title}</span>
                              <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: "4px" }}>{t.name}</span>
                              <span className="badge badge-info" style={{ fontSize: "0.6rem" }}>Utility</span>
                            </div>

                            <div style={{ background: "rgba(0,0,0,0.2)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)", fontSize: "0.78rem", whiteSpace: "pre-wrap", color: "var(--text-secondary)", fontFamily: "monospace", lineHeight: 1.4 }}>
                              {t.body}
                            </div>

                            <div style={{ display: "flex", gap: "12px", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              <span>Variables: <strong>{varCount}</strong></span>
                              <span>Submitted: {new Date(t.createdAt).toLocaleTimeString()}</span>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                            {t.status === "pending" ? (
                              <span className="badge badge-warning" style={{ fontSize: "0.65rem", display: "flex", alignItems: "center", gap: "4px" }}>
                                <span className="wa-dot" style={{ background: "var(--warning)", width: "6px", height: "6px" }} />
                                Pending Verification
                              </span>
                            ) : (
                              <span className="badge badge-success" style={{ fontSize: "0.65rem", display: "flex", alignItems: "center", gap: "4px" }}>
                                <span className="wa-dot" style={{ background: "var(--success)", width: "6px", height: "6px" }} />
                                Verified
                              </span>
                            )}

                            <button 
                              onClick={() => handleDeleteTemplate(t.name)}
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: "0.7rem", padding: "4px 8px" }}
                            >
                              🗑 Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- New Template Submit Modal --- */}
      {showTemplateModal && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div className="modal" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>➕ Create WhatsApp Template</h3>
            </div>

            <form onSubmit={handleCreateTemplate}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                
                <div className="form-group">
                  <label className="form-label">Template Codename (Alphanumeric slug)</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="e.g. water_alert"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    required
                    disabled={submittingTemplate}
                  />
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    Lowercase and underscores only. We automatically prefix with `gp_`.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Template Title</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="e.g. Water Bill Reminder"
                    value={newTemplateTitle}
                    onChange={(e) => setNewTemplateTitle(e.target.value)}
                    disabled={submittingTemplate}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Body Text (WhatsApp layout)</label>
                  <textarea 
                    className="form-input"
                    placeholder="e.g. Namaskar {{1}}, your water bill is due for property {{2}}. Pay link: {{3}}"
                    value={newTemplateBody}
                    onChange={(e) => setNewTemplateBody(e.target.value)}
                    required
                    disabled={submittingTemplate}
                    style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "0.82rem", lineHeight: 1.4 }}
                  />
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    Use placeholders like <strong>{"{{1}}"}</strong>, <strong>{"{{2}}"}</strong> for dynamic variables.
                  </span>
                </div>
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                <button 
                  type="button" 
                  onClick={() => setShowTemplateModal(false)}
                  className="btn btn-secondary btn-sm"
                  disabled={submittingTemplate}
                  style={{ padding: "4px 8px" }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary btn-sm"
                  disabled={submittingTemplate}
                  style={{ padding: "4px 8px" }}
                >
                  {submittingTemplate ? "⏳ Submitting..." : "🚀 Submit to Meta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
