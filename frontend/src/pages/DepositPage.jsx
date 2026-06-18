import { useState } from "react";
import connectIPSLogo from "../assets/connectIPS.png";
import esewaLogo from "../assets/esewa.png";
import khalti from "../assets/khalti.png";
import PageHeader from "../components/PageHeader";
import PageFooter from "../components/PageFooter";
import { getCookie } from "../utils/cookie";

async function getCsrfToken() {
  const existingToken = getCookie("csrftoken");

  if (existingToken) {
    return existingToken;
  }

  const response = await fetch("/api/csrf/", {
    credentials: "include",
  });

  const data = await response.json();

  return getCookie("csrftoken") || data.csrfToken;
}

async function readJsonResponse(response, defaultMessage) {
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(defaultMessage || "Server returned invalid response.");
  }

  if (response.status === 401 || response.status === 403) {
    window.location.href = "/login";
    return null;
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.error || defaultMessage || "Request failed.");
  }

  return data;
}

function submitEsewaWebForm(actionUrl, fields) {
  if (!actionUrl) {
    throw new Error("eSewa payment URL missing.");
  }

  if (!fields || typeof fields !== "object") {
    throw new Error("eSewa payment fields missing.");
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.style.display = "none";

  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value == null ? "" : String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

function submitConnectIPSForm(actionUrl, fields) {
  if (!actionUrl) {
    throw new Error("connectIPS action URL missing.");
  }

  if (!fields || typeof fields !== "object") {
    throw new Error("connectIPS form fields missing.");
  }

  const cleanActionUrl = actionUrl.split("?")[0];

  const form = document.createElement("form");
  form.method = "POST";
  form.action = cleanActionUrl;
  form.enctype = "application/x-www-form-urlencoded";
  form.acceptCharset = "UTF-8";
  form.style.display = "none";

  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value == null ? "" : String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

export default function DepositPage() {
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("ESEWA");
  const [remarks, setRemarks] = useState("Patient Deposit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const quickAmounts = [500, 1000, 2000, 5000, 10000];

  const numericAmount = Number(amount || 0);

  const MAX_DEPOSIT = 500000;

  const handleDepositPayment = async () => {
    setError("");
    if (!numericAmount || numericAmount <= 0) {
      setError("Please enter a valid deposit amount.");
      return;
    }
    if (numericAmount > MAX_DEPOSIT) {
      setError(`Deposit amount cannot exceed NPR ${MAX_DEPOSIT.toLocaleString()}.`);
      return;
    }

    try {
      setLoading(true);

      if (paymentMode === "ESEWA") {
        await startEsewaDepositPayment();
        return;
      }

      if (paymentMode === "CONNECTIPS") {
        await startConnectIPSDepositPayment();
        return;
      }

      throw new Error("Selected payment method is not available.");
    } catch (error) {
      setError(error.message || "Deposit payment failed.");
      setLoading(false);
    }
  };

  const startEsewaDepositPayment = async () => {
    const csrfToken = await getCsrfToken();

    const response = await fetch("/api/payments/esewa/deposit/initiate/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        payment_type: "DEPOSIT",
        amount: numericAmount,
        remarks,
      }),
    });

    const data = await readJsonResponse(
      response,
      "Failed to start eSewa deposit payment."
    );

    if (!data) return;

    sessionStorage.setItem("latest_payment_id", String(data.payment_id || ""));
    sessionStorage.setItem("latest_payment_type", "DEPOSIT");
    sessionStorage.setItem("latest_payment_gateway", "ESEWA");

    if (data.web_payment_action && data.web_payment_fields) {
      submitEsewaWebForm(data.web_payment_action, data.web_payment_fields);
      return;
    }

    if (data.deeplink) {
      window.location.href = data.deeplink;
      return;
    }

    throw new Error("No eSewa payment URL received.");
  };

  const startConnectIPSDepositPayment = async () => {
    const csrfToken = await getCsrfToken();

    const response = await fetch("/api/payments/connectips/initiate/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        payment_type: "DEPOSIT",
        amount: numericAmount,
        remarks,
        particulars: "Patient Deposit",
      }),
    });

    const data = await readJsonResponse(
      response,
      "Failed to start connectIPS deposit payment."
    );

    if (!data) return;

    sessionStorage.setItem("last_connectips_payment_id", String(data.payment_id || ""));
    sessionStorage.setItem("last_connectips_txn_id", String(data.txn_id || ""));
    sessionStorage.setItem("latest_payment_type", "DEPOSIT");
    sessionStorage.setItem("latest_payment_gateway", "CONNECTIPS");

    const fields = data.fields || data.form_fields;

    if (!data.action_url || !fields) {
      throw new Error("connectIPS form data not received.");
    }

    submitConnectIPSForm(data.action_url, fields);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <PageHeader
              title="Deposite Payment"
            />

      <section className="bg-linear-to-r from-[#052f48] to-[#254a60] text-white py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
          <div className="lg:col-span-2">
            <h1 className="text-2xl sm:text-3xl font-black">
              Add Patient Deposit
            </h1>

            <p className="text-sm text-gray-200 mt-2 max-w-2xl">
              Add advance deposit to your hospital account using available online payment methods.
            </p>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-300">Payment Type:</span>
              <strong>Deposit</strong>
            </div>

            <div className="flex justify-between gap-3 mt-1">
              <span className="text-gray-300">Selected Amount:</span>
              <strong className="text-emerald-300">
                NPR {numericAmount > 0 ? numericAmount.toFixed(2) : "0.00"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#254a60] text-white px-5 py-4">
              <h2 className="font-black text-lg">Deposit Details</h2>
              <p className="text-xs text-gray-200">
                Enter deposit amount and select payment method.
              </p>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label className="block text-sm font-black text-[#052f48] mb-2">
                  Deposit Amount
                </label>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                    NPR
                  </span>

                  <input
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="Enter deposit amount"
                    className="w-full rounded-xl border border-gray-300 pl-16 pr-4 py-4 text-lg font-black text-[#052f48] outline-none focus:ring-2 focus:ring-[#254a60]/30 focus:border-[#254a60]"
                  />
                </div>
              </div>

              <div>
                <p className="text-sm font-black text-[#052f48] mb-3">
                  Quick Amount
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {quickAmounts.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAmount(String(value))}
                      className={`rounded-xl border px-4 py-3 text-sm font-black transition ${
                        Number(amount) === value
                          ? "bg-[#052f48] text-white border-[#052f48]"
                          : "bg-gray-50 text-[#052f48] border-gray-200 hover:bg-[#254a60]/10"
                      }`}
                    >
                      NPR {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-black text-[#052f48] mb-2">
                  Remarks
                </label>

                <input
                  type="text"
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Example: Patient Deposit"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#254a60]/30 focus:border-[#254a60]"
                />
              </div>

              <div>
                <p className="text-sm font-black text-[#052f48] mb-3">
                  Select Payment Method
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PaymentModeCard
                    title="eSewa"
                    subtitle="Pay using eSewa wallet."
                    image={esewaLogo}
                    selected={paymentMode === "ESEWA"}
                    onClick={() => setPaymentMode("ESEWA")}
                  />

                  <PaymentModeCard
                    title="ConnectIPS"
                    subtitle="Pay using ConnectIPS ."
                    image={connectIPSLogo}
                    selected={paymentMode === "CONNECTIPS"}
                    onClick={() => setPaymentMode("CONNECTIPS")}
                  />
                  <PaymentModeCard
                    title="Khalti"
                    subtitle="Pay using Khalti Wallet."
                    image={khalti}
                    selected={paymentMode === "KHALTI"}
                    onClick={() => setPaymentMode("KHALTI")}
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-fit">
            <div className="bg-[#052f48] text-white px-5 py-4">
              <h2 className="font-black text-lg">Payment Summary</h2>
              <p className="text-xs text-gray-300">
                Verify amount before payment.
              </p>
            </div>

            <div className="p-5 space-y-4">
              <SummaryRow label="Payment Type" value="Deposit" />
              <SummaryRow
                label="Payment Mode"
                value={paymentMode === "ESEWA" ? "eSewa" : "connectIPS"}
              />
              <SummaryRow label="Remarks" value={remarks || "-"} />

              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 font-bold">Total Payable</span>
                  <strong className="text-2xl text-emerald-600">
                    NPR {numericAmount > 0 ? numericAmount.toFixed(2) : "0.00"}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDepositPayment}
                disabled={loading || numericAmount <= 0}
                className={`w-full rounded-xl px-5 py-4 font-black transition ${
                  loading || numericAmount <= 0
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-[#052f48] text-white hover:bg-[#254a60] shadow-md"
                }`}
              >
                {loading ? "Processing..." : "Proceed to Payment"}
              </button>

              <p className="text-xs text-gray-500 leading-relaxed">
                After successful payment, your deposit will be updated in your hospital account.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <PageFooter/>
    </div>
  );
}

function PaymentModeCard({ title, subtitle, image, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition ${
        selected
          ? "border-[#052f48] bg-[#052f48]/5 shadow-md"
          : "border-gray-200 bg-gray-50 hover:bg-white hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xl">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-contain"
        />
        </div>

        <div className="flex-1">
          <h3 className="font-black text-[#052f48]">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>

        <span
          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
            selected ? "bg-[#052f48] border-[#052f48]" : "bg-white border-gray-300"
          }`}
        >
          {selected && <span className="w-2 h-2 rounded-full bg-white" />}
        </span>
      </div>
    </button>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <strong className="text-[#052f48] text-right break-words">
        {value || "-"}
      </strong>
    </div>
  );
}