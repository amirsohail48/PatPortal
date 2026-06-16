import { useState,useEffect } from 'react';
import hospitalLogo from "../assets/hospital-logo.png";
import pahsImage from "../assets/pahs1.jpeg";

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

export default function HomePage() {
    const [patientId, setPatientId] = useState("");
    const [patient, setPatient] = useState("");
    const [currentDeposit, setCurrentDeposit] = useState("0.00");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const fetchCurrentDeposit = async () => {
        try {
            const response = await fetch("/api/billing/documents/", {
            credentials: "include",
            });

            const data = await response.json();

            if (response.status === 401 || response.status === 403) {
            window.location.href = "/login";
            return;
            }

            if (data.success) {
            setCurrentDeposit(data["totals"]["Receipts"]["received_amount"] || "0.00");
            }
        } catch (error) {
            console.error("Failed to load current deposit:", error);
        }
        };

    useEffect(() => {
        fetch("/api/auth/status/", {
        credentials: "include",
        })
        .then((res) => res.json())
        .then((data) => {
        if (!data.authenticated) {
        window.location.href = "/login";
        return;
        }

        setPatientId(data.patient_id);
        fetchCurrentDeposit();
        return fetch("/api/patients/profile/",{
            credentials:"include",
        });
        })
        .then((res) => {
            if (!res) return;
            return res.json();
        })
        .then((profileData)=> {
            if (!profileData) return;
            if (profileData.success) {
                setPatient(profileData.patient)
            }
        })
        .catch((err) => {
        console.error("Auth status error:", err);
        });
        }, []);
    
    const handleLogout = async () => {
        try {
            const csrfResponse = await fetch("/api/csrf/", {
            method: "GET",
            credentials: "include",
            });

            const csrfData = await csrfResponse.json();
            const csrfToken = csrfData.csrfToken || getCookie("csrftoken");

            const response = await fetch("/api/auth/logout/", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken,
            },
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
            alert(data.error || "Logout failed");
            return;
            }

            window.location.href = "/login";
        } catch (error) {
            console.error("Logout error:", error);
            alert("Logout failed. Please try again.");
        }
        };

