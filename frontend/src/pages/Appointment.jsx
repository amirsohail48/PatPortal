import { useEffect, useMemo, useState } from "react";
import esewaLogo from "../assets/esewa.png"
import connectipsLogo from "../assets/connectIPS.png"
import khaltiLogo from "../assets/khaltiLogo.png"
import PageHeader from "../components/PageHeader";
import { getCookie } from "../utils/cookie";
import PageFooter from "../components/PageFooter";

const GROUP_DESCRIPTIONS = {
  "General OPD":
    "07:00 - 16:00. Saturday is off for all OPDs. Wednesday Male OPD & Female OPD opens and other OPDs close.",
  PPC: "Private clinic with higher price started from 8:00 AM - 16:00 every day except Wednesday & Saturday.",
  PPP: "Private clinic with higher price started from 16:00 - 19:00 every day except Wednesday & Saturday. Wednesday PPP is 8:00 - 12:00 noon.",
};

async function getCsrfToken() {
  const existingToken = getCookie("csrftoken");

  if (existingToken) {
    return existingToken;
  }

  try {
    const response = await fetch("/api/csrf/", {
      credentials: "include",
    });

    const data = await response.json();

    return data.csrfToken || getCookie("csrftoken");
  } catch {
    return getCookie("csrftoken");
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

function buildQuery(params) {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      query.append(key, value);
    }
  });

  const queryString = query.toString();

  return queryString ? `?${queryString}` : "";
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

