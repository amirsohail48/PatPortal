import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";
import connectIPSLogo from "../assets/connectIPS.png";
import esewaLogo from "../assets/esewa.png";
import khalti from "../assets/khalti.png";



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

function detectPaymentEnvironment() {
  const userAgent = navigator.userAgent || "";

  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const isTouchDevice = navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  const mobileBrowser = isMobileUA && isTouchDevice && isSmallScreen;

  const flutterWebView = /wv|Flutter/i.test(userAgent);

  return {
    userAgent,
    isMobileUA,
    isTouchDevice,
    isSmallScreen,
    mobileBrowser,
    flutterWebView,
  };
}

function openEsewaRcApp(deeplink) {
  if (!deeplink) {
    throw new Error("eSewa RC deeplink not received.");
  }

  console.log("Opening eSewa RC app:", deeplink);

  const link = document.createElement("a");
  link.href = deeplink;
  link.target = "_self";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    window.location.href = deeplink;
  }, 300);
}

function submitConnectIPSForm(actionUrl, fields) {
  if (!actionUrl) {
    throw new Error("connectIPS action URL missing");
  }

  if (!fields || typeof fields !== "object") {
    throw new Error("connectIPS form fields missing");
  }

  const cleanActionUrl = actionUrl.split("?")[0];

  console.log("CONNECTIPS CLEAN POST URL:", cleanActionUrl);
  console.log("CONNECTIPS POST FIELDS:", fields);

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

  setTimeout(() => {
    form.submit();
  }, 100);
}

