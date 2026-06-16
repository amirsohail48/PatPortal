import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";

export default function PageHeader({
  title = "Patient Portal",
  buttonText = "Back to Dashboard",
  buttonPath = "/home",
}) {
  const [hospitalName, setHospitalName] = useState("D-Code Technology Pvt. Ltd.");
  useEffect(() => {
    const fetchConfig = async () => {
        try {
            const response = await fetch("/api/auth/status/", {
                credentials: "include",
            });

            const data = await response.json();

            setHospitalName(data.hospital_name || "D-Code Technology Pvt. Ltd.");
        
        } catch (error) {
            console.error("Failed to load app config:", error);
        }
    };
    fetchConfig();
    }, []);  
  return (
    <header className="bg-[#052f48] text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center shadow-sm shrink-0">
            <img
              src={hospitalLogo}
              alt="Hospital Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <span className="text-xs tracking-wider block font-light text-gray-300 uppercase">
              {hospitalName}
            </span>
            <span className="text-base sm:text-lg font-bold tracking-wide block leading-tight">
              {title}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = buttonPath;
          }}
          className="bg-[#254a60] hover:bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition"
        >
          {buttonText}
        </button>
      </div>
    </header>
  );
}