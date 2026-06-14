import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";

export default function PatientProfile() {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPatientProfile = async () => {
    try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/patients/profile/", {
        method: "GET",
        credentials: "include",
        });

        const text = await response.text();

        let data;

        try {
        data = JSON.parse(text);
        } catch {
        console.error("Server returned non-JSON:", text);
        throw new Error("Server returned invalid response");
        }

        if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
        }

        if (!response.ok) {
        throw new Error(data.error || "Failed to load patient profile");
        }

        setPatient(data.patient);
    } catch (err) {
        setError(err.message || "Something went wrong");
    } finally {
        setLoading(false);
    }
    };

  useEffect(() => {
    fetchPatientProfile();
  }, []);

  const getInitials = (name) => {
    if (!name) return "PT";

    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Loading patient profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-xl shadow-sm p-6 text-center">
          <h2 className="text-red-600 font-black text-xl">Profile Error</h2>
          <p className="text-gray-600 mt-2">{error}</p>

          <button
            onClick={() => {
              window.location.href = "/home";
            }}
            className="mt-4 bg-[#052f48] text-white px-4 py-2 rounded-lg font-semibold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans antialiased text-gray-800">
      {/* TOP NAVBAR */}
      <header className="bg-[#052f48] text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white rounded-lg p-1 flex items-center justify-center shadow-sm shrink-0">
              <img
                src={hospitalLogo}
                alt="PAHS Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <div>
              <span className="text-[10px] tracking-widest block font-light text-gray-300 uppercase">
                Patan Academy of Health Sciences
              </span>
              <span className="text-base sm:text-lg font-bold tracking-wide block leading-tight">
                Patient Portal
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              window.location.href = "/home";
            }}
            className="bg-[#254a60] hover:bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 box-border">
        <div className="mb-8 bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#052f48]">
            My Patient Profile
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and view your official hospital registration records.
          </p>
          <div className="h-1 w-20 bg-[#254a60] mt-2 rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT PROFILE CARD */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-[#254a60]/10 flex items-center justify-center text-[#052f48] text-4xl font-semibold border-2 border-[#254a60]/20 mb-4">
              {getInitials(patient?.full_name)}
            </div>

            <h2 className="text-xl font-bold text-[#052f48]">
              {patient?.full_name || "-"}
            </h2>

            <p className="text-xs text-gray-400 font-mono mt-1">
              {patient?.patient_id || "-"}
            </p>

            <span className="mt-3 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-200">
              Active Registered Record
            </span>

            <div className="w-full border-t border-gray-100 mt-6 pt-4 space-y-3 text-left text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">OPD Card ID:</span>
                <span className="font-semibold text-gray-700">
                  {patient?.patient_id || "-"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Patient Code:</span>
                <span className="font-semibold text-gray-700">
                  {patient?.patient_code || "-"}
                </span>
              </div>
            </div>
            <button
                onClick={() => {
                    window.location.href = "/change-password";
                }}
                className="bg-[#254a60] hover:bg-#143344 text-white border border-white/20 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer"
                >
                Change Password
                </button>
          </div>
          

          {/* RIGHT DETAILS */}
          <div className="lg:col-span-2 space-y-6">
            {/* PERSONAL DETAILS */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-[#254a60] px-6 py-4">
                <h3 className="text-white text-base font-semibold tracking-wide flex items-center gap-2">
                  <span>👤</span> Personal & Demographics Information
                </h3>
              </div>

              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                <ProfileValue
                  label="Age / Sex"
                  value={`${patient?.age ? `${patient.age} Years` : "-"} / ${
                    patient?.gender || "-"
                  }`}
                />

                <ProfileValue
                  label="Date of Birth"
                  value={patient?.birth_date}
                />

                <ProfileValue
                  label="Mobile Phone"
                  value={patient?.contact}
                />

                <ProfileValue
                  label="Email Address"
                  value={patient?.email}
                />

                <ProfileValue
                  label="Permanent Address"
                  value={patient?.address}
                  fullWidth
                />

                <ProfileValue
                  label="Temporary / Current Residence"
                  value={patient?.address}
                  fullWidth
                />
              </div>
            </div>

            {/* EMERGENCY + INSURANCE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* EMERGENCY */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="bg-[#052f48] px-5 py-3.5">
                  <h4 className="text-white text-sm font-semibold tracking-wide flex items-center gap-2">
                    <span>🚨</span> Emergency Contact
                  </h4>
                </div>

                <div className="p-5 flex-1 space-y-3.5 text-sm">
                  <SmallProfileValue
                    label="Contact Name"
                    value={patient?.guardian}
                  />

                  <SmallProfileValue
                    label="Relationship"
                    value={patient?.relation}
                  />

                  <SmallProfileValue
                    label="Phone Number"
                    value={patient?.contact}
                  />
                </div>
              </div>

              {/* INSURANCE */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="bg-[#052f48] px-5 py-3.5">
                  <h4 className="text-white text-sm font-semibold tracking-wide flex items-center gap-2">
                    <span>🛡️</span> Insurance Coverage
                  </h4>
                </div>

                <div className="p-5 flex-1 space-y-3.5 text-sm">
                  <SmallProfileValue
                    label="Provider / Scheme"
                    value={patient?.discount || patient?.category}
                  />

                  <div>
                    <label className="block text-xs text-gray-400 font-medium">
                      Policy / Claim Number
                    </label>
                    <p className="text-gray-800 font-mono font-medium bg-gray-100 px-2 py-1 rounded inline-block mt-1 text-xs">
                      {patient?.patient_code || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#052f48] text-gray-400 text-xs py-5 mt-auto border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:flex sm:justify-between sm:items-center">
          <p className="font-light">&copy; 2026 D-Code Technology Pvt. Ltd.</p>
          <p className="mt-1 sm:mt-0 text-[11px] text-gray-500">
            Confidential Medical Record Interface
          </p>
        </div>
      </footer>
    </div>
  );
}

function ProfileValue({ label, value, fullWidth = false }) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      <p className="text-gray-800 font-medium bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
        {value || "-"}
      </p>
    </div>
  );
}

function SmallProfileValue({ label, value }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 font-medium">
        {label}
      </label>
      <p className="text-gray-800 font-semibold mt-0.5">
        {value || "-"}
      </p>
    </div>
  );
}