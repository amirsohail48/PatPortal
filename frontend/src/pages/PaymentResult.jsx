import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";
import PageHeader from "../components/PageHeader";
import { getCookie } from "../utils/cookie";

function decodeEsewaData(encodedData) {
  if (!encodedData) {
    return null;
  }

  try {
    const normalized = encodedData.replace(/-/g, "+").replace(/_/g, "/");
    const decodedText = atob(normalized);
    return JSON.parse(decodedText);
  } catch {
    return null;
  }
}

async function readJsonResponse(response, defaultErrorMessage) {
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(defaultErrorMessage || "Server returned invalid response.");
  }

  if (response.status === 401 || response.status === 403) {
    window.location.href = "/login";
    return null;
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || defaultErrorMessage || "Request failed.");
  }

  return data;
}

function getStoredPaymentType() {
  return sessionStorage.getItem("latest_payment_type") || "";
}

function getStoredPaymentGateway() {
  return sessionStorage.getItem("latest_payment_gateway") || "";
}

function clearPaymentStorage(paymentType) {
  sessionStorage.removeItem("latest_payment_id");
  sessionStorage.removeItem("latest_payment_gateway");

  if (paymentType === "APPOINTMENT") {
    sessionStorage.removeItem("latest_payment_type");
    sessionStorage.removeItem("latest_appointment_booking_id");
    sessionStorage.removeItem("latest_appointment_payload");
    sessionStorage.removeItem("last_connectips_payment_id");
    sessionStorage.removeItem("last_connectips_txn_id");
  }
}

function isSuccessStatus(value) {
  return [
    "SUCCESS",
    "COMPLETE",
    "INVOICE_CREATED",
    "DEPOSIT_CREATED",
    "APPOINTMENT_CREATED",
  ].includes(value);
}

function isPendingStatus(value) {
  return ["CHECKING", "PENDING", "BOOKED", "INITIATED", "INCOMPLETE"].includes(
    value
  );
}

function buildSuccessMessage(data) {
  if (data?.booking_confirmation) {
    const queueNumber = data.booking_confirmation.queue_number;

    if (queueNumber) {
      return `Appointment booked successfully. Your queue number is ${queueNumber}.`;
    }

    return "Appointment booked successfully.";
  }

  if (data?.payment_type === "DEPOSIT" || data?.deposit_no) {
    return "Payment successful. Deposit has been processed.";
  }

  if (data?.payment_type === "BILL" || data?.invoice_no) {
    return "Payment successful. Invoice has been processed.";
  }

  return "Payment successful.";
}

