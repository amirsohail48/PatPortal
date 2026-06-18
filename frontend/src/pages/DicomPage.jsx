import { useEffect, useMemo, useState } from "react";
import PageFooter from "../components/PageFooter";
import PageHeader from "../components/PageHeader";


export default function DicomPage() {
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState("");

  const [studies, setStudies] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [series, setSeries] = useState([]);
  const [selectedXrayName, setSelectedXrayName] = useState("");
  const [selectedStudyDate, setSelectedStudyDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [studyLoading, setStudyLoading] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredStudies = useMemo(() => {
    return studies.filter((study) => {
      const studyName = String(study.description || "").trim();
      const studyDate = formatDicomDate(study.study_date);

      const nameMatched = !selectedXrayName || studyName === selectedXrayName;
      const dateMatched = !selectedStudyDate || studyDate === selectedStudyDate;

      return nameMatched && dateMatched;
    });
  }, [studies, selectedXrayName, selectedStudyDate]);

  const availableXrayNames = useMemo(() => {
    return Array.from(
      new Set(
        studies
          .map((study) => String(study.description || "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [studies]);

  const availableStudyDates = useMemo(() => {
    return Array.from(
      new Set(
        studies
          .map((study) => formatDicomDate(study.study_date))
          .filter(Boolean)
      )
    ).sort();
  }, [studies]);

  const fetchEncounters = async () => {
    const response = await fetch("/api/pacs/encounters/", {
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
      const firstEncounter = data.encounters[0].encounter_id;
      setSelectedEncounter(firstEncounter);
      return firstEncounter;
    }

    return "";
  };
  
  const clearStudyFilters = () => {
    setSelectedXrayName("");
    setSelectedStudyDate("");
    setSelectedStudy(null);
    setSeries([]);
  };

  const openPacsApp = async () => {
  if (!selectedEncounter) {
    setError("Please select encounter first.");
    return;
  }

  try {
    const response = await fetch(
      `/api/pacs/launch-url/?encounter_id=${encodeURIComponent(selectedEncounter)}`,
      {
        credentials: "include",
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to open PACS");
    }

    window.open(data.launch_url, "_blank", "noopener,noreferrer");
  } catch (error) {
    setError(error.message || "Unable to open PACS app");
  }
};

  const fetchStudies = async (encounterId) => {
    if (!encounterId) {
      setStudies([]);
      setSelectedStudy(null);
      setSeries([]);
      return;
    }

    try {
      setStudyLoading(true);
      setError("");

      const response = await fetch(
        `/api/pacs/studies/?encounter_id=${encodeURIComponent(encounterId)}`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load DICOM studies");
      }

      const studyList = data.studies || [];

      setStudies(studyList);
      setSelectedStudy(null);
      setSeries([]);

      // Auto-load first DICOM image after studies are loaded
      if (studyList.length > 0) {
        setTimeout(() => {
          fetchSeries(studyList[0]);
        }, 100);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setStudyLoading(false);
    }
  };

  const fetchSeries = async (study) => {
    if (!study?.id) return;

    try {
      setSelectedStudy(study);
      setSeriesLoading(true);
      setError("");

      const response = await fetch(`/api/pacs/series/${study.id}/`, {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load DICOM series");
      }

      setSeries(data.series || []);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSeriesLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setError("");

        const firstEncounter = await fetchEncounters();

        // First show frontend
        setLoading(false);

        // Then load DICOM studies after page is already visible
        if (firstEncounter) {
          setTimeout(() => {
            fetchStudies(firstEncounter);
          }, 100);
        }
      } catch (err) {
        setError(err.message || "Something went wrong");
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleEncounterChange = async (event) => {
    const encounterId = event.target.value;

    setSelectedEncounter(encounterId);
    setSelectedXrayName("");
    setSelectedStudyDate("");
    setSelectedStudy(null);
    setSeries([]);

    await fetchStudies(encounterId);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <PageHeader
        title="Online Appointment"
      />

      <section className="bg-linear-to-r from-[#052f48] to-[#254a60] text-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
          <div className="lg:col-span-2">
            <h1 className="text-2xl sm:text-3xl font-black">
              PACS / DICOM Image Viewer
            </h1>
            <p className="text-sm text-gray-200 mt-2 max-w-2xl">
              Select an encounter ID to retrieve available radiology images from the
              Orthanc PACS server.
            </p>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-sm">
            <label className="block text-xs text-gray-300 mb-1">
              Encounter / Visit ID
            </label>

            {loading ? (
              <div className="w-full rounded-lg px-3 py-3 bg-white text-[#052f48] font-semibold">
                Loading encounters...
              </div>
            ) : (
              <select
                value={selectedEncounter}
                onChange={handleEncounterChange}
                className="w-full rounded-lg px-3 py-3 bg-white text-[#052f48] font-semibold outline-none"
              >
                {encounters.length === 0 && (
                  <option value="">No encounter found</option>
                )}

                {encounters.map((item) => (
                  <option key={item.encounter_id} value={item.encounter_id}>
                    {item.encounter_id} {item.date ? `(${item.date})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#052f48] text-white px-5 py-4">
              <h2 className="font-black text-lg">DICOM Studies</h2>
              <p className="text-xs text-gray-300 mt-1">
                Encounter: {selectedEncounter || "-"}
              </p>
            </div>

            {studyLoading ? (
              <LoadingBox message="Searching PACS studies..." />
            ) : studies.length === 0 ? (
              <EmptyBox
                icon="🩻"
                title="No DICOM Study Found"
                message="No PACS image is linked with this encounter ID."
              />
            ) : (
              <>
                <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 font-bold mb-1">
                      Select X-ray Name
                    </label>

                    <select
                      value={selectedXrayName}
                      onChange={(event) => {
                        setSelectedXrayName(event.target.value);
                        setSelectedStudy(null);
                        setSeries([]);
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#254a60] bg-white"
                    >
                      <option value="">All X-ray Names</option>

                      {availableXrayNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 font-bold mb-1">
                      Select Study Date
                    </label>

                    <select
                      value={selectedStudyDate}
                      onChange={(event) => {
                        setSelectedStudyDate(event.target.value);
                        setSelectedStudy(null);
                        setSeries([]);
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#254a60] bg-white"
                    >
                      <option value="">All Study Dates</option>

                      {availableStudyDates.map((date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(selectedXrayName || selectedStudyDate) && (
                    <button
                      type="button"
                      onClick={clearStudyFilters}
                      className="w-full bg-[#052f48] text-white rounded-lg px-3 py-2 text-sm font-bold"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {filteredStudies.length === 0 ? (
                  <EmptyBox
                    icon="🔎"
                    title="No Matching Study"
                    message="No DICOM study matched your selected filter."
                  />
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredStudies.map((study) => {
                      const isSelected = selectedStudy?.id === study.id;

                      return (
                        <button
                          key={study.id}
                          onClick={() => fetchSeries(study)}
                          className={`w-full text-left p-4 transition ${
                            isSelected
                              ? "bg-[#254a60]/10 border-l-4 border-[#254a60]"
                              : "hover:bg-gray-50 border-l-4 border-transparent"
                          }`}
                        >
                          <p className="font-black text-[#052f48]">
                            {study.description || "DICOM Study"}
                          </p>

                          <p className="text-xs text-gray-500 mt-1">
                            Study Date: {formatDicomDate(study.study_date) || "-"}
                          </p>

                          <p className="text-xs text-gray-500 mt-1">
                            Accession: {study.accession_number || "-"}
                          </p>

                          <p className="text-xs text-gray-400 mt-2">
                            {study.series_count || 0} series
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#254a60] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="font-black text-lg">
                  {selectedStudy?.description || "Image Preview"}
                </h2>
                <p className="text-xs text-gray-200">
                  {selectedStudy
                    ? `Study ID: ${selectedStudy.study_instance_uid || selectedStudy.id}`
                    : "Select a study to preview image series"}
                </p>
              </div>

              {selectedStudy?.orthanc_viewer_url && (
                <button
                    onClick={openPacsApp}
                    className="bg-[#052f48] hover:bg-[#254a60] text-white px-5 py-3 rounded-xl font-black shadow-md transition"
                    >
                    Open PACS Image
                </button>
              )}
            </div>

            {!selectedStudy ? (
              <EmptyBox
                icon="🖼️"
                title="Select a Study"
                message="Choose one DICOM study from the left panel to view available image series."
              />
            ) : seriesLoading ? (
              <LoadingBox message="Loading image series..." />
            ) : series.length === 0 ? (
              <EmptyBox
                icon="🩻"
                title="No Series Found"
                message="This study does not contain visible image series."
              />
            ) : (
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                {series.map((item) => (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-2xl overflow-hidden bg-gray-50"
                  >
                    <div className="h-56 bg-black flex items-center justify-center">
                      {item.first_instance_id ? (
                        <>
                          <img
                            src={`/api/pacs/preview/${item.first_instance_id}/`}
                            alt={item.description || "DICOM Preview"}
                            className="max-h-full max-w-full object-contain"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                              const errorText = event.currentTarget.parentElement.querySelector(".preview-error");
                              if (errorText) errorText.classList.remove("hidden");
                            }}
                          />

                          <span className="preview-error hidden text-white text-sm px-4 text-center">
                            Image preview is currently unavailable. Please try again later.
                          </span>
                        </>
                      ) : (
                        <span className="text-white text-sm">No preview available</span>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="font-black text-[#052f48]">
                        {item.description || "Unnamed Series"}
                      </h3>

                      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                        <Info label="Modality" value={item.modality} />
                        <Info label="Series No." value={item.series_number} />
                        <Info label="Instances" value={item.instances_count} />
                        <Info label="Series ID" value={item.id} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      {/* FOOTER */}
      <PageFooter/>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase text-gray-400 font-bold">{label}</p>
      <p className="font-semibold text-[#052f48] break-words">
        {value || "-"}
      </p>
    </div>
  );
}

function EmptyBox({ icon, title, message }) {
  return (
    <div className="p-10 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-3xl">
        {icon}
      </div>
      <h3 className="text-lg font-black text-[#052f48] mt-4">{title}</h3>
      <p className="text-gray-500 mt-1 text-sm">{message}</p>
    </div>
  );
}

function LoadingBox({ message }) {
  return (
    <div className="p-10 text-center">
      <p className="text-[#052f48] font-bold">{message}</p>
    </div>
  );
}

function formatDicomDate(value) {
  if (!value) return "";

  const text = String(value);

  if (text.length !== 8) return text;

  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}