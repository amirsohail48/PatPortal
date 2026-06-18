import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";
import PageHeader from "../components/PageHeader";
import { getCookie } from "../utils/cookie";

export default function ConnectIPSResult({ resultType }) {
  const [status, setStatus] = useState("CHECKING");
  const [message, setMessage] = useState("Validating connectIPS payment...");
  const [result, setResult] = useState(null);

  const validatePayment = async () => {
    try {

      const params = new URLSearchParams(window.location.search);
      const txnIdFromUrl = params.get("TXNID");
      const txnIdFromStorage = sessionStorage.getItem("last_connectips_txn_id");

      const txnId = txnIdFromUrl || txnIdFromStorage;

      if (!txnId) {
        throw new Error("connectIPS TXNID not found.");
      }

      const csrfResponse = await fetch("/api/csrf/", {
        credentials: "include",
      });

      const csrfData = await csrfResponse.json();
      const csrfToken = getCookie("csrftoken") || csrfData.csrfToken;

      const response = await fetch("/api/payments/connectips/validate/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({
          txn_id: txnId,
          result_type: resultType,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "connectIPS validation failed");
      }

      setResult(data);

      if (data.is_paid || data.connectips_status === "SUCCESS") {
        setStatus("SUCCESS");
        setMessage("Payment successful. Invoice can now be processed.");
        sessionStorage.removeItem("last_connectips_payment_id");
        sessionStorage.removeItem("last_connectips_txn_id");
        return;
      }

      if (resultType === "FAILURE_RETURN") {
        setStatus("FAILED");
        setMessage("Payment was cancelled or failed. No invoice should be created.");
        return;
      }

      setStatus(data.connectips_status || "INCOMPLETE");
      setMessage(data.status_desc || "Payment validation completed but payment is not successful.");
    } catch (error) {
      setStatus("FAILED");
      setMessage(error.message || "Payment validation failed.");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    validatePayment();
  }, []);

  const isSuccess = status === "SUCCESS";
  const isChecking = status === "CHECKING";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-xl overflow-hidden">
        <div className="bg-linear-to-r from-[#052f48] to-[#254a60] text-white px-5 py-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center">
            <img
              src={hospitalLogo}
              alt="PAHS Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <span className="text-xs tracking-wider block text-gray-300 uppercase">
              Patan Academy of Health Sciences
            </span>
            <span className="text-base sm:text-lg font-bold block">
              connectIPS Payment Verification
            </span>
          </div>
        </div>

        <div className="p-6 text-center">
          <div
            className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center text-3xl ${
              isSuccess
                ? "bg-emerald-50 text-emerald-600"
                : isChecking
                ? "bg-yellow-50 text-yellow-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {isSuccess ? "✓" : isChecking ? "…" : "!"}
          </div>

          <h2 className="text-xl font-black text-[#052f48] mt-4">
            {status}
          </h2>

          <p className="text-gray-600 mt-2">{message}</p>

          {result && (
            <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4 text-left text-sm space-y-2">
              <InfoRow label="TXN ID" value={result.txn_id} />
              <InfoRow label="Reference ID" value={result.reference_id} />
              <InfoRow label="Amount" value={result.amount} />
              <InfoRow label="connectIPS Status" value={result.connectips_status} />
              <InfoRow label="Status Description" value={result.status_desc} />
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => { setStatus("CHECKING"); setMessage("Validating connectIPS payment..."); validatePayment(); }}
              className="bg-[#254a60] text-white px-5 py-3 rounded-xl font-bold"
            >
              Check Again
            </button>

            <button
              onClick={() => {
                window.location.href = "/bill-payment";
              }}
              className="bg-[#052f48] text-white px-5 py-3 rounded-xl font-bold"
            >
              Back to Bills
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}:</span>
      <strong className="text-right break-all">{value || "-"}</strong>
    </div>
  );
}