export default function PaymentResult() {
  const [status, setStatus] = useState("CHECKING");
  const [message, setMessage] = useState("Checking payment status...");
  const [result, setResult] = useState(null);
  const [gatewayResponse, setGatewayResponse] = useState(null);

  const getCsrfToken = async () => {
    const existingToken = getCookie("csrftoken");

    if (existingToken) {
      return existingToken;
    }

    const csrfResponse = await fetch("/api/csrf/", {
      credentials: "include",
    });

    const csrfData = await csrfResponse.json();

    return getCookie("csrftoken") || csrfData.csrfToken;
  };

  const verifyEpayPayment = async (decodedData) => {
    const csrfToken = await getCsrfToken();

    const response = await fetch("/api/payments/esewa/epay/verify/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        esewa_data: decodedData,
      }),
    });

    const data = await readJsonResponse(
      response,
      "Could not verify eSewa ePay payment."
    );

    if (!data) return;

    setResult(data);
    setStatus(data.status || "FAILED");

    if (isSuccessStatus(data.status)) {
      setStatus("SUCCESS");
      setMessage(buildSuccessMessage(data));
      clearPaymentStorage(data.payment_type);
      return;
    }

    setMessage(`Payment status: ${data.status || "FAILED"}`);
  };

  const checkEsewaIntentStatus = async () => {
    const paymentId = sessionStorage.getItem("latest_payment_id");

    if (!paymentId) {
      setStatus("FAILED");
      setMessage("Payment ID not found. Please check your payment history.");
      return;
    }

    const csrfToken = await getCsrfToken();

    const response = await fetch("/api/payments/esewa/status/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        payment_id: paymentId,
      }),
    });

    const data = await readJsonResponse(
      response,
      "Could not verify eSewa payment status."
    );

    if (!data) return;

    setResult(data);
    setStatus(data.status || "FAILED");

    if (isSuccessStatus(data.status)) {
      setStatus("SUCCESS");
      setMessage(buildSuccessMessage(data));
      clearPaymentStorage(data.payment_type);
      return;
    }

    if (isPendingStatus(data.status)) {
      setMessage("Payment is still pending. Please check again shortly.");
      return;
    }

    setMessage(`Payment status: ${data.status || "FAILED"}`);
  };

  const validateConnectIPSStatus = async (txnIdFromUrl = "") => {
    const txnId =
      txnIdFromUrl ||
      sessionStorage.getItem("last_connectips_txn_id") ||
      sessionStorage.getItem("TXNID");

    if (!txnId) {
      setStatus("FAILED");
      setMessage("connectIPS transaction ID not found.");
      return;
    }

    const csrfToken = await getCsrfToken();

    const response = await fetch("/api/payments/connectips/validate/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        txn_id: txnId,
        TXNID: txnId,
      }),
    });

    const data = await readJsonResponse(
      response,
      "Could not validate connectIPS payment."
    );

    if (!data) return;

    setResult({
      ...data,
      payment_type: getStoredPaymentType() || data.payment_type,
      status: data.is_paid ? "SUCCESS" : data.connectips_status || "FAILED",
    });

    setGatewayResponse(data.validation_response || data.detail_response || null);

    if (data.is_paid) {
      setStatus("SUCCESS");
      setMessage(buildSuccessMessage(data));
      clearPaymentStorage(getStoredPaymentType());
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

  const checkStatus = async () => {
    try {

      const params = new URLSearchParams(window.location.search);

      const encodedEsewaData = params.get("data");

      const txnIdFromUrl =
        params.get("TXNID") ||
        params.get("txn_id") ||
        params.get("txnId") ||
        params.get("REFERENCEID") ||
        params.get("reference_id") ||
        "";

      if (encodedEsewaData) {
        const decodedData = decodeEsewaData(encodedEsewaData);

        if (!decodedData) {
          throw new Error("Invalid eSewa response data.");
        }

        await verifyEpayPayment(decodedData);
        setGatewayResponse(decodedData);
        return;
      }

      if (txnIdFromUrl || getStoredPaymentGateway() === "CONNECTIPS") {
        await validateConnectIPSStatus(txnIdFromUrl);
        return;
      }

      await checkEsewaIntentStatus();
    } catch (error) {
      setStatus("FAILED");
      setMessage(error.message || "Payment verification failed.");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkStatus();
  }, []);

  const paymentType =
    result?.payment_type || getStoredPaymentType() || result?.payment_type || "";

  const bookingConfirmation = result?.booking_confirmation || null;

  const isSuccess = status === "SUCCESS" || isSuccessStatus(status);
  const isPending = isPendingStatus(status);

  const backButton = getBackButton(paymentType);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-3xl overflow-hidden">
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
              Payment Verification
            </span>
          </div>
        </div>

        <div className="p-6 text-center">
          <div
            className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center text-3xl ${
              isSuccess
                ? "bg-emerald-50 text-emerald-600"
                : isPending
                ? "bg-yellow-50 text-yellow-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {isSuccess ? "✓" : isPending ? "…" : "!"}
          </div>

          <h2 className="text-xl font-black text-[#052f48] mt-4">
            {isSuccess ? "SUCCESS" : status}
          </h2>

          <p className="text-gray-600 mt-2">{message}</p>

          {bookingConfirmation && (
            <AppointmentConfirmationCard confirmation={bookingConfirmation} />
          )}

          {gatewayResponse && (
            <GatewayResponseCard gatewayResponse={gatewayResponse} />
          )}

          {result && (
            <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4 text-left text-sm space-y-2">
              <p className="font-black text-[#052f48] mb-2">
                Payment Detail
              </p>

              <InfoRow label="Payment Type" value={paymentType} />
              <InfoRow label="Reference" value={result.reference_code} />
              <InfoRow label="Invoice No" value={result.invoice_no} />
              <InfoRow label="Deposit No" value={result.deposit_no} />
              <InfoRow label="Transaction ID" value={result.txn_id} />
              <InfoRow label="Status" value={result.status || status} />
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => { setStatus("CHECKING"); setMessage("Checking payment status..."); checkStatus(); }}
              className="bg-[#254a60] text-white px-5 py-3 rounded-xl font-bold"
            >
              Check Again
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.href = backButton.href;
              }}
              className="bg-[#052f48] text-white px-5 py-3 rounded-xl font-bold"
            >
              {backButton.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppointmentConfirmationCard({ confirmation }) {
  return (
    <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden text-left">
      <div className="bg-emerald-600 text-white px-5 py-4">
        <h3 className="text-lg font-black">Appointment Confirmed</h3>
        <p className="text-xs text-emerald-100 mt-1">
          Please keep this booking detail for your hospital visit.
        </p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-emerald-100 rounded-xl p-4 text-center">
            <p className="text-xs uppercase text-gray-400 font-bold">
              Queue Number
            </p>
            <p className="text-4xl font-black text-emerald-700 mt-2">
              {confirmation.queue_number || "-"}
            </p>
          </div>

          <div className="bg-white border border-emerald-100 rounded-xl p-4 text-center">
            <p className="text-xs uppercase text-gray-400 font-bold">
              Expected Time
            </p>
            <p className="text-3xl font-black text-[#052f48] mt-2">
              {confirmation.expected_time || "-"}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <InfoRow label="Booking ID" value={confirmation.booking_id} />
          <InfoRow label="Department" value={confirmation.department} />
          <InfoRow label="Group" value={confirmation.group} />
          <InfoRow label="Scheme" value={confirmation.scheme} />
          <InfoRow label="Date" value={formatDate(confirmation.consult_date)} />
          <InfoRow label="Service" value={confirmation.item_name} />
          <InfoRow
            label="Amount"
            value={
              confirmation.item_cost
                ? `NPR ${formatMoney(confirmation.item_cost)}`
                : "-"
            }
          />
        </div>

        <div className="mt-5 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-sm font-bold">
          {confirmation.advisory || "Please arrive 15 minutes early."}
        </div>
      </div>
    </div>
  );
}

function GatewayResponseCard({ gatewayResponse }) {
  return (
    <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl p-4 text-left text-sm space-y-2">
      <p className="font-black text-[#052f48] mb-2">Gateway Response</p>

      <InfoRow label="Status" value={gatewayResponse.status} />
      <InfoRow label="Status Desc" value={gatewayResponse.statusDesc} />
      <InfoRow
        label="Transaction UUID"
        value={gatewayResponse.transaction_uuid}
      />
      <InfoRow
        label="Transaction Code"
        value={gatewayResponse.transaction_code}
      />
      <InfoRow label="Total Amount" value={gatewayResponse.total_amount} />
      <InfoRow label="Product Code" value={gatewayResponse.product_code} />
      <InfoRow label="Reference ID" value={gatewayResponse.referenceId} />
      <InfoRow label="TXN ID" value={gatewayResponse.txnId} />
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}:</span>
      <strong className="text-right break-all text-[#052f48]">
        {value || "-"}
      </strong>
    </div>
  );
}

function getBackButton(paymentType) {
  if (paymentType === "APPOINTMENT") {
    return {
      label: "Back to Appointment",
      href: "/appointment",
    };
  }

  if (paymentType === "DEPOSIT") {
    return {
      label: "Back to Deposit",
      href: "/deposit",
    };
  }

  return {
    label: "Back to Bills",
    href: "/bill-payment",
  };
}

function formatMoney(value) {
  const numberValue = Number(value || 0);

  if (Number.isNaN(numberValue)) {
    return "0.00";
  }

  return numberValue.toFixed(2);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}