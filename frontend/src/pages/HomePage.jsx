import { useState,useEffect } from 'react';
import hospitalLogo from "../assets/hospital-logo.png";
import pahsImage from "../assets/pahs1.jpeg";
import PageHeader from "../components/PageHeader";
import PageFooter from "../components/PageFooter";
import { getCookie } from "../utils/cookie";

export default function HomePage() {
    const [hospitalName, setHospitalName] = useState("D-Code technology Pvt. Ltd.");
    const [patientId, setPatientId] = useState("");
    const [patient, setPatient] = useState("");
    const [currentDeposit, setCurrentDeposit] = useState("0.00");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [logoutError, setLogoutError] = useState("");

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
            setCurrentDeposit(data?.totals?.Receipts?.received_amount || "0.00");
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
        setHospitalName(data.hospital_name || "D-Code technology Pvt. Ltd.");
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
            setLogoutError(data.error || "Logout failed");
            return;
            }

            window.location.href = "/login";
        } catch {
            setLogoutError("Logout failed. Please try again.");
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

    const serviceRoutes = {
        profile: "/patient-profile",
        appointments: "/appointments",
        invoice: "/invoices-receipts",
        prescriptions: "/prescriptions",
        billing: "/bill-payment",
        deposit: "/deposit",
        history: "/visit-history",
        archived: "/archived-reports",
        dicom: "/dicom",
        grievances: "/grievances-feedback",
        };

        const goToService = (serviceId) => {
        const route = serviceRoutes[serviceId];

        if (route) {
        window.location.href = route;
        }
    };

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
                <span className="text-xs tracking-wider block font-light text-gray-300 uppercase">{hospitalName}</span>
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
                <button
                    onClick={handleLogout}
                    className="w-full bg-[#052f48] text-white py-2.5 rounded-lg text-sm font-medium"
                >
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
            {logoutError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
                {logoutError}
              </div>
            )}
            {/* Section Title */}
            <div className="mb-6">
            <h3 className="text-lg font-bold text-[#052f48] uppercase tracking-wider">Patient Services</h3>
            <div className="h-1 w-16 bg-[#254a60] mt-1 rounded-full"></div>
            </div>

            {/* 8-Card Responsive Grid Layout */}
            {/* Mobile Android-style app icon grid */}
            <div className="grid grid-cols-4 gap-x-3 gap-y-6 sm:hidden">
                {services.map((service) => (
                    <button
                    key={service.id}
                    type="button"
                    onClick={() => goToService(service.id)}
                    className="flex flex-col items-center justify-start text-center active:scale-95 transition"
                    >
                    <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-2xl mb-2">
                        {service.icon}
                    </div>

                    <span className="text-[11px] font-bold text-[#052f48] leading-tight line-clamp-2">
                        {service.title}
                    </span>
                    </button>
                ))}
                </div>

                {/* Tablet/Desktop card grid */}
                <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {services.map((service) => (
                    <div
                    key={service.id}
                    onClick={() => goToService(service.id)}
                    className="bg-white rounded-xl shadow-sm border border-gray-200/80 hover:shadow-md hover:border-[#254a60]/30 transition-all duration-200 p-5 flex flex-col group cursor-pointer"
                    >
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-2xl border border-gray-100 group-hover:bg-[#254a60]/10 transition duration-200 shrink-0">
                        {service.icon}
                        </div>

                        <h4 className="text-base font-bold text-[#052f48] group-hover:text-[#254a60] transition-colors leading-tight">
                        {service.title}
                        </h4>
                    </div>

                    <p className="text-xs sm:text-sm text-gray-500 font-normal leading-relaxed flex-1">
                        {service.desc}
                    </p>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-[#254a60] group-hover:text-[#052f48]">
                        <span>Access Feature</span>
                        <span className="transform translate-x-0 group-hover:translate-x-1 transition-transform duration-200">
                        ➔
                        </span>
                    </div>
                    </div>
                ))}
            </div>
        </main>

        {/* 4. INSTITUTIONAL FOOTER */}
        <PageFooter/>

        </div>
    );
}