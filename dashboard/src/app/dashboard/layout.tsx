"use client";
import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface Admin { name: string; email: string; role: string; }

function NavItem({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`nav-item ${active ? "active" : ""}`}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Admin | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("gp_token");
    const adminData = localStorage.getItem("gp_admin");
    if (!token) { router.replace("/login"); return; }
    if (adminData) setAdmin(JSON.parse(adminData));
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("gp_token");
    localStorage.removeItem("gp_admin");
    router.replace("/login");
  }

  const navItems = [
    { href: "/dashboard",           icon: "📊", label: "Overview"        },
    { href: "/dashboard/citizens",  icon: "👥", label: "Citizens"        },
    { href: "/dashboard/documents", icon: "📄", label: "Documents"       },
    { href: "/dashboard/forms",     icon: "📝", label: "Blank Forms"     },
    { href: "/dashboard/tax",       icon: "💳", label: "Property Tax"    },
    { href: "/dashboard/broadcast", icon: "📢", label: "Bulk Message"    },
    { href: "/dashboard/analytics", icon: "📈", label: "Analytics"       },
    { href: "/dashboard/audit",     icon: "🔍", label: "Audit Logs"      },
    { href: "/dashboard/blocked",   icon: "🚫", label: "Blocked Numbers" },
    { href: "/dashboard/settings",  icon: "⚙️", label: "Settings"        },
  ];

  return (
    <div className="dashboard-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ fontSize: "2rem", lineHeight: 1 }}>🏛️</div>
            <div>
              <div className="logo-text">Gram Panchayat</div>
              <div className="logo-sub">Digital Services Admin</div>
            </div>
          </div>
          <div className="india-chip" style={{ marginTop: "10px" }}>
            🇮🇳 Digital Bharat Platform
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {navItems.slice(0, 6).map(n => (
            <NavItem key={n.href} {...n} active={pathname === n.href} />
          ))}

          <div className="nav-section-label">Management</div>
          {navItems.slice(6).map(n => (
            <NavItem key={n.href} {...n} active={pathname === n.href} />
          ))}
        </nav>

        <div className="sidebar-footer">
          {admin && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 12px",
                background: "var(--ivory-dark)",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                marginBottom: "10px"
              }}>
                <div style={{
                  width: "34px", height: "34px", borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--saffron), var(--india-green))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1rem", flexShrink: 0, color: "#fff"
                }}>
                  👤
                </div>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>{admin.name}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{admin.email}</div>
                </div>
              </div>
              <span className="badge badge-saffron" style={{ fontSize: "0.65rem" }}>
                {admin.role.replace("_", " ")}
              </span>
            </div>
          )}
          <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: "100%" }}>
            🚪 Sign Out
          </button>
          <div style={{
            marginTop: "12px",
            fontSize: "0.68rem",
            color: "var(--text-light)",
            textAlign: "center"
          }}>
            Powered by{" "}
            <strong style={{ color: "var(--saffron-dark)" }}>Flowlytix.in</strong>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">{children}</main>
    </div>
  );
}
