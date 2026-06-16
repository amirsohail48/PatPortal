import { useEffect, useState } from "react";
import hospitalLogo from "../assets/hospital-logo.png";

export default function PrescriptionPage() {
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [error, setError] = useState("");

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

  const handleDownload = async () => {
    if (!selectedEncounter) {
      alert("Please select encounter first.");
      return;
    }

    try {
      const response = await fetch(
        `/api/reports/clinical/download/?encounter_id=${encodeURIComponent(
          selectedEncounter
        )}`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();

        let errorMessage = "Failed to download report.";

        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `clinical-summary-${selectedEncounter.replaceAll("/", "-")}.pdf`;

      if (contentDisposition && contentDisposition.includes("filename=")) {
        filename = contentDisposition
          .split("filename=")[1]
          .replaceAll('"', "")
          .trim();
      }

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert(error.message || "Download failed.");
    }
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
          <section className="lg:col-span-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#254a60] text-white px-5 py-4">
              <h2 className="font-black text-lg">Prescription</h2>
              <p className="text-xs text-gray-200">
                Preview only from HIS clinical data
              </p>
            </div>

            <div className="p-5">
              <PrescriptionStructuredView summary={summary} />
            </div>
          </section>
        </div>
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

function PrescriptionStructuredView({ summary }) {
  if (!summary) {
    return <Empty message="No prescription data loaded." />;
  }

  return (
    <div className="space-y-5 text-left">
      <PrescriptionSection
        title="OPD Advice"
        value={getTextList(summary.opd_advices, ["flddetail", "detail"])}
      />

      <div className="border border-gray-200 rounded-xl p-4">
        <h3 className="font-black text-[#052f48] mb-3">Diagnosis</h3>

        <PrescriptionSubSection
          title="Provisional Diagnosis"
          value={getTextList(
            summary.diagnosis?.provisional,
            ["fldcode", "fldcodenew", "code"]
          )}
        />

        <PrescriptionSubSection
          title="Final Diagnosis"
          value={getTextList(
            summary.diagnosis?.final,
            ["fldcode", "fldcodenew", "code"]
          )}
        />
      </div>

      <PrescriptionSection
        title="Investigation Advice"
        value={getTextList(
          summary.investigation_advice,
          ["flditemname", "itemname", "item_name"]
        )}
      />

      <PrescriptionSection
        title="Active Medicines"
        value={getMedicineList(summary.active_medications)}
      />

      <PrescriptionSection
        title="Discharge Medicines"
        value={getMedicineList(summary.discharge_medications)}
      />

      <PrescriptionSection
        title="Unavailable Medicines"
        value={getMedicineList(summary.pending_medications)}
      />

      <LaboratoryPrescriptionBlock reports={summary.laboratory || []} />

      <RadioPrescriptionBlock reports={summary.radio_diagnostics || []} />

      <PrescriptionSection
        title="Procedure"
        value={getTextList(
          summary.planned_procedures,
          ["flddetail", "flditem", "fldnewdate"]
        )}
      />

      <GlassPrescriptionTable data={summary.glass_prescription} />
    </div>
  );
}

function PrescriptionSection({ title, value }) {
  if (!value || value === "-") return null;

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <h3 className="font-black text-[#052f48] mb-1">{title}</h3>
      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
        {value}
      </div>
    </div>
  );
}

function PrescriptionSubSection({ title, value }) {
  if (!value || value === "-") return null;

  return (
    <div className="mb-3 last:mb-0">
      <h4 className="font-black text-[#052f48] text-sm">{title}</h4>
      <div className="text-sm text-gray-700 whitespace-pre-wrap">
        {value}
      </div>
    </div>
  );
}

function getTextList(rows, keys = []) {
  if (!rows || rows.length === 0) return "-";

  const values = rows
    .map((row) => {
      for (const key of keys) {
        if (row?.[key]) return cleanHtmlText(row[key]);
      }

      return "";
    })
    .filter(Boolean);

  return values.length ? values.join("\n") : "-";
}

function getMedicineList(rows) {
  if (!rows || rows.length === 0) return "-";

  return rows
    .map((row, index) => {
      const name = row.flditem || row.item || row.flditemname || "-";
      const dose = row.flddose ? ` ${row.flddose}` : "";
      const freq = row.fldfreq ? ` — ${row.fldfreq}` : "";
      const days = row.flddays ? ` for ${row.flddays} days` : "";

      return `${index + 1}. ${name}${dose}${freq}${days}`;
    })
    .join("\n");
}

function LaboratoryPrescriptionBlock({ reports }) {
  if (!reports || reports.length === 0) return null;

  const rows = [];
  

  reports.forEach((report) => {
    const detail = report.details?.[0] || {};

    if (detail.fldtestid || detail.result_value) {
      rows.push({
        testName: detail.fldtestid || report.master?.fldtestid || "-",
        result: detail.result_value || "-",
        range: detail.reference_range || "-",
        status: detail.result_status || "normal",
        isSubtest: false,
      });
    }

    (report.subtests || []).forEach((sub) => {
      rows.push({
        testName: sub.fldsubtest || "-",
        result: sub.result_value || sub.fldreport || "-",
        range: sub.reference_range || sub.fldreference || "-",
        status: sub.result_status || "normal",
        isSubtest: true,
      });
    });
  });

  if (rows.length === 0) return null;

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <h3 className="font-black text-[#052f48] mb-3">Laboratory</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 font-black text-[#052f48]">
                Test Name
              </th>
              <th className="text-left py-2 font-black text-[#052f48]">
                Result
              </th>
              <th className="text-left py-2 font-black text-[#052f48]">
                Range
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => {
              const isAbnormal = row.status === "warning";

              return (
                <tr key={index} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-2 text-gray-700">
                    <span className={row.isSubtest ? "inline-block pl-6" : ""}>
                      {row.isSubtest ? " " : ""}
                      {row.testName}
                    </span>
                  </td>

                  <td
                    className={`py-2 font-black ${
                      isAbnormal ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {cleanHtmlText(row.result)}
                  </td>

                  <td className="py-2 text-gray-700">
                    {row.range}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RadioPrescriptionBlock({ reports }) {
  if (!reports || reports.length === 0) return null;

  const lines = [];

  reports.forEach((report) => {
    (report.subtests || []).forEach((sub) => {
      if (sub.fldsubtest) {
        lines.push(sub.fldsubtest);
      }

      if (sub.fldreport) {
        lines.push(cleanHtmlText(sub.fldreport));
      }
    });

    (report.details || []).forEach((detail) => {
      if (detail.fldreportquali) {
        lines.push(cleanHtmlText(detail.fldreportquali));
      }
    });
  });

  if (lines.length === 0) return null;

  return (
    <PrescriptionSection
      title="Radio Diagnostic"
      value={lines.join("\n")}
    />
  );
}

function cleanHtmlText(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const text = String(value);

  if (!text.includes("<") || !text.includes(">")) {
    return text;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");

  return doc.body.textContent?.trim() || "";
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
