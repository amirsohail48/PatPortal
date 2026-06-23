import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import PageFooter from "../components/PageFooter";

function getStatusStyle(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "solved") {
    return {
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      card: "border-emerald-200 bg-emerald-50/40",
      response: "bg-emerald-50 border-emerald-200 text-emerald-800",
    };
  }

  if (normalized === "rejected") {
    return {
      badge: "bg-red-50 text-red-700 border-red-200",
      card: "border-red-200 bg-red-50/40",
      response: "bg-red-50 border-red-200 text-red-800",
    };
  }

  return {
    badge: "bg-gray-50 text-gray-700 border-gray-200",
    card: "border-gray-200 bg-white",
    response: "bg-gray-50 border-gray-200 text-gray-700",
  };
}

export default function GrievancesFeedback() {
  const [grievances, setGrievances] = useState([]);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchGrievances = async () => {
    try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/patients/grievances/", {
        method: "GET",
        credentials: "include",
        });

        const text = await response.text();

        let data;

        try {
        data = JSON.parse(text);
        } catch {
        throw new Error("Server returned invalid response.");
        }

        if (response.status === 401 || response.status === 403) {
        window.location.href = "/login";
        return;
        }

        if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load grievances");
        }

        setGrievances(data.grievances || []);
    } catch (err) {
        setError(err.message || "Something went wrong");
    } finally {
        setLoading(false);
    }
    };

  const submitGrievance = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError("");

      if (!message.trim()) {
        throw new Error("Please enter your grievance or feedback message.");
      }

      const csrfResponse = await fetch("/api/csrf/", {
        credentials: "include",
      });

      const csrfData = await csrfResponse.json();
      if (!csrfData.csrfToken) {
        throw new Error("Failed to retrieve CSRF token.");
      }

      const response = await fetch("/api/patients/grievances/create/", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfData.csrfToken,
        },
        body: JSON.stringify({
          message,
          contact,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to submit grievance");
      }

      setMessage("");
      setContact("");
      await fetchGrievances();
    } catch (err) {
      setError(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGrievances();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <PageHeader
        title="Online Appointment"
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-linear-to-r from-[#052f48] to-[#254a60] text-white px-5 py-5">
            <h1 className="text-xl font-black">Submit Feedback</h1>
            <p className="text-sm text-gray-200 mt-1">
              Send your grievance or feedback to the hospital.
            </p>
          </div>

          <form onSubmit={submitGrievance} className="p-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-semibold">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-[#052f48] mb-1">
                Contact Number
              </label>
              <input
                type="text"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="Optional contact number"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-[#254a60]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#052f48] mb-1">
                Message
              </label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write your grievance or feedback..."
                rows={6}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-[#254a60] resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#052f48] hover:bg-[#254a60] disabled:opacity-60 text-white px-5 py-3 rounded-xl font-black shadow-md transition"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>
        </section>

        <section className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xl font-black text-[#052f48]">
              My Grievances & Feedback
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Track your submitted messages and hospital responses.
            </p>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-[#052f48] font-bold">
              Loading grievances...
            </div>
          ) : grievances.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500">
              No grievances or feedback submitted yet.
            </div>
          ) : (
            grievances.map((item) => {
              const style = getStatusStyle(item.status);
              const hasResponse = item.response && item.response.trim() !== "";

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border shadow-sm p-5 ${style.card}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-400 font-bold uppercase">
                        Grievance #{item.id}
                      </p>
                      {item.datetime && (
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(item.datetime).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <span
                      className={`inline-flex w-fit border rounded-full px-3 py-1 text-xs font-black uppercase ${style.badge}`}
                    >
                      {item.status_label || item.status}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-black text-gray-400 uppercase">
                      Your Message
                    </p>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                      {item.message || "-"}
                    </p>
                  </div>

                  <div className={`mt-4 border rounded-xl p-4 ${style.response}`}>
                    <p className="text-xs font-black uppercase">
                      
                    </p>

                    {hasResponse ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {item.response}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm">
                        {item.status_message || ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>
      {/* FOOTER */}
      <PageFooter/>
    </div>
  );
}