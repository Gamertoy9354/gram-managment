"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("gp_token");
    if (token) router.replace("/dashboard");
    else router.replace("/login");
  }, [router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#030712" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🏛</div>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    </div>
  );
}