// Core features mapped to cleanly designed cards
    const services = [
    { id: 'profile', title: 'Patient Profile', icon: '👤', desc: 'View and update your personal health record, contact info, and emergency contacts.' },
    { id: 'appointments', title: 'Appointments', icon: '📅', desc: 'Book new appointments.' },
    { id: 'invoice', title: 'Invoices and Receipts', icon: '🧾', desc: 'Access your payed Bills and Receipts.' },
    { id: 'prescriptions', title: 'Prescriptions', icon: '℞', desc: 'Track your doctor advice' },
    { id: 'billing', title: 'Bill Payment', icon: 'रु', desc: 'View current hospital invoices, pay balances securely.' },
    { id: 'deposit', title: 'Deposit', icon: '💰', desc: 'Add advance funds to your hospital account for seamless admission and testing.' },
    { id: 'history', title: 'Visit History', icon: '📜', desc: 'Review your visits.' },
    { id: 'archived', title: 'Archived Reports', icon: '🗄️', desc: 'Retrieve your medical diagnostic documents.' },
    { id: 'dicom', title: 'Dicom Image', icon: '🩻', desc: 'Retrieve your dicom image(X-ray, CT-Scan, MRI Scan Image).' },
    { id: "grievances", title: "Grievances & Feedback", icon: "📝", desc: "Submit Your Grievances & feedback."},
    ];
    const patientName = patient?.full_name || "Patient";
    const firstName= patient?.first_name || "Patient";
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans antialiased text-gray-800">
        
        {/* 1. TOP HEADER / NAVIGATION */}
        <header className="bg-[#052f48] text-white shadow-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
            
            {/* Logo and Institution Title */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center shadow-sm shrink-0">
                <img 
                    src={hospitalLogo}
                    alt="PAHS Logo" 
                    className="w-full h-full object-contain"
                />
                </div>
                <div>
                <span className="text-xs tracking-wider block font-light text-gray-300 uppercase">Patan Academy of Health Sciences</span>
                <span className="text-base sm:text-lg font-bold tracking-wide block leading-tight">Patient Portal</span>
                </div>
            </div>

            {/* Desktop Right Nav Elements */}
            <div className="hidden md:flex items-center gap-6">
                <div className="text-right">
                <p className="text-xs text-gray-300">Welcome back,</p>
                <p className="text-sm font-semibold text-white">{patientName} ({patientId})</p>
                </div>
                <button 
                onClick={handleLogout}
                className="bg-[#254a60] hover:bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer">
                Logout
                </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
                <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-white hover:text-gray-300 focus:outline-none p-2 bg-[#254a60]/50 rounded-lg"
                >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    )}
                </svg>
                </button>
            </div>
            </div>

            {/* Mobile Dropdown Panel */}
            {isMobileMenuOpen && (
            <div className="md:hidden bg-[#254a60] border-t border-white/10 px-4 py-4 space-y-3 shadow-inner animate-fadeIn">
                <div className="pb-2 border-b border-white/10">
                <p className="text-xs text-gray-300">Logged in as</p>
                <p className="text-sm font-semibold text-white">{patientName} ({patientId})</p>
                </div>
                <button className="w-full bg-[#052f48] text-white py-2.5 rounded-lg text-sm font-medium">
                Logout
                </button>
            </div>
            )}
        </header>

        {/* 2. HERO / WELCOME BANNER */}
        <section className="relative text-white py-10 sm:py-14 px-8 sm:px-6 lg:px-8 shadow-inner overflow-hidden">
        {/* Background Image */}
        <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
            backgroundImage: `url(${pahsImage})`,
            }}
        />

        {/* Dark Overlay for readable text */}
        <div className="absolute inset-0 bg-[#052f48]/25" />

        <div className="relative z-10 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-baseline gap-6">
            <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Namaste, {firstName}
            </h2>

            <p className="text-gray-100 text-sm sm:text-base mt-1 max-w-xl font-light leading-relaxed">
                Manage your healthcare requirements online. Select an option below to
                schedule services, check records, or view accounts.
            </p>
            </div>

            <div className="bg-white/15 backdrop-blur-md rounded-xl p-3.5 border border-white/20 text-xs sm:text-sm self-stretch md:self-auto flex md:flex-col justify-between gap-2 shadow-lg">
            <div>
                <span className="text-gray-200">OPD Card ID:</span>
                <strong className="text-white ml-1">{patientId}</strong>
            </div>

            <div className="md:border-t md:border-white/20 md:pt-1">
                <span className="text-gray-200">Current Deposit:</span>
                <strong className="text-emerald-300 ml-1">NPR {currentDeposit}</strong>
            </div>
            </div>
        </div>
        </section>

        {/* 3. MAIN DASHBOARD CONTENT */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 box-border">
            
            {/* Section Title */}
            <div className="mb-6">
            <h3 className="text-lg font-bold text-[#052f48] uppercase tracking-wider">Patient Services</h3>
            <div className="h-1 w-16 bg-[#254a60] mt-1 rounded-full"></div>
            </div>

            {/* 8-Card Responsive Grid Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {services.map((service) => (
                <div 
                key={service.id}
                onClick={()=>{
                    if (service.id === "profile"){
                        window.location.href ="/patient-profile";
                    }
                    if (service.id === "billing") {
                        window.location.href = "/bill-payment";
                    }
                    if (service.id === "archived") {
                        window.location.href = "/archived-reports";
                    }
                    if (service.id === "invoice") {
                        window.location.href = "/invoices-receipts";
                    }
                    if (service.id === "prescriptions") {
                        window.location.href = "/prescriptions";
                    }
                    if (service.id === "history") {
                        window.location.href = "/visit-history";
                    }
                    if (service.id === "appointments") {
                        window.location.href = "/appointments";
                    }
                    if (service.id === "dicom") {
                        window.location.href = "/dicom";
                    }
                    if (service.id === "grievances") {
                        window.location.href = "/grievances-feedback";
                    }
                    if (service.id === "deposit") {
                        window.location.href = "/deposit";
                    }
                }}
                className="bg-white rounded-xl shadow-sm border border-gray-200/80 hover:shadow-md hover:border-[#254a60]/30 transition-all duration-200 p-5 flex flex-col group cursor-pointer"
                >
                {/* Card Header (Icon & Title) */}
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-2xl border border-gray-100 group-hover:bg-[#254a60]/10 transition duration-200 shrink-0">
                    {service.icon}
                    </div>
                    <h4 className="text-base font-bold text-[#052f48] group-hover:text-[#254a60] transition-colors leading-tight">
                    {service.title}
                    </h4>
                </div>

                {/* Card Body Description */}
                <p className="text-xs sm:text-sm text-gray-500 font-normal leading-relaxed flex-1">
                    {service.desc}
                </p>

                {/* Action Trigger Link */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-[#254a60] group-hover:text-[#052f48]">
                    <span>Access Feature</span>
                    <span className="transform translate-x-0 group-hover:translate-x-1 transition-transform duration-200">➔</span>
                </div>
                </div>
            ))}
            </div>
        </main>

        {/* 4. INSTITUTIONAL FOOTER */}
        <footer className="bg-[#052f48] text-gray-400 text-xs py-6 mt-auto border-t border-white/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
            <div>
                <p className="font-semibold text-gray-300">Patan Academy of Health Sciences (PAHS)</p>
                <p className="mt-0.5 font-light">Lagankhel, Lalitpur, Nepal | Tel: +977-1-5445112</p>
            </div>
            <div className="text-gray-400 font-light">
                <a href="https://d-codetechnology.com/" className="text-white font-bold underline">
                    &copy; 2026 D-Code Technology Pvt. Ltd. All rights reserved.
                </a>
            </div>
            </div>
        </footer>

        </div>
    );
}