export default function AppointmentPage() {
  const [groupOptions, setGroupOptions] = useState([]);
  const [quotas, setQuotas] = useState([]);

  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedScheme, setSelectedScheme] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedConsultant, setSelectedConsultant] = useState("");
  const [selectedQuotaId, setSelectedQuotaId] = useState("");

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState("ESEWA");

  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  const selectedQuota = useMemo(() => {
    return quotas.find((item) => String(item.id) === String(selectedQuotaId));
  }, [quotas, selectedQuotaId]);

  const schemeOptions = useMemo(() => {
    return uniqueValues(quotas.map((item) => item.scheme || "%"));
  }, [quotas]);

  const departmentCards = useMemo(() => {
    const departments = uniqueValues(quotas.map((item) => item.department));

    return departments.map((department) => ({
      department,
    }));
  }, [quotas]);

  const availableSlots = useMemo(() => {
    return quotas
      .filter((item) => {
        if (selectedDepartment && item.department !== selectedDepartment) {
          return false;
        }

        if (
          selectedConsultant &&
          String(item.consultant_id || "") !== String(selectedConsultant)
        ) {
          return false;
        }

        return true;
      })
      .sort((first, second) => {
        const firstKey = `${first.consult_date || ""} ${first.start_time || ""}`;
        const secondKey = `${second.consult_date || ""} ${second.start_time || ""}`;

        return firstKey.localeCompare(secondKey);
      });
  }, [quotas, selectedDepartment, selectedConsultant]);
  
  const loadQuotaOptions = async (params = {}) => {
    const response = await fetch(
      `/api/appointments/quota-options/${buildQuery(params)}`,
      {
        credentials: "include",
      }
    );

    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login";
      return [];
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load appointment options");
    }

    return data.quotas || [];
  };

  const initializePage = async () => {
    try {
      setLoading(true);
      setError("");
      
      const initialQuotas = await loadQuotaOptions({});

      setQuotas(initialQuotas);
      setGroupOptions(buildGroupOptions(initialQuotas));
    } catch (err) {
      setError(err.message || "Failed to load appointment options.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initializePage();
  }, []);


  const handleSelectGroup = async (group) => {
    try {
      setLoadingOptions(true);
      setError("");

      setSelectedGroup(group);
      setSelectedScheme("");
      setSelectedDepartment("");
      setSelectedConsultant("");
      setSelectedQuotaId("");

      const groupQuotas = await loadQuotaOptions({ group });
      setQuotas(groupQuotas);

      const nextSchemes = uniqueValues(
        groupQuotas.map((item) => item.scheme || "%")
      );

      if (nextSchemes.length === 1) {
        const autoScheme = nextSchemes[0];

        setSelectedScheme(autoScheme);

        const schemeQuotas = await loadQuotaOptions({
          group,
          scheme: autoScheme,
        });

        setQuotas(schemeQuotas);
      }
    } catch (err) {
      setError(err.message || "Failed to load scheme options.");
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSelectScheme = async (scheme) => {
    try {
      setLoadingOptions(true);
      setError("");

      setSelectedScheme(scheme);
      setSelectedDepartment("");
      setSelectedConsultant("");
      setSelectedQuotaId("");

      const schemeQuotas = await loadQuotaOptions({
        group: selectedGroup,
        scheme,
      });

      setQuotas(schemeQuotas);
    } catch (err) {
      setError(err.message || "Failed to load department options.");
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSelectDepartment = async (department) => {
    try {
      setLoadingOptions(true);
      setError("");

      setSelectedDepartment(department);
      setSelectedConsultant("");
      setSelectedQuotaId("");

      const departmentQuotas = await loadQuotaOptions({
        group: selectedGroup,
        scheme: selectedScheme,
        department,
      });

      const nextConsultants = buildConsultantOptions(departmentQuotas);

      if (nextConsultants.length === 1) {
        const autoConsultant = nextConsultants[0].value;

        setSelectedConsultant(autoConsultant);

        const consultantQuotas = await loadQuotaOptions({
          group: selectedGroup,
          scheme: selectedScheme,
          department,
          consultant: autoConsultant,
        });

        setQuotas(consultantQuotas);
        return;
      }

      setQuotas(departmentQuotas);
    } catch (err) {
      setError(err.message || "Failed to load consultant options.");
    } finally {
      setLoadingOptions(false);
    }
  };
  const handleSelectConsultant = async (consultantId) => {
    try {
      setLoadingOptions(true);
      setError("");

      setSelectedConsultant(consultantId);
      setSelectedQuotaId("");

      const consultantQuotas = await loadQuotaOptions({
        group: selectedGroup,
        scheme: selectedScheme,
        department: selectedDepartment,
        consultant: consultantId,
      });

      setQuotas(consultantQuotas);
    } catch (err) {
      setError(err.message || "Failed to load date slots.");
    } finally {
      setLoadingOptions(false);
    }
  };

  const clearSelection = async () => {
    try {
      setLoadingOptions(true);
      setError("");

      setSelectedGroup("");
      setSelectedScheme("");
      setSelectedDepartment("");
      setSelectedConsultant("");
      setSelectedQuotaId("");

      const initialQuotas = await loadQuotaOptions({});
      setQuotas(initialQuotas);
      setGroupOptions(buildGroupOptions(initialQuotas));
    } catch (err) {
      setError(err.message || "Failed to reset appointment form.");
    } finally {
      setLoadingOptions(false);
    }
  };

  const getAppointmentPayload = () => {
    return {
      quota_id: selectedQuota?.id,
      group: selectedGroup,
      scheme: selectedScheme,
      department: selectedDepartment,

      consultant_id: selectedQuota?.consultant_id || selectedConsultant || "",
      consultant:
        selectedQuota?.consultant_name ||
        selectedQuota?.consultant ||
        "Any Consultant",

      consult_date: selectedQuota?.consult_date,
      consult_start: selectedQuota?.start_time,
      consult_end: selectedQuota?.end_time,
      duration: selectedQuota?.duration,
      item_name: selectedQuota?.item_name,
      item_cost: selectedQuota?.item_cost,
    };
  };

  const consultantOptions = useMemo(() => {
  if (!selectedGroup || !selectedScheme || !selectedDepartment) {
    return [];
  }

  return buildConsultantOptions(quotas);
}, [quotas, selectedGroup, selectedScheme, selectedDepartment]);

  const handleSubmitAppointment = () => {
    setError("");
    if (!selectedGroup) {
      setError("Please select group.");
      return;
    }

    if (!selectedScheme) {
      setError("Please select scheme.");
      return;
    }

    if (!selectedDepartment) {
      setError("Please select department.");
      return;
    }

    if (consultantOptions.length > 0 && !selectedConsultant) {
      setError("Please select consultant.");
      return;
    }

    if (!selectedQuota) {
      setError("Please select appointment date/slot.");
      return;
    }

    if (Number(selectedQuota.remaining_slots || 0) <= 0) {
      setError("No slot available for selected appointment.");
      return;
    }

    setShowPreviewModal(true);
  };

  const proceedEsewaPayment = async () => {
    const csrfToken = await getCsrfToken();
    const appointmentPayload = getAppointmentPayload();

    const response = await fetch("/api/payments/esewa/appointment/initiate/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        payment_type: "APPOINTMENT",
        amount: selectedQuota.item_cost,
        appointment: appointmentPayload,
      }),
    });

    const data = await readJsonResponse(
      response,
      "Failed to start eSewa appointment payment."
    );

    if (!data) return;

    sessionStorage.setItem("latest_payment_id", String(data.payment_id || ""));
    sessionStorage.setItem("latest_payment_type", "APPOINTMENT");
    sessionStorage.setItem("latest_payment_gateway", "ESEWA");
    sessionStorage.setItem(
      "latest_appointment_booking_id",
      String(data.appointment_booking_id || "")
    );
    sessionStorage.setItem(
      "latest_appointment_payload",
      JSON.stringify(data.appointment || appointmentPayload)
    );

    if (data.web_payment_action && data.web_payment_fields) {
      submitEsewaWebForm(data.web_payment_action, data.web_payment_fields);
      return;
    }

    if (data.deeplink) {
      window.location.href = data.deeplink;
      return;
    }

    if (data.web_payment_url) {
      window.location.href = data.web_payment_url;
      return;
    }

    throw new Error("No eSewa payment URL received.");
  };

  const proceedConnectIPSPayment = async () => {
    const csrfToken = await getCsrfToken();
    const appointmentPayload = getAppointmentPayload();

    const response = await fetch("/api/payments/connectips/initiate/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        payment_type: "APPOINTMENT",
        amount: selectedQuota.item_cost,
        remarks: "Appointment Payment",
        particulars: `Appointment for ${selectedDepartment}`,
        appointment: appointmentPayload,
      }),
    });

    const data = await readJsonResponse(
      response,
      "Failed to start connectIPS appointment payment."
    );

    if (!data) return;

    sessionStorage.setItem("last_connectips_payment_id", String(data.payment_id || ""));
    sessionStorage.setItem("last_connectips_txn_id", String(data.txn_id || ""));
    sessionStorage.setItem("latest_payment_type", "APPOINTMENT");
    sessionStorage.setItem("latest_payment_gateway", "CONNECTIPS");
    sessionStorage.setItem(
      "latest_appointment_payload",
      JSON.stringify(appointmentPayload)
    );

    const fields = data.fields || data.form_fields;

    if (!data.action_url || !fields) {
      throw new Error("connectIPS form data not received.");
    }

    submitConnectIPSForm(data.action_url, fields);
  };

  const handleProceedPayment = async () => {
    try {
      setPaying(true);

      if (!selectedQuota) {
        throw new Error("Appointment detail missing.");
      }

      if (Number(selectedQuota.item_cost || 0) <= 0) {
        throw new Error("Invalid appointment amount.");
      }

      if (selectedPaymentMode === "ESEWA") {
        await proceedEsewaPayment();
        return;
      }

      if (selectedPaymentMode === "CONNECTIPS") {
        await proceedConnectIPSPayment();
        return;
      }

      throw new Error("Selected payment mode is not available yet.");
    } catch (err) {
      setError(err.message || "Payment failed.");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-[#052f48] font-bold">Loading appointment options...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <PageHeader
        title="Online Appointment"
      />

      {/* <header className="bg-[#052f48] text-white shadow-md sticky top-0 z-50">
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
                Online Appointment
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/home";
            }}
            className="bg-[#254a60] hover:bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </header> */}

      <section className="bg-gradient-to-r from-[#052f48] to-[#254a60] text-white py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
          <div className="lg:col-span-2">
            <h1 className="text-2xl sm:text-3xl font-black">
              Book Appointment
            </h1>
            <p className="text-sm text-gray-200 mt-2 max-w-2xl">
              Select group, scheme, department,consultant and appointment date. Payment is
              required before final booking confirmation.
            </p>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-xl p-4 text-sm">
            <SummaryRow label="Group" value={selectedGroup} />
            <SummaryRow label="Scheme" value={displayScheme(selectedScheme)} />
            <SummaryRow label="Department" value={selectedDepartment} />
            <SummaryRow
              label="Payable"
              value={`NPR ${formatMoney(selectedQuota?.item_cost)}`}
              highlight
            />
          </div>
        </div>
      </section>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StepProgress
          selectedGroup={selectedGroup}
          selectedScheme={selectedScheme}
          selectedDepartment={selectedDepartment}
          selectedConsultant={selectedConsultant}
          selectedQuota={selectedQuota}
        />

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-semibold">
            {error}
          </div>
        )}

        {loadingOptions && (
          <div className="mb-6 bg-blue-50 border border-blue-100 text-[#052f48] rounded-xl p-4 text-sm font-bold">
            Loading next appointment options...
          </div>
        )}

        <div className="space-y-6">
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <SectionHeader
              number="1"
              title="Select Category / Group"
              subtitle="Choose the patient appointment category."
            />

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {groupOptions.length === 0 ? (
                <EmptyState message="No appointment category available." />
              ) : (
                groupOptions.map((group) => (
                  <GroupCard
                    key={group.value}
                    group={group}
                    selected={selectedGroup === group.value}
                    onClick={() => handleSelectGroup(group.value)}
                    disabled={loadingOptions}
                  />
                ))
              )}
            </div>
          </section>

          {selectedGroup && (
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader
                number="2"
                title="Select Scheme"
                subtitle="Scheme is used for billing/discount and will be stored as discount type."
                rightText={
                  schemeOptions.length === 1
                    ? "Auto-selected because only one scheme is available"
                    : ""
                }
              />

              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {schemeOptions.length === 0 ? (
                  <EmptyState message="No scheme available for selected group." />
                ) : (
                  schemeOptions.map((scheme) => (
                    <OptionCard
                      key={scheme}
                      title={displayScheme(scheme)}
                      subtitle={
                        scheme === "%"
                          ? "Available for all schemes"
                          : "Online appointment scheme"
                      }
                      selected={selectedScheme === scheme}
                      onClick={() => handleSelectScheme(scheme)}
                      disabled={loadingOptions}
                    />
                  ))
                )}
              </div>
            </section>
          )}

          {selectedGroup && selectedScheme && (
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader
                number="3"
                title="Select Department"
                subtitle="Select department name only."
              />

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {departmentCards.length === 0 ? (
                  <EmptyState message="No department available for selected scheme." />
                ) : (
                  departmentCards.map((department) => (
                    <DepartmentCard
                      key={department.department}
                      data={department}
                      selected={selectedDepartment === department.department}
                      onClick={() => handleSelectDepartment(department.department)}
                      disabled={loadingOptions}
                    />
                  ))
                )}
              </div>
            </section>
          )}

          {selectedGroup &&
            selectedScheme &&
            selectedDepartment &&
            consultantOptions.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <SectionHeader
                  number="4"
                  title="Select Consultant"
                  subtitle="Consultants are filtered by selected group, scheme and department."
                  rightText={
                    consultantOptions.length === 1
                      ? "Auto-selected because only one consultant is available"
                      : ""
                  }
                />

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {consultantOptions.map((consultant) => (
                    <ConsultantCard
                      key={consultant.value}
                      consultant={consultant}
                      selected={selectedConsultant === consultant.value}
                      onClick={() => handleSelectConsultant(consultant.value)}
                      disabled={loadingOptions}
                    />
                  ))}
                </div>
              </section>
            )}

          {selectedGroup &&
            selectedScheme &&
            selectedDepartment &&
            (consultantOptions.length === 0 || selectedConsultant) && (
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader
                number="5"
                title="Select Date / Slot"
                subtitle="Choose one appointment slot. Remaining slots are checked before payment."
              />

              {availableSlots.length === 0 ? (
                <div className="p-5">
                  <EmptyState message="No date or slot available for this department." />
                </div>
              ) : (
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableSlots.map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      selected={String(selectedQuotaId) === String(slot.id)}
                      onClick={() => setSelectedQuotaId(slot.id)}
                    />
                  ))}
                </div>
              )}

              <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-bold uppercase">
                    Selected Appointment
                  </p>
                  <p className="text-sm font-black text-[#052f48]">
                    {selectedQuota
                      ? `${selectedQuota.department} | ${selectedQuota.consult_date} | ${selectedQuota.start_time}`
                      : "No slot selected"}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={loadingOptions}
                    className="px-5 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition"
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitAppointment}
                    disabled={!selectedQuota || loadingOptions}
                    className={`px-5 py-3 rounded-xl text-sm font-black transition ${
                      selectedQuota
                        ? "bg-[#052f48] text-white hover:bg-[#254a60]"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Submit Appointment
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {showPreviewModal && (
          <AppointmentPreviewModal
            selectedQuota={selectedQuota}
            selectedGroup={selectedGroup}
            selectedScheme={selectedScheme}
            selectedDepartment={selectedDepartment}
            selectedConsultant={selectedConsultant}
            onClose={() => setShowPreviewModal(false)}
            onProceed={() => {
              setShowPreviewModal(false);
              setShowPaymentModal(true);
            }}
          />
        )}
      </main>

      <PageFooter/>

      {showPaymentModal && (
        <AppointmentPaymentModal
          selectedQuota={selectedQuota}
          selectedPaymentMode={selectedPaymentMode}
          setSelectedPaymentMode={setSelectedPaymentMode}
          paying={paying}
          onClose={() => {
            if (!paying) {
              setShowPaymentModal(false);
            }
          }}
          onProceed={handleProceedPayment}
        />
      )}
    </div>
  );
}

function StepProgress({
  selectedGroup,
  selectedScheme,
  selectedDepartment,
  selectedConsultant,
  selectedQuota,
}) {
  const steps = [
    {
      label: "Group",
      completed: Boolean(selectedGroup),
    },
    {
      label: "Scheme",
      completed: Boolean(selectedScheme),
    },
    {
      label: "Department",
      completed: Boolean(selectedDepartment),
    },
    {
      label: "Consultant",
      completed: Boolean(selectedConsultant),
    },
    {
      label: "Date / Slot",
      completed: Boolean(selectedQuota),
    },
    {
      label: "Payment",
      completed: false,
    },
  ];

  return (
    <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`rounded-xl border px-3 py-2 text-center ${
              step.completed
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-gray-50 border-gray-200 text-gray-500"
            }`}
          >
            <p className="text-[10px] uppercase font-black">
              Step {index + 1}
            </p>
            <p className="text-sm font-black">{step.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ number, title, subtitle, rightText }) {
  return (
    <div className="bg-[#052f48] text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white text-[#052f48] flex items-center justify-center font-black">
          {number}
        </div>

        <div>
          <h2 className="font-black text-lg">{title}</h2>
          <p className="text-xs text-gray-300 mt-1">{subtitle}</p>
        </div>
      </div>

      {rightText && (
        <span className="text-[11px] bg-white/10 px-3 py-1 rounded-full font-bold">
          {rightText}
        </span>
      )}
    </div>
  );
}

function GroupCard({ group, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-2xl border p-5 transition ${
        selected
          ? "border-[#052f48] bg-[#052f48]/5 shadow-md"
          : "border-gray-200 bg-gray-50 hover:bg-white hover:shadow-sm"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#052f48]">{group.value}</h3>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {group.description || "-"}
          </p>
        </div>

        <SelectionCircle selected={selected} />
      </div>
    </button>
  );
}

function OptionCard({ title, subtitle, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-xl border p-4 transition ${
        selected
          ? "border-[#052f48] bg-[#052f48]/5 shadow-md"
          : "border-gray-200 bg-gray-50 hover:bg-white hover:shadow-sm"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-[#052f48]">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>

        <SelectionCircle selected={selected} />
      </div>
    </button>
  );
}

function DepartmentCard({ data, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-2xl border p-5 transition ${
        selected
          ? "border-[#052f48] bg-[#052f48]/5 shadow-md"
          : "border-gray-200 bg-gray-50 hover:bg-white hover:shadow-sm"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-[#052f48]">
          {data.department}
        </h3>

        <SelectionCircle selected={selected} />
      </div>
    </button>
  );
}

function ConsultantCard({ consultant, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left rounded-2xl border p-5 transition ${
        selected
          ? "border-[#052f48] bg-[#052f48]/5 shadow-md"
          : "border-gray-200 bg-gray-50 hover:bg-white hover:shadow-sm"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#052f48]">
            {consultant.label}
          </h3>

          <p className="text-xs text-gray-500 mt-1">
            Consultant ID: {consultant.value}
          </p>
        </div>

        <SelectionCircle selected={selected} />
      </div>
    </button>
  );
}

function SlotCard({ slot, selected, onClick }) {
  const hasSlot = Number(slot.remaining_slots || 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasSlot}
      className={`text-left border rounded-xl p-4 transition ${
        selected
          ? "border-[#052f48] bg-[#052f48]/5 shadow-md"
          : "border-gray-200 bg-gray-50 hover:bg-white hover:shadow-sm"
      } ${!hasSlot ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-black text-[#052f48]">
            {formatDate(slot.consult_date)}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {slot.start_time || "-"} {slot.end_time ? `- ${slot.end_time}` : ""}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {slot.consultant_name || slot.consultant || "Any Consultant"}
          </p>
        </div>

        <SelectionCircle selected={selected} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Duration" value={`${slot.duration || "-"} min`} />
        <Info label="Web Quota" value={slot.web_quota} />
        <Info label="Remaining" value={slot.remaining_slots} />
        <Info label="Scheme" value={displayScheme(slot.scheme)} />
      </div>

      <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-gray-400 font-bold">Service</p>
          <p className="text-sm font-bold text-[#052f48]">
            {slot.item_name || "-"}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase text-gray-400 font-bold">Cost</p>
          <p className="text-lg font-black text-emerald-600">
            NPR {formatMoney(slot.item_cost)}
          </p>
        </div>
      </div>

      {!hasSlot && (
        <div className="mt-3 bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2 text-xs font-bold">
          No slot available
        </div>
      )}
    </button>
  );
}

function AppointmentPreviewModal({
  selectedQuota,
  selectedGroup,
  selectedScheme,
  selectedDepartment,
  selectedConsultant,
  onClose,
  onProceed,
}) {
  return (
    <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#052f48] to-[#254a60] text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">Verify Appointment Detail</h2>
            <p className="text-xs text-gray-200 mt-1">
              Please confirm before proceeding to payment.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm">
          <PreviewRow label="Group" value={selectedGroup} />
          <PreviewRow label="Scheme" value={displayScheme(selectedScheme)} />
          <PreviewRow label="Department" value={selectedDepartment} />
          <PreviewRow
            label="Consultant"
            value={
              selectedQuota?.consultant_name ||
              selectedQuota?.consultant ||
              selectedConsultant ||
              "Any Consultant"
            }
          />
          <PreviewRow
            label="Date"
            value={formatDate(selectedQuota?.consult_date)}
          />
          <PreviewRow
            label="Expected Time"
            value={selectedQuota?.start_time || "Assigned after payment"}
          />
          <PreviewRow label="Service" value={selectedQuota?.item_name} />
          <PreviewRow
            label="Remaining Slot"
            value={selectedQuota?.remaining_slots}
          />
          <PreviewRow
            label="Payable Amount"
            value={`NPR ${formatMoney(selectedQuota?.item_cost)}`}
          />
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={onProceed}
            className="px-6 py-3 rounded-xl bg-[#052f48] hover:bg-[#254a60] text-white font-black shadow-md transition"
          >
            Verify & Proceed to Payment
          </button>
        </div>
      </div>
    </div>
  );
}

function AppointmentPaymentModal({
  selectedQuota,
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
      image: esewaLogo,
      disabled: false,
    },
    {
      id: "CONNECTIPS",
      name: "connectIPS",
      desc: "Pay directly through bank account using connectIPS.",
      status: "Available",
      image: connectipsLogo,
      disabled: false,
    },
    {
      id: "KHALTI",
      name: "khalti",
      desc: "Pay using Khalti Wallet",
      status: "Coming Soon",
      image: khaltiLogo,
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
              Quota is checked before payment starts.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase font-bold">
                Appointment Service
              </p>
              <p className="font-black text-[#052f48] break-all">
                {selectedQuota?.item_name || "-"}
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-gray-400 text-xs uppercase font-bold">
                Payable Amount
              </p>
              <p className="font-black text-2xl text-emerald-600">
                NPR {formatMoney(selectedQuota?.item_cost)}
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
                  mode.disabled
                    ? "opacity-60 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <div className="w-11 h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xl">
                  <img
                    src={mode.image}
                    alt={mode.name}
                    className="w-full h-full object-contain"
                />
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

                <SelectionCircle selected={isSelected} />
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="px-5 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition disabled:opacity-50"
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

function SelectionCircle({ selected }) {
  return (
    <span
      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
        selected ? "bg-[#052f48] border-[#052f48]" : "bg-white border-gray-300"
      }`}
    >
      {selected && <span className="w-2 h-2 rounded-full bg-white" />}
    </span>
  );
}

function SummaryRow({ label, value, highlight = false }) {
  return (
    <div className="flex justify-between gap-3 mt-1">
      <span className="text-gray-300">{label}:</span>
      <strong className={highlight ? "text-emerald-300" : ""}>
        {value || "-"}
      </strong>
    </div>
  );
}

function PreviewRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
      <span className="text-gray-500 font-bold">{label}</span>
      <strong className="text-[#052f48] text-right break-all">
        {value || "-"}
      </strong>
    </div>
  );
}

function Info({ label, value }) {
  const displayValue =
    value === 0 || value === "0" ? "0" : value || "-";

  return (
    <div>
      <p className="text-xs uppercase text-gray-400 font-bold">{label}</p>
      <p className="font-semibold text-[#052f48] break-words">
        {displayValue}
      </p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="col-span-full bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-2xl">
        📅
      </div>
      <p className="text-[#052f48] font-black mt-4">{message}</p>
    </div>
  );
}

function uniqueValues(values) {
  return Array.from(
    new Set(
      values
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
}

function buildConsultantOptions(rows) {
  const consultantMap = new Map();

  rows.forEach((item) => {
    const consultantId = String(item.consultant_id || "").trim();

    if (!consultantId) {
      return;
    }

    const consultantName = String(
      item.consultant_name || item.consultant || consultantId
    ).trim();

    if (!consultantMap.has(consultantId)) {
      consultantMap.set(consultantId, {
        value: consultantId,
        label: consultantName || consultantId,
      });
    }
  });

  return Array.from(consultantMap.values()).sort((first, second) =>
    first.label.localeCompare(second.label)
  );
}

function buildGroupOptions(quotas) {
  const groupMap = new Map();

  quotas.forEach((item) => {
    const group = String(item.group || "").trim();

    if (!group) return;

    if (!groupMap.has(group)) {
      groupMap.set(group, {
        value: group,
        description:
          item.group_description || GROUP_DESCRIPTIONS[group] || "Online appointment category.",
      });
    }
  });

  return Array.from(groupMap.values()).sort((first, second) =>
    first.value.localeCompare(second.value)
  );
}

function displayScheme(value) {
  if (!value || value === "%") {
    return "All Schemes";
  }

  return value;
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