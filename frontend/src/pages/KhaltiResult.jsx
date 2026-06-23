import { useEffect, useRef, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";
import khaltiLogo from "../assets/khalti.png";
import PageHeader from "../components/PageHeader";

export default function KhaltiResult() {
  const [status, setStatus] = useState("CHECKING");
  const [message, setMessage] = useState("Verifying Khalti payment...");
  const [result, setResult] = useState(null);
  const verifyCalledRef = useRef(false);

  const verifyPayment = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pidxFromUrl = params.get("pidx");
      const pidxFromStorage = sessionStorage.getItem("last_khalti_pidx");
      const khaltiStatus = params.get("status");

      const pidx = pidxFromUrl || pidxFromStorage;

      if (!pidx) {
        throw new Error("Khalti payment identifier (pidx) not found.");
      }

      if (khaltiStatus === "User canceled") {
        setStatus("FAILED");
        setMessage("Payment was cancelled. No charge has been made.");
        return;
      }

      const csrfResponse = await fetch("/api/csrf/", { credentials: "include" });
      const csrfData = await csrfResponse.json();
      if (!csrfData.csrfToken) throw new Error("Failed to retrieve CSRF token.");

      const response = await fetch("/api/payments/khalti/verify/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfData.csrfToken,
        },
        body: JSON.stringify({ pidx }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Khalti payment verification failed.");
      }

      setResult(data);

      if (data.is_paid || data.khalti_status === "Completed") {
        setStatus("SUCCESS");
        setMessage("Payment successful.");
        sessionStorage.removeItem("last_khalti_pidx");
        sessionStorage.removeItem("last_khalti_payment_id");
        return;
      }

      if (data.khalti_status === "Pending") {
        setStatus("PENDING");
        setMessage("Payment is still pending. Please check again shortly.");
        return;
      }

      setStatus("FAILED");
      setMessage(
        data.khalti_status
          ? `Payment status: ${data.khalti_status}. Please try again.`
          : "Payment was not completed. Please try again."
      );
    } catch (error) {
      setStatus("FAILED");
      setMessage(error.message || "Payment verification failed.");
    }
  };

  useEffect(() => {
    if (verifyCalledRef.current) return;
    verifyCalledRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    verifyPayment();
  }, []);

  const isSuccess = status === "SUCCESS";
  const isChecking = status === "CHECKING";
  const isPending = status === "PENDING";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="Khalti Payment Result" />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-xl overflow-hidden">
          <div className="bg-linear-to-r from-[#052f48] to-[#254a60] text-white px-5 py-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center shrink-0">
              <img
                src={hospitalLogo}
                alt="PAHS Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex-1">
              <span className="text-xs tracking-wider block text-gray-300 uppercase">
                Patan Academy of Health Sciences
              </span>
              <span className="text-base sm:text-lg font-bold block">
                Khalti Payment Verification
              </span>
            </div>

            <div className="w-12 h-12 bg-white rounded-lg p-1.5 flex items-center justify-center shrink-0">
              <img
                src={khaltiLogo}
                alt="Khalti"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          <div className="p-6 text-center">
            <div
              className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center text-3xl ${
                isSuccess
                  ? "bg-emerald-50 text-emerald-600"
                  : isChecking || isPending
                  ? "bg-yellow-50 text-yellow-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {isSuccess ? "✓" : isChecking || isPending ? "…" : "!"}
            </div>

            <h2 className="text-xl font-black text-[#052f48] mt-4">
              {isSuccess
                ? "Payment Successful"
                : isChecking
                ? "Verifying..."
                : isPending
                ? "Payment Pending"
                : "Payment Failed"}
            </h2>

            <p className="text-gray-600 mt-2">{message}</p>

            {result && (
              <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4 text-left text-sm space-y-2">
                <InfoRow label="Purchase Order ID" value={result.purchase_order_id} />
                <InfoRow label="PIDX" value={result.pidx} />
                <InfoRow label="Amount" value={result.amount ? `NPR ${result.amount}` : null} />
                <InfoRow label="Khalti Status" value={result.khalti_status} />
                {result.transaction_id && (
                  <InfoRow label="Transaction ID" value={result.transaction_id} />
                )}
                {result.invoice_no && (
                  <InfoRow label="Invoice No" value={result.invoice_no} />
                )}
                {result.deposit_no && (
                  <InfoRow label="Deposit No" value={result.deposit_no} />
                )}
                {result.booking_confirmation && (
                  <InfoRow label="Booking" value="Appointment confirmed" />
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              {(isChecking || isPending) && (
                <button
                  onClick={() => {
                    setStatus("CHECKING");
                    setMessage("Verifying Khalti payment...");
                    setResult(null);
                    verifyPayment();
                  }}
                  className="bg-[#254a60] text-white px-5 py-3 rounded-xl font-bold"
                >
                  Check Again
                </button>
              )}

              <button
                onClick={() => { window.location.href = "/deposit"; }}
                className="bg-[#052f48] text-white px-5 py-3 rounded-xl font-bold"
              >
                Back to Bills
              </button>

              <button
                onClick={() => { window.location.href = "/home"; }}
                className="bg-gray-100 text-[#052f48] px-5 py-3 rounded-xl font-bold border border-gray-200"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;

  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}:</span>
      <strong className="text-right break-all">{value}</strong>
    </div>
  );
}