export default function BillPayment() {
  const [patientId, setPatientId] = useState("");
  const [encounterId, setEncounterId] = useState("");
  const [invoiceGroups, setInvoiceGroups] = useState([]);
  const [selectedArc, setSelectedArc] = useState(null);

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState("ESEWA");

  const fetchPendingBills = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/billing/pending/", {
        method: "GET",
        credentials: "include",
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        console.error("Non-JSON response:", text);
        throw new Error("Server returned invalid response");
      }

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load pending bills");
      }

      setPatientId(data.patient_id || "");
      setEncounterId(data.encounter_id || "");
      setInvoiceGroups(data.invoice_groups || []);

      if (data.invoice_groups?.length > 0) {
        setSelectedArc(data.invoice_groups[0]);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPendingBills();
  }, []);

  const proceedConnectIPS = async (amount, paymentType, remarks, particulars) => {
    try {
      const csrfResponse = await fetch("/api/csrf/", {
        credentials: "include",
      });

      const csrfData = await csrfResponse.json();
      const csrfToken = getCookie("csrftoken") || csrfData.csrfToken;

      const response = await fetch("/api/payments/connectips/initiate/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({
          payment_type: paymentType,
          amount: amount,
          remarks: remarks,
          particulars: particulars,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "connectIPS payment initiation failed");
      }

      localStorage.setItem("last_connectips_payment_id", data.payment_id);
      localStorage.setItem("last_connectips_txn_id", data.txn_id);

      const fields = data.fields || data.form_fields;

      console.log("RAW CONNECTIPS RESPONSE:", data);

      if (!data.action_url || !fields) {
        throw new Error("connectIPS form data not received");
      }

      if (data.action_url.includes("?")) {
        console.warn("connectIPS action_url contains query string:", data.action_url);
      }


      submitConnectIPSForm(data.action_url, fields);

    } catch (error) {
      console.error(error);
      alert(error.message || "connectIPS payment failed");
    }
  };

  const handleProceedPayment = async () => {
    if (!selectedArc?.arc_code) {
      alert("Please select one ARC invoice group first.");
      return;
    }

    try {
      setPaying(true);

      if (selectedPaymentMode === "ESEWA") {
        const env = detectPaymentEnvironment();

        if (env.flutterWebView) {
          alert("Flutter WebView payment flow should be handled separately.");
          return;
        }

        const csrfResponse = await fetch("/api/csrf/", {
          method: "GET",
          credentials: "include",
        });

        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.csrfToken || getCookie("csrftoken");

        const response = await fetch("/api/payments/esewa/bill/initiate/", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
          },
          body: JSON.stringify({
            arc_code: selectedArc.arc_code,
            client_environment: {
              user_agent: env.userAgent,
              mobile_browser: env.mobileBrowser,
              flutter_webview: env.flutterWebView,
              screen_width: window.innerWidth,
              max_touch_points: navigator.maxTouchPoints,
            },
          }),
        });

        const text = await response.text();

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          console.error("Non-JSON payment response:", text);
          throw new Error("Payment server returned invalid response");
        }

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Payment initiation failed");
        }

        localStorage.setItem("latest_payment_id", data.payment_id);
        localStorage.setItem("latest_payment_mode", "ESEWA");
        localStorage.setItem("latest_booking_id", data.booking_id || "");
        localStorage.setItem("latest_correlation_id", data.correlation_id || "");

        if (data.web_payment_action && data.web_payment_fields) {
          console.log("Opening eSewa ePay RC web form");
          submitEsewaWebForm(data.web_payment_action, data.web_payment_fields);
          return;
        }

        if (data.deeplink) {
          console.log("Opening eSewa Intent RC deeplink");
          openEsewaRcApp(data.deeplink);
          return;
        }

        if (data.web_payment_url) {
          window.location.href = data.web_payment_url;
          return;
        }

        throw new Error("No eSewa deeplink or web payment URL received.");
      }

      if (selectedPaymentMode === "CONNECTIPS") {
        if (!selectedArc?.amount || !selectedArc?.arc_code) {
          throw new Error("Selected invoice amount or ARC code is missing.");
        }

        await proceedConnectIPS(
          selectedArc.amount,
          "BILL",
          "Bill Payment",
          `Bill payment for ${selectedArc.arc_code}`
        );

        return;
      }

      alert("Selected payment mode is not available yet.");
    } catch (err) {
      alert(err.message || "Payment failed");
    } finally {
      setPaying(false);
      setShowPaymentModal(false);
    }
  };

  const totalPendingAmount = invoiceGroups.reduce((sum, group) => {
    return sum + Number(group.amount || 0);
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Loading pending bills...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <header className="bg-[#052f48] text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center shadow-sm">
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
                Bill Payment
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              window.location.href = "/home";
            }}
            className="bg-[#254a60] hover:bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <section className="bg-gradient-to-r from-[#052f48] to-[#254a60] text-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2">
            <h1 className="text-2xl sm:text-3xl font-black">
              Pending Bill Payment
            </h1>
            <p className="text-sm text-gray-200 mt-2">
              Select one ARC invoice group and proceed with online payment.
            </p>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-300">Patient ID:</span>
              <strong>{patientId || "-"}</strong>
            </div>

            <div className="flex justify-between gap-3 mt-1">
              <span className="text-gray-300">Encounter:</span>
              <strong>{encounterId || "-"}</strong>
            </div>

            <div className="flex justify-between gap-3 mt-1 border-t border-white/10 pt-2">
              <span className="text-gray-300">Total Pending:</span>
              <strong className="text-emerald-300">
                NPR {totalPendingAmount.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
            {error}
          </div>
        )}

        {invoiceGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <h2 className="text-xl font-black text-[#052f48]">
              No Pending Cash Bills
            </h2>
            <p className="text-gray-500 mt-2">
              There are no eligible bill items available for online payment.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-[#052f48] text-white px-5 py-4">
                <h2 className="font-bold text-sm uppercase tracking-wider">
                  Invoice Groups
                </h2>
                <p className="text-xs text-gray-300 mt-1">
                  Grouped by fldextracol / ARC number
                </p>
              </div>

              <div className="divide-y divide-gray-100">
                {invoiceGroups.map((group) => {
                  const isSelected = selectedArc?.arc_code === group.arc_code;

                  return (
                    <button
                      key={group.arc_code}
                      onClick={() => setSelectedArc(group)}
                      className={`w-full text-left p-4 transition ${
                        isSelected
                          ? "bg-[#254a60]/10 border-l-4 border-[#254a60]"
                          : "hover:bg-gray-50 border-l-4 border-transparent"
                      }`}
                    >
                      <p className="text-sm font-black text-[#052f48] break-all">
                        {group.arc_code}
                      </p>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-gray-500">
                          Invoice Amount
                        </span>
                        <span className="text-sm font-black text-emerald-700">
                          NPR {Number(group.amount || 0).toFixed(2)}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-400 mt-1">
                        {group.items?.length || 0} billing item(s)
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-[#254a60] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-base">Selected Invoice</h2>
                    <p className="text-xs text-gray-200 break-all">
                      {selectedArc?.arc_code || "-"}
                    </p>
                  </div>

                  <div className="bg-white/10 border border-white/10 rounded-xl px-4 py-2">
                    <p className="text-[11px] text-gray-300">Payable Amount</p>
                    <p className="text-xl font-black text-emerald-300">
                      NPR {Number(selectedArc?.amount || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Discount</th>
                        <th className="px-4 py-3 text-right">Tax</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {(selectedArc?.items || []).map((item) => (
                        <tr key={item.fldid} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#052f48]">
                              {item.flditemname || "-"}
                            </p>
                            <p className="text-xs text-gray-400">
                              {item.flditemtype || "-"} | {item.fldbilltype || "-"}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-right">
                            {Number(item.flditemrate || 0).toFixed(2)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {Number(item.flditemqty || 0).toFixed(2)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {Number(item.flddiscamt || 0).toFixed(2)}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {Number(item.fldtaxamt || 0).toFixed(2)}
                          </td>

                          <td className="px-4 py-3 text-right font-black text-[#052f48]">
                            {Number(item.fldditemamt || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden p-4 space-y-3">
                  {(selectedArc?.items || []).map((item) => (
                    <div
                      key={item.fldid}
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                    >
                      <p className="font-black text-[#052f48]">
                        {item.flditemname || "-"}
                      </p>

                      <p className="text-xs text-gray-500 mt-1">
                        {item.flditemtype || "-"} | {item.fldbilltype || "-"}
                      </p>

                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <Info label="Rate" value={item.flditemrate} />
                        <Info label="Qty" value={item.flditemqty} />
                        <Info label="Discount" value={item.flddiscamt} />
                        <Info label="Tax" value={item.fldtaxamt} />
                      </div>

                      <div className="mt-3 flex justify-between border-t border-gray-200 pt-3">
                        <span className="text-gray-500 text-sm">Amount</span>
                        <strong className="text-[#052f48]">
                          NPR {Number(item.fldditemamt || 0).toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>

                {(selectedArc?.items || []).length === 0 && (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    Item details are not available from API. Amount can still be paid
                    using ARC group.
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-[#052f48]">
                    Proceed for Online Payment
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Invoice will be generated only after successful payment.
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (!selectedArc?.arc_code) {
                      alert("Please select one ARC invoice group first.");
                      return;
                    }

                    setShowPaymentModal(true);
                  }}
                  disabled={paying || !selectedArc}
                  className="bg-[#052f48] hover:bg-[#254a60] disabled:opacity-60 text-white px-6 py-3 rounded-xl font-black shadow-md transition"
                >
                  {paying
                    ? "Processing..."
                    : `Pay NPR ${Number(selectedArc?.amount || 0).toFixed(2)}`}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="bg-[#052f48] text-gray-400 text-xs py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:flex sm:justify-between">
          <p>Patan Academy of Health Sciences</p>
          <a href="https://d-codetechnology.com/" className="text-white font-bold underline">
            &copy; 2026 D-Code Technology Pvt. Ltd. All rights reserved.
          </a>
        </div>
      </footer>

      {showPaymentModal && (
        <PaymentModeModal
          selectedArc={selectedArc}
          selectedPaymentMode={selectedPaymentMode}
          setSelectedPaymentMode={setSelectedPaymentMode}
          paying={paying}
          onClose={() => setShowPaymentModal(false)}
          onProceed={handleProceedPayment}
        />
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2">
      <p className="text-gray-400">{label}</p>
      <p className="font-semibold text-[#052f48]">
        {Number(value || 0).toFixed(2)}
      </p>
    </div>
  );
}

function PaymentModeModal({
  selectedArc,
  selectedPaymentMode,
  setSelectedPaymentMode,
  paying,
  onClose,
  onProceed,
}) {
  const paymentModes = [
    {
      id: "ESEWA",
      name: "eSewa",
      desc: "Pay using eSewa wallet or linked services.",
      status: "Available",
      image:esewaLogo,
      disabled: false,
    },
    {
      id: "CONNECTIPS",
      name: "ConnectIPS",
      desc: "Pay directly through bank account using ConnectIPS.",
      status: "Available",
      image: connectIPSLogo,
      disabled: false,
    },
    {
      id: "Khalti",
      name: "Khalti",
      desc: "Pay directly through bank account using ConnectIPS.",
      status: "Coming Soon",
      image: khalti,
      disabled: true,
    },
    {
      id: "CARD",
      name: "Card Payment",
      desc: "Pay using debit or credit card.",
      status: "Coming Soon",
      icon: "💳",
      disabled: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#052f48] to-[#254a60] text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Select Payment Mode</h2>
            <p className="text-xs text-gray-200 mt-1">
              Choose how you want to pay this invoice.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={paying}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase font-bold">
                ARC Invoice No.
              </p>
              <p className="font-black text-[#052f48] break-all">
                {selectedArc?.arc_code || "-"}
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-gray-400 text-xs uppercase font-bold">
                Payable Amount
              </p>
              <p className="font-black text-2xl text-emerald-600">
                NPR {Number(selectedArc?.amount || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {paymentModes.map((mode) => {
            const isSelected = selectedPaymentMode === mode.id;

            return (
              <button
                key={mode.id}
                type="button"
                disabled={mode.disabled || paying}
                onClick={() => setSelectedPaymentMode(mode.id)}
                className={`w-full text-left border rounded-xl p-4 transition flex items-start gap-4 ${
                  isSelected
                    ? "border-[#254a60] bg-[#254a60]/10"
                    : "border-gray-200 hover:border-[#254a60]/40 hover:bg-gray-50"
                } ${
                  mode.disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xl shrink-0">
                  {mode.image ? (
                    <img
                      src={mode.image}
                      alt={mode.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xl">{mode.icon}</span>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-black text-[#052f48]">{mode.name}</h3>

                    <span
                      className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                        mode.disabled
                          ? "bg-gray-100 text-gray-500"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {mode.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 mt-1">{mode.desc}</p>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border-2 mt-1 shrink-0 ${
                    isSelected ? "border-[#052f48] bg-[#052f48]" : "border-gray-300"
                  }`}
                >
                  {isSelected && (
                    <div className="w-full h-full flex items-center justify-center text-white text-xs">
                      ✓
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="px-5 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onProceed}
            disabled={paying}
            className="px-6 py-3 rounded-xl bg-[#052f48] hover:bg-[#254a60] text-white font-black shadow-md transition disabled:opacity-60"
          >
            {paying ? "Processing..." : "Proceed for Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function submitEsewaWebForm(actionUrl, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;

  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}