import { useEffect, useState } from "react";

export default function PageHeader() {
  const [hospitalName, setHospitalName] = useState("D-Code Technology Pvt. Ltd.");
  const [hospitalAddress, setHospitalAddress] = useState("Lazimpat, Kathmandu");
  useEffect(() => {
    const fetchConfig = async () => {
        try {
            const response = await fetch("/api/auth/status/", {
                credentials: "include",
            });

            const data = await response.json();

            setHospitalName(data.hospital_name || "D-Code Technology Pvt. Ltd.");
            setHospitalAddress(data.hospital_address || "Lazimpat, Kathmandu");
        
        } catch (error) {
            console.error("Failed to load app config:", error);
        }
    };
    fetchConfig();
    }, []);  
  return (
    <footer className="bg-[#052f48] text-gray-400 text-xs py-6 mt-auto border-t border-white/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
                <div>
                    <p className="font-semibold text-gray-300">{hospitalName}</p>
                    <p className="mt-0.5 font-light">{hospitalAddress}</p>
                </div>
                <div className="text-gray-400 font-light">
                    <a href="https://d-codetechnology.com/" className="text-white font-bold underline">
                        &copy; 2026 D-Code Technology Pvt. Ltd. All rights reserved.
                    </a>
                </div>
            </div>
        </footer>
  );
}