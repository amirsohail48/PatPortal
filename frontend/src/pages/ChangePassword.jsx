import { useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";
import PageHeader from "../components/PageHeader";


function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split("; ") : [];

  for (const cookie of cookies) {
    const parts = cookie.split("=");
    const key = decodeURIComponent(parts[0]);

    if (key === name) {
      return decodeURIComponent(parts.slice(1).join("="));
    }
  }

  return "";
}

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleUpdatePassword = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await fetch("/api/csrf/", {
        credentials: "include",
      });

      const response = await fetch("/api/auth/password/update/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Password update failed");
      }

      setSuccess(data.message || "Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <header className="bg-[#052f48] text-white shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-lg p-1">
              <img src={hospitalLogo} alt="PAHS Logo" className="w-full h-full object-contain" />
            </div>

            <div>
              <span className="text-xs tracking-wider block text-gray-300 uppercase">
                Patan Academy of Health Sciences
              </span>
              <span className="text-base sm:text-lg font-bold block">
                Change Password
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              window.location.href = "/patient-profile";
            }}
            className="bg-[#254a60] hover:bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium"
          >
            Back
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-[#052f48] to-[#254a60] text-white px-6 py-6">
            <h1 className="text-2xl font-black">Update Password</h1>
            <p className="text-sm text-gray-200 mt-1">
              Enter your current password and choose a new password.
            </p>
          </div>

          <form onSubmit={handleUpdatePassword} className="p-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 text-sm font-semibold">
                {success}
              </div>
            )}

            <PasswordInput
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />

            <PasswordInput
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
            />

            <PasswordInput
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#052f48] hover:bg-[#254a60] disabled:opacity-60 text-white px-6 py-3 rounded-xl font-black shadow-md transition"
            >
              {saving ? "Updating..." : "Update Password"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function PasswordInput({ label, value, onChange }) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="block text-sm font-bold text-[#052f48] mb-1">
        {label}
      </label>

      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 pr-16 outline-none focus:ring-2 focus:ring-[#254a60]"
          required
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#254a60]"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}