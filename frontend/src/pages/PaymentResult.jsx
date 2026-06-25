import { useEffect, useRef, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";
import esewaLogo from "../assets/esewa.png";
import connectipsLogo from "../assets/connectIPS.png";
import khaltiLogo from "../assets/khalti.png";
import PageHeader from "../components/PageHeader";
import AppointmentConfirmationCard from "../components/AppointmentConfirmationCard";
import { getCookie } from "../utils/cookie";

// ---------- Utilities ----------

function decodeEsewaData(encoded) {
  if (!encoded) return null;
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

async function readJson(response, fallbackMsg) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(fallbackMsg || "Server returned an invalid response.");
  }
  if (response.status === 401 || response.status === 403) {
    window.location.href = "/login";
    return null;
  }
  if (!response.ok || data.success === false) {
    throw new Error(data.error || fallbackMsg || "Request failed.");
  }
  return data;
}

async function fetchCsrfToken() {
  const fromCookie = getCookie("csrftoken");
  if (fromCookie) return fromCookie;
  const res = await fetch("/api/csrf/", { credentials: "include" });
  const data = await res.json();
  return getCookie("csrftoken") || data.csrfToken;
}

function getStoredGateway() {
  return sessionStorage.getItem("latest_payment_gateway") || "";
}

function getStoredPaymentType() {
  return sessionStorage.getItem("latest_payment_type") || "";
}

function clearPaymentStorage(paymentType) {
  sessionStorage.removeItem("latest_payment_id");
  sessionStorage.removeItem("latest_payment_gateway");
  sessionStorage.removeItem("last_khalti_pidx");
  sessionStorage.removeItem("last_khalti_payment_id");
  sessionStorage.removeItem("last_connectips_txn_id");
  sessionStorage.removeItem("last_connectips_payment_id");
  if (paymentType === "APPOINTMENT") {
    sessionStorage.removeItem("latest_payment_type");
    sessionStorage.removeItem("latest_appointment_booking_id");
    sessionStorage.removeItem("latest_appointment_payload");
  }
}

function detectGateway() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  const stored = getStoredGateway();

  if (params.get("data")) return "ESEWA_EPAY";
  if (params.get("pidx") || stored === "KHALTI") return "KHALTI";
  if (params.get("TXNID") || path.startsWith("/transactionResponse") || stored === "CONNECTIPS") return "CONNECTIPS";
  return "ESEWA_INTENT";
}

function isSuccessStatus(value) {
  return ["SUCCESS", "COMPLETE", "INVOICE_CREATED", "DEPOSIT_CREATED", "APPOINTMENT_CREATED"].includes(value);
}

function isPendingStatus(value) {
  return ["CHECKING", "PENDING", "BOOKED", "INITIATED", "INCOMPLETE"].includes(value);
}

function buildSuccessMessage(data) {
  if (data?.booking_confirmation) {
    const q = data.booking_confirmation.queue_number;
    return q
      ? `Appointment booked successfully. Your queue number is ${q}.`
      : "Appointment booked successfully.";
  }
  if (data?.payment_type === "DEPOSIT" || data?.deposit_no) return "Payment successful. Deposit has been processed.";
  if (data?.payment_type === "BILL" || data?.invoice_no) return "Payment successful. Invoice has been processed.";
  return "Payment successful.";
}

function getBackButton(paymentType) {
  if (paymentType === "APPOINTMENT") return { label: "Back to Appointment", href: "/appointments" };
  if (paymentType === "DEPOSIT") return { label: "Back to Deposit", href: "/deposit" };
  return { label: "Back to Bills", href: "/bill-payment" };
}

const GATEWAY_META = {
  ESEWA_EPAY:   { logo: esewaLogo,      alt: "eSewa",       title: "eSewa Payment Verification" },
  ESEWA_INTENT: { logo: esewaLogo,      alt: "eSewa",       title: "eSewa Payment Verification" },
  CONNECTIPS:   { logo: connectipsLogo, alt: "ConnectIPS",  title: "connectIPS Payment Verification" },
  KHALTI:       { logo: khaltiLogo,     alt: "Khalti",      title: "Khalti Payment Verification" },
};

// ---------- Component ----------

