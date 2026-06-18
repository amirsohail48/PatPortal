import { useEffect, useState } from "react";
import PageFooter from "../components/PageFooter";
import PageHeader from "../components/PageHeader";


export default function ArchivedReports() {
  const [patientId, setPatientId] = useState("");
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const [categories, setCategories] = useState({});
  const [activeCategory, setActiveCategory] = useState("Diagnostic Tests");

  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");

  const categoryOrder = [
    "Diagnostic Tests",
    "Radio Diagnostics",
    "General Reports",
    "Past Documents",
    "Scanned Images",
    "Others",
  ];

  const fetchEncounters = async () => {
    const response = await fetch("/api/reports/encounters/", {
      credentials: "include",
    });

    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load encounters");
    }

    setPatientId(data.patient_id || "");
    setEncounters(data.encounters || []);

    if (data.encounters?.length > 0) {
      setSelectedEncounter(data.encounters[0].encounter_id);
      return data.encounters[0].encounter_id;
    }

    return "";
  };

  const fetchReports = async (encounterId = "") => {
    try {
      setReportLoading(true);
      setError("");

      const url = encounterId
        ? `/api/reports/archived/?encounter_id=${encodeURIComponent(encounterId)}`
        : "/api/reports/archived/";

      const response = await fetch(url, {
        credentials: "include",
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load reports");
      }

      setSelectedEncounter(data.encounter_id || encounterId);
      setCategories(data.categories || {});
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const latestEncounter = await fetchEncounters();
        await fetchReports(latestEncounter);
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
    await fetchReports(encounterId);
  };

  const activeReports = categories?.[activeCategory] || [];

  const totalReports = Object.values(categories || {}).reduce((total, reports) => {
    return total + (Array.isArray(reports) ? reports.length : 0);
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Loading archived reports...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <PageHeader
        title="Online Appointment"
      />

      <section className="bg-linear-to-r from-[#052f48] to-[#254a60] text-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
          <div className="lg:col-span-2">
            <h1 className="text-2xl sm:text-3xl font-black">
              Patient Reports
            </h1>
            <p className="text-sm text-gray-200 mt-2">
              View diagnostic, radiology, general, scanned, and historical patient documents.
            </p>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-300">Patient ID:</span>
              <strong>{patientId || "-"}</strong>
            </div>

            <div className="flex justify-between gap-3 mt-1">
              <span className="text-gray-300">Reports:</span>
              <strong className="text-emerald-300">{totalReports}</strong>
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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#052f48] text-white px-5 py-4">
              <h2 className="font-bold text-sm uppercase tracking-wider">
                Report Categories
              </h2>
              <p className="text-xs text-gray-300 mt-1">
                Encounter: {selectedEncounter || "-"}
              </p>
            </div>

            <div className="divide-y divide-gray-100">
              {categoryOrder.map((category) => {
                const count = categories?.[category]?.length || 0;
                const isActive = activeCategory === category;

                return (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`w-full text-left px-5 py-4 flex items-center justify-between transition ${
                      isActive
                        ? "bg-[#254a60]/10 border-l-4 border-[#254a60]"
                        : "hover:bg-gray-50 border-l-4 border-transparent"
                    }`}
                  >
                    <span className="font-bold text-sm text-[#052f48]">
                      {category}
                    </span>
                    <span className="bg-gray-100 text-gray-600 text-xs font-black px-2 py-1 rounded-full">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#254a60] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="font-black text-lg">{activeCategory}</h2>
                <p className="text-xs text-gray-200">
                  {activeReports.length} report(s) available
                </p>
              </div>

              {reportLoading && (
                <span className="text-xs bg-white/10 px-3 py-1 rounded-full">
                  Loading...
                </span>
              )}
            </div>

            {activeReports.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-3xl">
                  📁
                </div>
                <h3 className="text-lg font-black text-[#052f48] mt-4">
                  No Reports Found
                </h3>
                <p className="text-gray-500 mt-1 text-sm">
                  No document is available in this category for selected encounter.
                </p>
              </div>
            ) : (
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeReports.map((report) => (
                  <ReportCard key={report.report_id} report={report} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <PageFooter/>
    </div>
  );
}

function ReportCard({ report }) {
  const icon = report.is_pdf ? "📄" : report.is_image ? "🖼️" : "📎";

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 hover:bg-white hover:shadow-sm transition">
      <div className="flex gap-4">
        <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-2xl shrink-0">
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-black text-[#052f48] truncate">
            {report.title || "Untitled Report"}
          </h3>

          <p className="text-xs text-gray-500 mt-1">
            {report.date || "No date"} | {report.extension?.toUpperCase() || "FILE"} | {report.source}
          </p>

          {report.detail && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">
              {report.detail}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={report.view_url}
              target="_blank"
              rel="noreferrer"
              className="bg-[#052f48] hover:bg-[#254a60] text-white px-4 py-2 rounded-lg text-xs font-bold"
            >
              View
            </a>

            <a
              href={report.download_url}
              className="border border-[#254a60] text-[#052f48] hover:bg-[#254a60] hover:text-white px-4 py-2 rounded-lg text-xs font-bold"
            >
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}