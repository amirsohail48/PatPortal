import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";

export default function VisitHistory() {
  const [patient, setPatient] = useState(null);
  const [summary, setSummary] = useState({
    total_visits: 0,
    planned: 0,
    completed: 0,
    cancelled: 0,
  });
  const [visits, setVisits] = useState([]);

  const [loading, setLoading] = useState(true);
  const [visitLoading, setVisitLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchVisits = async () => {
    try {
        setVisitLoading(true);
        setError("");

        const response = await fetch("/api/patients/visit-history/", {
        credentials: "include",
        });

        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
        }

        if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load visit history");
        }

        setPatient(data.patient || null);
        setSummary(data.summary || {});
        setVisits(data.visits || []);
    } catch (err) {
        setError(err.message || "Something went wrong");
    } finally {
        setVisitLoading(false);
    }
    };

    useEffect(() => {
        const init = async () => {
            try {
            setLoading(true);
            await fetchVisits();
            } catch (err) {
            setError(err.message || "Something went wrong");
            } finally {
            setLoading(false);
            }
        };

        init();
        }, []);


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Loading visit history...</p>
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
                Visit History
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
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
          <div className="lg:col-span-2">
            <h1 className="text-2xl sm:text-3xl font-black">
              Patient Visit History
            </h1>
            <p className="text-sm text-gray-200 mt-2 max-w-2xl">
              View department-wise consultation visits, billing mode, status, doctor user,
              follow-up date, and consultation summary.
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
          </div>
        </div>
      </section>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Visits" value={summary.total_visits} />
          <SummaryCard label="Planned" value={summary.planned} />
          <SummaryCard label="Completed" value={summary.completed} />
          <SummaryCard label="Cancelled" value={summary.cancelled} />
        </div>

        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-[#254a60] text-white px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="font-black text-lg">Consultation Visits</h2>
            </div>

            {visitLoading && (
              <span className="text-xs bg-white/10 px-3 py-1 rounded-full">
                Loading...
              </span>
            )}
          </div>

          {visits.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-3xl">
                📅
              </div>
              <h3 className="text-lg font-black text-[#052f48] mt-4">
                No Visits Found
              </h3>
              <p className="text-gray-500 mt-1 text-sm">
                No consultation visit is available for the selected filter.
              </p>
            </div>
          ) : (
            <>
              <DesktopVisitTable visits={visits} />
              <MobileVisitCards visits={visits} />
            </>
          )}
        </section>
      </main>

      <footer className="bg-[#052f48] text-gray-400 text-xs py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:flex sm:justify-between">
          <p>Patan Academy of Health Sciences</p>
          <a href="https://d-codetechnology.com/" className="text-white font-bold underline">
            &copy; 2026 D-Code Technology Pvt. Ltd. All rights reserved.
          </a>
        </div>
      </footer>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <p className="text-xs text-gray-500 font-bold uppercase">{label}</p>
      <p className="text-2xl font-black text-[#052f48] mt-1">{value || 0}</p>
    </div>
  );
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "completed") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (normalized === "cancelled") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  if (normalized === "planned") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  return "bg-gray-50 text-gray-700 border-gray-200";
}

function DesktopVisitTable({ visits }) {
  return (
    <div className="hidden lg:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-left">Consult Date</th>
            <th className="px-4 py-3 text-left">Department</th>
            <th className="px-4 py-3 text-left">Billing Mode</th>
            <th className="px-4 py-3 text-left">Doctor/User</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Follow Up</th>
            <th className="px-4 py-3 text-left">Comment</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {visits.map((visit) => (
            <tr key={visit.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-semibold text-[#052f48] whitespace-nowrap">
                {visit.consult_time || visit.created_time || "-"}
              </td>

              <td className="px-4 py-3">
                <p className="font-black text-[#052f48]">
                  {visit.department || "-"}
                </p>
                <p className="text-xs text-gray-400">
                  {visit.consult_id || visit.encounter_id || "-"}
                </p>
              </td>

              <td className="px-4 py-3">
                {visit.billing_mode || "-"}
              </td>

              <td className="px-4 py-3">
                {visit.doctor_user || visit.ordered_by || "-"}
              </td>

              <td className="px-4 py-3">
                <span
                  className={`px-2 py-1 rounded-full border text-xs font-black ${statusClass(
                    visit.status
                  )}`}
                >
                  {visit.status || "-"}
                </span>
              </td>

              <td className="px-4 py-3">
                {visit.follow_date || "-"}
              </td>

              <td className="px-4 py-3 max-w-xs">
                <p className="line-clamp-2 text-gray-600">
                  {visit.comment || visit.summary || visit.pre_summary || "-"}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileVisitCards({ visits }) {
  return (
    <div className="lg:hidden p-4 space-y-4">
      {visits.map((visit) => (
        <div
          key={visit.id}
          className="border border-gray-200 rounded-xl p-4 bg-gray-50"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-[#052f48]">
                {visit.department || "Consultation"}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {visit.consult_time || visit.created_time || "-"}
              </p>
            </div>

            <span
              className={`px-2 py-1 rounded-full border text-xs font-black ${statusClass(
                visit.status
              )}`}
            >
              {visit.status || "-"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Info label="Encounter" value={visit.encounter_id} />
            <Info label="Billing" value={visit.billing_mode} />
            <Info label="Doctor/User" value={visit.doctor_user || visit.ordered_by} />
            <Info label="Follow Up" value={visit.follow_date} />
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="text-xs uppercase font-bold text-gray-400">Comment</p>
            <p className="text-sm text-gray-600 mt-1">
              {visit.comment || visit.summary || visit.pre_summary || "-"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-400 font-bold">{label}</p>
      <p className="font-semibold text-[#052f48] break-words">{value || "-"}</p>
    </div>
  );
}