export default function PaymentResult() {
  const [status, setStatus] = useState("CHECKING");
  const [message, setMessage] = useState("Checking payment status...");
  const [result, setResult] = useState(null);
  const [gateway, setGateway] = useState("");
  const [gatewayResponse, setGatewayResponse] = useState(null);
  const calledRef = useRef(false);

  // --- eSewa ePay ---
  const verifyEsewa = async (decodedData) => {
    const csrfToken = await fetchCsrfToken();
    const response = await fetch("/api/payments/esewa/epay/verify/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
      body: JSON.stringify({ esewa_data: decodedData }),
    });
    const data = await readJson(response, "Could not verify eSewa payment.");
    if (!data) return;

    setResult(data);
    setGatewayResponse(decodedData);

    if (isSuccessStatus(data.status)) {
      setStatus("SUCCESS");
      setMessage(buildSuccessMessage(data));
      clearPaymentStorage(data.payment_type);
      return;
    }
    setStatus(data.status || "FAILED");
    setMessage(`Payment status: ${data.status || "FAILED"}`);
  };

  // --- eSewa intent (polling) ---
  const verifyEsewaIntent = async () => {
    const paymentId = sessionStorage.getItem("latest_payment_id");
    if (!paymentId) {
      setStatus("FAILED");
      setMessage("Payment ID not found. Please check your payment history.");
      return;
    }
    const csrfToken = await fetchCsrfToken();
    const response = await fetch("/api/payments/esewa/status/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
      body: JSON.stringify({ payment_id: paymentId }),
    });
    const data = await readJson(response, "Could not verify eSewa payment status.");
    if (!data) return;

    setResult(data);
    if (isSuccessStatus(data.status)) {
      setStatus("SUCCESS");
      setMessage(buildSuccessMessage(data));
      clearPaymentStorage(data.payment_type);
      return;
    }
    if (isPendingStatus(data.status)) {
      setStatus(data.status);
      setMessage("Payment is still pending. Please check again shortly.");
      return;
    }
    setStatus(data.status || "FAILED");
    setMessage(`Payment status: ${data.status || "FAILED"}`);
  };

  // --- ConnectIPS ---
  const verifyConnectIPS = async () => {
    const path = window.location.pathname;

    if (path === "/transactionResponse/failure") {
      setStatus("FAILED");
      setMessage("Payment was cancelled or failed. No charge has been made.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const txnId =
      params.get("TXNID") ||
      sessionStorage.getItem("last_connectips_txn_id") || "";

    if (!txnId) {
      setStatus("FAILED");
      setMessage("connectIPS transaction ID not found.");
      return;
    }

    const resultType = path === "/transactionResponse/success" ? "SUCCESS_RETURN" : "";
    const csrfToken = await fetchCsrfToken();

    const response = await fetch("/api/payments/connectips/validate/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
      body: JSON.stringify({ txn_id: txnId, TXNID: txnId, result_type: resultType }),
    });
    const data = await readJson(response, "Could not validate connectIPS payment.");
    if (!data) return;

    const paymentType = getStoredPaymentType() || data.payment_type || "";
    setResult({ ...data, payment_type: paymentType });
    setGatewayResponse(data.validation_response || data.detail_response || null);

    if (data.is_paid || data.connectips_status === "SUCCESS") {
      setStatus("SUCCESS");
      setMessage(buildSuccessMessage({ ...data, payment_type: paymentType }));
      clearPaymentStorage(paymentType);
      return;
    }
    if (data.connectips_status === "PENDING" || data.status === "INCOMPLETE") {
      setStatus("PENDING");
      setMessage("connectIPS payment is still pending. Please check again.");
      return;
    }
    setStatus(data.connectips_status || "FAILED");
    setMessage(data.status_desc || "connectIPS payment was not successful.");
  };

  // --- Khalti ---
  const verifyKhalti = async () => {
    const params = new URLSearchParams(window.location.search);
    const pidx = params.get("pidx") || sessionStorage.getItem("last_khalti_pidx");

    if (!pidx) {
      setStatus("FAILED");
      setMessage("Khalti payment identifier (pidx) not found.");
      return;
    }
    if (params.get("status") === "User canceled") {
      setStatus("FAILED");
      setMessage("Payment was cancelled. No charge has been made.");
      return;
    }

    const csrfToken = await fetchCsrfToken();
    const response = await fetch("/api/payments/khalti/verify/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
      body: JSON.stringify({ pidx }),
    });
    const data = await readJson(response, "Khalti payment verification failed.");
    if (!data) return;

    setResult(data);

    if (data.is_paid || data.khalti_status === "Completed") {
      setStatus("SUCCESS");
      setMessage(buildSuccessMessage(data));
      clearPaymentStorage(data.payment_type);
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
  };

  // --- Dispatcher ---
  const checkStatus = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const detected = detectGateway();
      setGateway(detected);
      setStatus("CHECKING");
      setMessage("Checking payment status...");

      if (detected === "ESEWA_EPAY") {
        const decoded = decodeEsewaData(params.get("data"));
        if (!decoded) throw new Error("Invalid eSewa response data.");
        await verifyEsewa(decoded);
        return;
      }
      if (detected === "KHALTI") { await verifyKhalti(); return; }
      if (detected === "CONNECTIPS") { await verifyConnectIPS(); return; }
      await verifyEsewaIntent();
    } catch (error) {
      setStatus("FAILED");
      setMessage(error.message || "Payment verification failed.");
    }
  };

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    checkStatus();
  }, []);

  // --- Derived ---
  const paymentType = result?.payment_type || getStoredPaymentType();
  const bookingConfirmation = result?.booking_confirmation || null;
  const isSuccess = status === "SUCCESS" || isSuccessStatus(status);
  const isPending = isPendingStatus(status);
  const isChecking = status === "CHECKING";
  const backButton = getBackButton(paymentType);
  const gwMeta = GATEWAY_META[gateway] || {};

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageHeader title="Payment Verification" />

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-2xl overflow-hidden">

          <div className="bg-linear-to-r from-[#052f48] to-[#254a60] text-white px-5 py-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center shrink-0">
              <img src={hospitalLogo} alt="PAHS Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1">
              <span className="text-xs tracking-wider block text-gray-300 uppercase">
                Patan Academy of Health Sciences
              </span>
              <span className="text-base sm:text-lg font-bold block">
                {gwMeta.title || "Payment Verification"}
              </span>
            </div>
            {gwMeta.logo && (
              <div className="w-12 h-12 bg-white rounded-lg p-1.5 flex items-center justify-center shrink-0">
                <img src={gwMeta.logo} alt={gwMeta.alt} className="w-full h-full object-contain" />
              </div>
            )}
          </div>

          <div className="p-6 text-center">
            <div
              className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center text-3xl ${
                isSuccess
                  ? "bg-emerald-50 text-emerald-600"
                  : isPending || isChecking
                  ? "bg-yellow-50 text-yellow-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {isSuccess ? "✓" : isPending || isChecking ? "…" : "!"}
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

            {bookingConfirmation && (
              <AppointmentConfirmationCard confirmation={bookingConfirmation} />
            )}

            {isSuccess && paymentType === "APPOINTMENT" && !bookingConfirmation && (
              <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-sm font-bold">
                Please visit the hospital for your booking detail.
              </div>
            )}

            {result && (
              <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4 text-left text-sm space-y-2">
                <p className="font-black text-[#052f48] mb-2">Payment Detail</p>

                <InfoRow label="Payment Type" value={paymentType} />

                {/* eSewa */}
                {result.reference_code && <InfoRow label="Reference" value={result.reference_code} />}
                {result.status && !result.connectips_status && !result.khalti_status && (
                  <InfoRow label="Status" value={result.status} />
                )}

                {/* ConnectIPS */}
                {result.txn_id && <InfoRow label="TXN ID" value={result.txn_id} />}
                {result.reference_id && <InfoRow label="Reference ID" value={result.reference_id} />}
                {result.amount && <InfoRow label="Amount" value={`NPR ${result.amount}`} />}
                {result.connectips_status && <InfoRow label="ConnectIPS Status" value={result.connectips_status} />}
                {result.status_desc && <InfoRow label="Status Desc" value={result.status_desc} />}

                {/* Khalti */}
                {result.purchase_order_id && <InfoRow label="Purchase Order ID" value={result.purchase_order_id} />}
                {result.pidx && <InfoRow label="PIDX" value={result.pidx} />}
                {result.khalti_status && <InfoRow label="Khalti Status" value={result.khalti_status} />}
                {result.transaction_id && <InfoRow label="Transaction ID" value={result.transaction_id} />}

                {/* Bill / Deposit */}
                {paymentType === "BILL" && result.invoice_no && (
                  <InfoRow label="Invoice No" value={result.invoice_no} />
                )}
                {paymentType === "DEPOSIT" && result.deposit_no && (
                  <InfoRow label="Deposit No" value={result.deposit_no} />
                )}
              </div>
            )}

            {gatewayResponse && <GatewayResponseCard gatewayResponse={gatewayResponse} />}

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              {(isPending || isChecking) && (
                <button
                  type="button"
                  onClick={() => { setResult(null); setGatewayResponse(null); checkStatus(); }}
                  className="bg-[#254a60] text-white px-5 py-3 rounded-xl font-bold"
                >
                  Check Again
                </button>
              )}
              <button
                type="button"
                onClick={() => { window.location.href = backButton.href; }}
                className="bg-[#052f48] text-white px-5 py-3 rounded-xl font-bold"
              >
                {backButton.label}
              </button>
              <button
                type="button"
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

function GatewayResponseCard({ gatewayResponse }) {
  return (
    <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl p-4 text-left text-sm space-y-2">
      <p className="font-black text-[#052f48] mb-2">Gateway Response</p>
      {gatewayResponse.status && <InfoRow label="Status" value={gatewayResponse.status} />}
      {gatewayResponse.statusDesc && <InfoRow label="Status Desc" value={gatewayResponse.statusDesc} />}
      {gatewayResponse.transaction_uuid && <InfoRow label="Transaction UUID" value={gatewayResponse.transaction_uuid} />}
      {gatewayResponse.transaction_code && <InfoRow label="Transaction Code" value={gatewayResponse.transaction_code} />}
      {gatewayResponse.total_amount && <InfoRow label="Total Amount" value={gatewayResponse.total_amount} />}
      {gatewayResponse.product_code && <InfoRow label="Product Code" value={gatewayResponse.product_code} />}
      {gatewayResponse.referenceId && <InfoRow label="Reference ID" value={gatewayResponse.referenceId} />}
      {gatewayResponse.txnId && <InfoRow label="TXN ID" value={gatewayResponse.txnId} />}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}:</span>
      <strong className="text-right break-all text-[#052f48]">{value}</strong>
    </div>
  );
}
