import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";
import loginBg from "../assets/pahsbg.jpeg";
import { getCookie } from "../utils/cookie";

export default function Login() {
  const [patientId, setPatientId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => {
      window.removeEventListener("resize", checkScreenSize);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const csrfResponse = await fetch("/api/csrf/", {
        method: "GET",
        credentials: "include",
      });

      let csrfData;
      try {
        csrfData = await csrfResponse.json();
      } catch {
        throw new Error("CSRF API returned invalid response");
      }

      const csrfToken = getCookie("csrftoken") || csrfData.csrfToken;

      const response = await fetch("/api/auth/login/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({
          username: patientId,
          password: password,
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("Server returned invalid response");
      }

      if (!response.ok || !data.success) {
        setError(data.error || "Login failed");
        return;
      }

      window.location.href = "/home";
    } catch (error) {
      setError(error.message || "Server connection failed");
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-8 overflow-hidden relative bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${loginBg})`,
      }}
    >
      <div className="absolute inset-0 bg-[#052f48]/60 backdrop-blur-[1px]" />

      <div className="relative z-10 w-full flex items-center justify-center">
      {isMobile ? (
        <MobileLoginView
          logo={hospitalLogo}
          patientId={patientId}
          setPatientId={setPatientId}
          password={password}
          setPassword={setPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          handleSubmit={handleSubmit}
          error={error}
        />
      ) : (
        <DesktopLoginView
          logo={hospitalLogo}
          patientId={patientId}
          setPatientId={setPatientId}
          password={password}
          setPassword={setPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          handleSubmit={handleSubmit}
          error={error}
        />
      )}
      </div>
    </div>
  );
}

function DesktopLoginView({
  logo,
  patientId,
  setPatientId,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  handleSubmit,
  error,
}) {
  return (
    <div className="relative w-full max-w-7xl flex items-center justify-center">
            <LoginCard
              logo={logo}
              patientId={patientId}
              setPatientId={setPatientId}
              password={password}
              setPassword={setPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              handleSubmit={handleSubmit}
              isMobile={false}
              error={error}
            />
    </div>
  );
}

function MobileLoginView({
  logo,
  patientId,
  setPatientId,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  handleSubmit,
  error,
}) {
  return (
      <div className="w-full max-w-md bg-[#254a60]/95 rounded-3xl overflow-hidden px-5 pt-16 pb-6 flex items-center justify-center shadow-2xl">
        <LoginCard
          logo={logo}
          patientId={patientId}
          setPatientId={setPatientId}
          password={password}
          setPassword={setPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          handleSubmit={handleSubmit}
          isMobile={true}
          error={error}
        />
      </div>
  );
}

function LoginCard({
  logo,
  patientId,
  setPatientId,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  handleSubmit,
  isMobile,
  error,
}) {
  return (
    <div
      className={`bg-[#254a60] flex flex-col items-center ${
        isMobile
          ? "w-full shadow-none"
          : "w-full max-w-115 rounded-xl px-8 py-10 shadow-2xl"
      }`}
    >
      {/* Logo */}
      <div
        className={`bg-white rounded-xl shadow-md flex items-center justify-center overflow-hidden ${
          isMobile ? "w-28 h-32 mb-5 p-2" : "w-32 h-32 mb-6 p-3"
        }`}
      >
        <img
          src={logo}
          alt="PAHS Logo"
          className="w-full h-full object-contain"
        />
      </div>

      {/* Heading */}
      <div className="text-center mb-6">
        <h1
          className={`text-white font-black leading-tight ${
            isMobile ? "text-l" : "text-3xl"
          }`}
        >
          Patan Academy of Health Sciences
        </h1>
        <p className="text-gray-300 text-sm mt-1">
            Patient Portal
          </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="w-full mb-4 bg-red-500/20 border border-red-400 text-red-200 rounded-lg px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div>
          <label className="block text-white text-sm font-medium mb-1.5">
            Patient ID
          </label>
          <input
            type="text"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="Enter your Patient ID"
            className="w-full bg-white text-slate-800 placeholder:text-slate-400 border border-slate-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-sky-400"
            required
          />
        </div>

        <div>
          <label className="block text-white text-sm font-medium mb-1.5">
            Password
          </label>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your Password"
              className="w-full bg-white text-slate-800 placeholder:text-slate-400 border border-slate-300 rounded-lg px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-sky-400"
              required
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-[#003f5f] hover:bg-[#002f48] text-white font-black py-3 rounded-full shadow-lg transition"
        >
          Login
        </button>
      </form>

      {/* Links */}
      <div className="w-full mt-5 text-sm">
        <div
          className={`flex ${
            isMobile ? "flex-col gap-1" : "justify-between"
          } text-sky-300`}
        >
          <a href="#forgot-id" className="hover:text-white hover:underline">
            Forgot Patient ID?
          </a>
          <a href="#forgot-password" className="hover:text-white hover:underline">
            Forgot Password?
          </a>
        </div>

        <div className="text-center text-gray-200 mt-5">
          Need an account?{" "}
          <a href="#register" className="text-white font-bold underline">
            Register Here.
          </a>
        </div>
        <div className="text-center text-gray-200 mt-5">
          Powered By{" "}
          <a href="https://d-codetechnology.com/" className="text-white font-bold underline">
            D-Code Technology Pvt. Ltd.
          </a>
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.6 10.6A2 2 0 0012 14a2 2 0 001.4-.6M6.6 6.6C3.8 8.3 2.25 12 2.25 12S6 18.75 12 18.75c1.7 0 3.2-.4 4.5-1M9.8 5.6A9.2 9.2 0 0112 5.25c6 0 9.75 6.75 9.75 6.75a16.4 16.4 0 01-3.1 3.8"
      />
    </svg>
  );
}
