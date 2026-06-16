import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import PageFooter from "../components/PageFooter";


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

export default function InvoicesReceipts() {
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const [patient, setPatient] = useState(null);
  const [categories, setCategories] = useState({ Invoices: [], Receipts: [] });
  const [totals, setTotals] = useState({});
  const [activeTab, setActiveTab] = useState("Invoices");

  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const fetchEncounters = async () => {
    const response = await fetch("/api/billing/documents/encounters/", {
      credentials: "include",
    });

    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login";
      return "";
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load encounters");
    }

    setEncounters(data.encounters || []);

    if (data.encounters?.length > 0) {
      setSelectedEncounter(data.encounters[0].encounter_id);
      return data.encounters[0].encounter_id;
    }

    return "";
  };

  const fetchDocuments = async (encounterId = "") => {
    try {
      setDocLoading(true);
      setError("");

      const url = encounterId
        ? `/api/billing/documents/?encounter_id=${encodeURIComponent(encounterId)}`
        : "/api/billing/documents/";

      const response = await fetch(url, {
        credentials: "include",
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load invoices and receipts");
      }

      setPatient(data.patient || null);
      setSelectedEncounter(data.encounter_id || encounterId);
      setCategories(data.categories || { Invoices: [], Receipts: [] });
      setTotals(data.totals || {});
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setDocLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const latestEncounter = await fetchEncounters();
        await fetchDocuments(latestEncounter);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleEncounterChange = async (event) => {
    const encounterId = event.target.value;
    setSelectedEncounter(encounterId);
    await fetchDocuments(encounterId);
  };

  const openPreview = async (documentType, billNo) => {
    try {
      setPreviewLoading(true);
      setPreviewOpen(true);
      setPreviewData(null);

      const csrfResponse = await fetch("/api/csrf/", {
        credentials: "include",
      });

      const csrfData = await csrfResponse.json();
      const csrfToken = csrfData.csrfToken || getCookie("csrftoken");

      const response = await fetch("/api/billing/documents/preview/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({
          document_type: documentType,
          bill_no: billNo,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load preview");
      }

      setPreviewData(data);
    } catch (err) {
      setPreviewData({
        error: err.message || "Preview failed",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const activeDocs = categories?.[activeTab] || [];
  const activeTotal = totals?.[activeTab] || {};

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Loading invoices and receipts...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <PageHeader
              title="Invoices and Receipts"
            />

      <section className="bg-gradient-to-r from-[#052f48] to-[#254a60] text-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
          <div className="lg:col-span-2">
            <h1 className="text-2xl sm:text-3xl font-black">
              Billing Documents
            </h1>
            <p className="text-sm text-gray-200 mt-2">
              Preview your invoices and receipts by encounter. Download is not available.
            </p>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-300">Patient:</span>
              <strong>{patient?.patient_name || "-"}</strong>
            </div>

            <div className="flex justify-between gap-3 mt-1">
              <span className="text-gray-300">Patient ID:</span>
              <strong>{patient?.patient_id || "-"}</strong>
            </div>

            <div className="mt-3">
              <label className="block text-xs text-gray-300 mb-1">
                Select Encounter / Visit ID
              </label>
              <select
                value={selectedEncounter}
                onChange={handleEncounterChange}
                className="w-full rounded-lg px-3 py-2 bg-white text-[#052f48] font-semibold outline-none"
              >
                {encounters.map((item) => (
                  <option key={item.encounter_id} value={item.encounter_id}>
                    {item.encounter_id} {item.date ? `(${item.date})` : ""}
                  </option>
                ))}
              </select>
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

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex gap-2">
              {["Invoices", "Receipts"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-black transition ${
                    activeTab === tab
                      ? "bg-[#052f48] text-white"
                      : "bg-white border border-gray-200 text-[#052f48] hover:bg-gray-100"
                  }`}
                >
                  {tab} ({categories?.[tab]?.length || 0})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Summary label="Charged" value={activeTotal.total_amount} />
              <Summary label="Tax" value={activeTotal.tax_amount} />
              <Summary label="Discount" value={activeTotal.discount_amount} />
              <Summary label="Received" value={activeTotal.received_amount} />
            </div>
          </div>

          <div className="bg-[#254a60] text-white px-5 py-4 flex justify-between items-center">
            <div>
              <h2 className="font-black text-lg">{activeTab}</h2>
              <p className="text-xs text-gray-200">
                Encounter: {selectedEncounter || "-"}
              </p>
            </div>

            {docLoading && (
              <span className="text-xs bg-white/10 px-3 py-1 rounded-full">
                Loading...
              </span>
            )}
          </div>

          {activeDocs.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-3xl">
                🧾
              </div>
              <h3 className="text-lg font-black text-[#052f48] mt-4">
                No {activeTab} Found
              </h3>
              <p className="text-gray-500 mt-1 text-sm">
                No billing document is available for selected encounter.
              </p>
            </div>
          ) : (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeDocs.map((doc) => (
                <BillingDocCard
                  key={`${doc.document_type}-${doc.bill_no}`}
                  doc={doc}
                  onPreview={() => openPreview(doc.document_type, doc.bill_no)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <PageFooter/>

      {previewOpen && (
        <PreviewModal
          loading={previewLoading}
          data={previewData}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewData(null);
          }}
        />
      )}
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 min-w-[90px]">
      <p className="text-gray-400">{label}</p>
      <p className="text-[#052f48] font-black">NPR {Number(value || 0).toFixed(2)}</p>
    </div>
  );
}

function BillingDocCard({ doc, onPreview }) {
  const icon = doc.document_type === "INVOICE" ? "📄" : "🧾";

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition">
      <div className="flex gap-4">
        <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-2xl shrink-0">
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-black text-[#052f48] truncate">
            {doc.bill_no || "No Bill No"}
          </h3>

          <p className="text-xs text-gray-500 mt-1">
            {doc.time || "No date"} | {doc.bill_type || "-"} | {doc.component || "-"}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Mini label="Charged" value={doc.charged_amount} />
            <Mini label="Received" value={doc.received_amount} />
          </div>

          <div className="mt-4">
            <button
              onClick={onPreview}
              className="bg-[#052f48] hover:bg-[#254a60] text-white px-4 py-2 rounded-lg text-xs font-bold"
            >
              Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2">
      <p className="text-gray-400">{label}</p>
      <p className="font-black text-[#052f48]">
        {Number(value || 0).toFixed(2)}
      </p>
    </div>
  );
}

function PreviewModal({ loading, data, onClose }) {
  return (
    <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl">
        <div className="bg-gradient-to-r from-[#052f48] to-[#254a60] text-white px-5 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-black">
              {data?.document_type || "Billing Document"} Preview
            </h2>
            <p className="text-xs text-gray-200">
              Preview only. Download is disabled.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-xl"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto max-h-[78vh] p-5">
          {loading ? (
            <p className="text-[#052f48] font-bold">Loading preview...</p>
          ) : data?.error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
              {data.error}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="border border-gray-200 rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-[#052f48]">
                      {data?.document_type}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Bill No: <strong>{data?.bill?.bill_no}</strong>
                    </p>
                    <p className="text-sm text-gray-500">
                      Encounter: <strong>{data?.bill?.encounter_id}</strong>
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-sm text-gray-500">Patient</p>
                    <h4 className="font-black text-[#052f48]">
                      {data?.patient?.patient_name || "-"}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {data?.patient?.patient_id || "-"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Summary label="Item Amount" value={data?.bill?.item_amount} />
                <Summary label="Tax" value={data?.bill?.tax_amount} />
                <Summary label="Discount" value={data?.bill?.discount_amount} />
                <Summary label="Received" value={data?.bill?.received_amount} />
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-[#254a60] text-white px-4 py-3 font-black">
                  Itemized Details
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Disc %</th>
                        <th className="px-4 py-3 text-right">Tax %</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {(data?.items || []).map((item, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#052f48]">
                              {item.item_name || "-"}
                            </p>
                            <p className="text-xs text-gray-400">
                              {item.item_type || "-"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">{item.item_rate}</td>
                          <td className="px-4 py-3 text-right">{item.item_qty}</td>
                          <td className="px-4 py-3 text-right">{item.discount_percent}</td>
                          <td className="px-4 py-3 text-right">{item.tax_percent}</td>
                          <td className="px-4 py-3 text-right font-black text-[#052f48]">
                            {item.amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(data?.items || []).length === 0 && (
                  <div className="p-6 text-center text-gray-500">
                    No itemized details found.
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                This page is for preview only. Download and file export are intentionally disabled.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}