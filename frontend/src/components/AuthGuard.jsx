import { useEffect, useState } from "react";

export default function AuthGuard({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status/", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          window.location.href = "/login";
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Verifying session...</p>
      </div>
    );
  }

  return children;
}
