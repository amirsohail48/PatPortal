import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";

export default function PrescriptionPage() {
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const [summary, setSummary] = useState(null);
  const [activeSection, setActiveSection] = useState("OPD Advice");
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [error, setError] = useState("");

  const sections = [
    "OPD Advice",
    "Diagnosis",
    "Investigation Advice",
    "Active Medication",
    "Discharge Medication",
    "Unavailable Medicines",
    "Laboratory",
    "Radio Diagnostics",
    "Procedures",
    "Events",
    "Nutrition",
    "Glass Prescription",
  ];

  const fetchEncounters = async () => {
    const response = await fetch("/api/reports/clinical/encounters/", {
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

  const fetchSummary = async (encounterId = "") => {
    try {
      setSectionLoading(true);
      setError("");

      const url = encounterId
        ? `/api/reports/clinical/?encounter_id=${encodeURIComponent(encounterId)}`
        : "/api/reports/clinical/";

      const response = await fetch(url, {
        credentials: "include",
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load clinical summary");
      }

      setSummary(data);
      setSelectedEncounter(data.encounter_id || encounterId);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSectionLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const latestEncounter = await fetchEncounters();
        await fetchSummary(latestEncounter);
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
    await fetchSummary(encounterId);
  };

  const handleDownload = () => {
    if (!selectedEncounter) return;

    window.location.href = `/api/reports/clinical/download/?encounter_id=${encodeURIComponent(
      selectedEncounter
    )}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Loading clinical summary...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <header className="bg-[#052f48] text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center shadow-sm">
              <img src={hospitalLogo} alt="PAHS Logo" className="w-full h-full object-contain" />
            </div>

            <div>
              <span className="text-xs tracking-wider block text-gray-300 uppercase">
                Patan Academy of Health Sciences
              </span>
              <span className="text-base sm:text-lg font-bold block">
                Clinical Summary
              </span>
            </div>
          </div>

          <button
            onClick={() => (window.location.href = "/home")}
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
              OPD Sheet / Clinical Detail
            </h1>
            <p className="text-sm text-gray-200 mt-2">
              Preview diagnosis, treatment advice, investigation reports, medication, procedures, and discharge details.
            </p>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-300">Patient:</span>
              <strong>{summary?.patient?.patient_name || "-"}</strong>
            </div>

            <div className="flex justify-between gap-3 mt-1">
              <span className="text-gray-300">Patient ID:</span>
              <strong>{summary?.patient?.patient_id || "-"}</strong>
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

            <button
              onClick={handleDownload}
              className="mt-3 w-full bg-white text-[#052f48] font-black rounded-lg px-4 py-2 hover:bg-gray-100"
            >
              Download Summary
            </button>
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
                Clinical Sections
              </h2>
              <p className="text-xs text-gray-300 mt-1">
                Encounter: {selectedEncounter || "-"}
              </p>
            </div>

            <div className="divide-y divide-gray-100">
              {sections.map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`w-full text-left px-5 py-4 transition text-sm font-bold ${
                    activeSection === section
                      ? "bg-[#254a60]/10 border-l-4 border-[#254a60] text-[#052f48]"
                      : "hover:bg-gray-50 border-l-4 border-transparent text-gray-600"
                  }`}
                >
                  {section}
                </button>
              ))}
            </div>
          </aside>

          <section className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#254a60] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-black text-lg">{activeSection}</h2>
                <p className="text-xs text-gray-200">
                  Preview only from HIS clinical data
                </p>
              </div>

              {sectionLoading && (
                <span className="text-xs bg-white/10 px-3 py-1 rounded-full">
                  Loading...
                </span>
              )}
            </div>

            <div className="p-5">
              <SectionRenderer section={activeSection} summary={summary} />
            </div>
          </section>
        </div>
      </main>

      <footer className="bg-[#052f48] text-gray-400 text-xs py-5 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:flex sm:justify-between">
          <p>Patan Academy of Health Sciences</p>
          <p className="mt-1 sm:mt-0">&copy; 2026 D-Code Technology Pvt. Ltd.</p>
        </div>
      </footer>
    </div>
  );
}

function SectionRenderer({ section, summary }) {
  if (!summary) {
    return <Empty message="No clinical summary loaded." />;
  }

  if (section === "OPD Advice") {
    return <SimpleTable rows={summary.opd_advices || []} />;
  }

  if (section === "Diagnosis") {
    return (
      <div className="space-y-6">
        <BlockTitle title="Provisional Diagnosis" />
        <SimpleTable rows={summary.diagnosis?.provisional || []} />

        <BlockTitle title="Final Diagnosis" />
        <SimpleTable rows={summary.diagnosis?.final || []} />
      </div>
    );
  }

  if (section === "Investigation Advice") {
    return <SimpleTable rows={summary.investigation_advice || []} />;
  }

  if (section === "Active Medication") {
    return <SimpleTable rows={summary.active_medications || []} />;
  }

  if (section === "Discharge Medication") {
    return <SimpleTable rows={summary.discharge_medications || []} />;
  }

  if (section === "Unavailable Medicines") {
    return <SimpleTable rows={summary.pending_medications || []} />;
  }

  if (section === "Laboratory") {
    return <ReportList reports={summary.laboratory || []} type="LAB" isLab={true} />;
  }

  if (section === "Radio Diagnostics") {
    return <ReportList reports={summary.radio_diagnostics || []} type="RADIO" />;
  }

  if (section === "Procedures") {
    return <SimpleTable rows={summary.planned_procedures || []} />;
  }

  if (section === "Events") {
    return (
      <div className="space-y-6">
        <BlockTitle title="Equipment Usage" />
        <SimpleTable rows={summary.events?.equipment || []} />

        <BlockTitle title="General Events" />
        <SimpleTable rows={summary.events?.general_events || []} />

        <BlockTitle title="Delivery Events" />
        <SimpleTable rows={summary.events?.delivery || []} />

        <BlockTitle title="Procedure Events" />
        <SimpleTable rows={summary.events?.procedures || []} />

        <BlockTitle title="Devices Used" />
        <SimpleTable rows={summary.events?.devices || []} />

        <BlockTitle title="IV Fluids" />
        <SimpleTable rows={summary.iv_fluids || []} />
      </div>
    );
  }

  if (section === "Nutrition") {
    return <SimpleTable rows={summary.nutrition || []} />;
  }

  if (section === "Glass Prescription") {
  return <GlassPrescriptionTable data={summary.glass_prescription} />;
}

  return <Empty message="Section not available." />;
}

function SimpleTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <Empty message="No data available." />;
  }

  return (
    <div className="space-y-4">
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
        >
          {Object.entries(row).map(([key, value]) => (
            <PrescriptionField
              key={key}
              label={formatLabel(key)}
              value={value}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PrescriptionField({ label, value }) {
  return (
    <div className="mb-4 pb-4 border-b border-gray-100 last:border-b-0 last:mb-0 last:pb-0 text-left">
      <p className="font-black text-[#1F4E79] text-sm">
        {label}
      </p>

      <div className="text-gray-700 text-sm mt-1 leading-relaxed whitespace-pre-wrap break-words">
        {formatValue(value)}
      </div>
    </div>
  );
}

function ReportList({ reports, type, isLab = false }) {
  if (!reports || reports.length === 0) {
    return <Empty message="No reported or verified report available." />;
  }

  return (
    <div className="space-y-5">
      {reports.map((report, index) => {
        const detail = report.details?.[0] || {};

        return (
          <div
            key={index}
            className="border border-gray-200 rounded-xl overflow-hidden"
          >

            {/* LAB MAIN RESULT BOX */}
            {isLab && detail.result_value && (

                <div className="p-4 border-b border-gray-100">
                    <LabResultLine
                        testName={report.master?.fldtestid || detail.fldtestid || "Lab Test"}
                        result={detail.result_value}
                        range={detail.reference_range}
                        status={detail.result_status}
                        />
                </div>
            )}

            {/* SUB TESTS */}
            {report.subtests?.length > 0 && (
              <div className="p-4">
                <h4 className="font-bold text-[#052f48] mb-2">Sub Tests</h4>

                {isLab ? (
                  <LabSubtestTable rows={report.subtests} />
                ) : (
                  <SimpleTable rows={report.subtests} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}




function LabSubtestTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <Empty message="No subtest result available." />;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const isWarning = row.result_status === "warning";

        return (
          <div
            key={index}
            className={`grid grid-cols-1 md:grid-cols-4 gap-2 md:items-center border rounded-xl px-4 py-3 ${
              isWarning
                ? "bg-red-50 border-red-200"
                : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <div>
              <p className="text-[11px] uppercase font-bold text-gray-500">
                Test Name
              </p>
              <p className="font-black text-[#052f48]">
                {row.fldsubtest || "-"}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase font-bold text-gray-500">
                Result
              </p>
              <p
                className={`font-black ${
                  isWarning ? "text-red-700" : "text-emerald-700"
                }`}
              >
                {row.result_value || row.fldreport || "-"}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase font-bold text-gray-500">
                Range
              </p>
              <p className="font-bold text-gray-700">
                {row.reference_range || row.fldreference || "-"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LabResultLine({ testName, result, range, unit, status }) {
  const isWarning = status === "warning";

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-4 gap-2 md:items-center border rounded-xl px-4 py-3 ${
        isWarning
          ? "bg-red-50 border-red-200"
          : "bg-emerald-50 border-emerald-200"
      }`}
    >
      <div>
        <p className="text-[11px] uppercase font-bold text-gray-500">
          Test Name
        </p>
        <p className="font-black text-[#052f48]">
          {testName || "-"}
        </p>
      </div>

      <div>
        <p className="text-[11px] uppercase font-bold text-gray-500">
          Result
        </p>
        <p
          className={`font-black ${
            isWarning ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {result || "-"}
        </p>
      </div>

      <div>
        <p className="text-[11px] uppercase font-bold text-gray-500">
          Range
        </p>
        <p className="font-bold text-gray-700">
          {range || "-"}
        </p>
      </div>
    </div>
  );
}

function cleanHtmlText(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const text = String(value);

  // If value does not look like HTML, return normal text
  if (!text.includes("<") || !text.includes(">")) {
    return text;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");

  return doc.body.textContent?.trim() || "-";
}

function BlockTitle({ title }) {
  return (
    <h3 className="text-[#052f48] font-black text-base border-l-4 border-[#254a60] pl-3">
      {title}
    </h3>
  );
}

function GlassPrescriptionTable({ data }) {
  if (
    !data ||
    (
      (!data.prescribed_glass || data.prescribed_glass.length === 0) &&
      (!data.source || data.source.length === 0) &&
      (!data.remarks || data.remarks.length === 0)
    )
  ) {
    return <Empty message="No glass prescription available." />;
  }

  return (
    <div className="space-y-6">
      <GlassTableBlock
        title="Prescribed Glass"
        rows={data.prescribed_glass || []}
      />

      <GlassTextBlock title="Prescribed Glass Source" value={data.source} />
      <GlassTextBlock title="Prescribed Glass Remarks" value={data.remarks} />
      </div>
  );
}

function GlassTableBlock({ title, rows }) {
  if (!rows || rows.length === 0) {
    return null;
  }

  const table = buildDynamicGlassPrescriptionTable(rows);

  if (table.headers.length === 0) {
    return null;
  }

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden bg-white">
      <div className="bg-[#052f48] text-white px-4 py-3">
        <h3 className="font-black text-sm">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-gray-100 text-[#052f48]">
              <th className="border border-gray-300 px-3 py-2 text-center font-black">
                Eye
              </th>

              {table.headers.map((header) => (
                <th
                  key={header}
                  className="border border-gray-300 px-3 py-2 text-center font-black whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="border border-gray-300 px-3 py-2 text-center font-black text-[#052f48]">
                OD<br />
                <span className="text-[10px] font-normal text-gray-500">
                  Right Eye
                </span>
              </td>

              {table.headers.map((header) => (
                <GlassCell key={header} value={table.right[header]} />
              ))}
            </tr>

            <tr>
              <td className="border border-gray-300 px-3 py-2 text-center font-black text-[#052f48]">
                OS<br />
                <span className="text-[10px] font-normal text-gray-500">
                  Left Eye
                </span>
              </td>

              {table.headers.map((header) => (
                <GlassCell key={header} value={table.left[header]} />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildDynamicGlassPrescriptionTable(rows) {
  const headers = [];
  const right = {};
  const left = {};

  rows.forEach((row) => {
    const header = formatGlassHeader(row.label);

    if (!header) return;

    if (!headers.includes(header)) {
      headers.push(header);
    }

    right[header] = row.right || "";
    left[header] = row.left || "";
  });

  return {
    headers,
    right,
    left,
  };
}

function formatGlassHeader(label) {
  return String(label || "")
    .replaceAll("_", " ")
    .replaceAll(";", " - ")
    .trim();
}

function GlassTextBlock({ title, value }) {
  if (!value) return null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="bg-[#052f48] text-white px-4 py-3">
        <h3 className="font-black text-sm">{title}</h3>
      </div>

      <div className="p-4 text-sm text-gray-700 leading-relaxed">
        {value}
      </div>
    </div>
  );
}

function GlassCell({ value }) {
  return (
    <td className="border border-gray-300 px-3 py-2 text-center font-semibold text-blue-900 whitespace-nowrap">
      {formatValue(value) || "-"}
    </td>
  );
}

function Empty({ message }) {
  return (
    <div className="p-8 text-center bg-gray-50 border border-gray-200 rounded-xl">
      <div className="text-3xl mb-2">📋</div>
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );
}


function formatLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("fld", "")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.length ? value.join("\n") : "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return cleanHtmlText(value);
}
