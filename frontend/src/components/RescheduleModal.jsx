import { useEffect, useMemo, useState } from "react";
import { getCookie } from "../utils/cookie";

function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function displayScheme(value) {
    return !value || value === "%" ? "All Schemes" : value;
}

export default function RescheduleModal({ bookingId, onClose, onSuccess }) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [successResult, setSuccessResult] = useState(null);

    const [booking, setBooking] = useState(null);
    const [availableSlots, setAvailableSlots] = useState([]);

    const [selectedDate, setSelectedDate] = useState("");
    const [selectedQuotaId, setSelectedQuotaId] = useState(null);

    useEffect(() => {
        if (!bookingId) return;
        setLoading(true);
        setError("");
        fetch(`/api/appointments/reschedule-options/${bookingId}/`, { credentials: "include" })
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setBooking(data.booking);
                    setAvailableSlots(data.available_slots || []);
                } else {
                    setError(data.error || "Failed to load reschedule options.");
                }
            })
            .catch(() => setError("Network error. Please try again."))
            .finally(() => setLoading(false));
    }, [bookingId]);

    // Unique sorted dates from available slots
    const availableDates = useMemo(() => {
        const dates = [...new Set(availableSlots.map((s) => s.consult_date))];
        return dates.sort();
    }, [availableSlots]);

    // Slots on the selected date
    const slotsOnDate = useMemo(() => {
        if (!selectedDate) return [];
        return availableSlots.filter((s) => s.consult_date === selectedDate);
    }, [availableSlots, selectedDate]);

    // Consultants for the selected date (deduplicated)
    const consultantsOnDate = useMemo(() => {
        const seen = new Map();
        slotsOnDate.forEach((s) => {
            const id = s.consultant_id || "";
            if (!seen.has(id)) {
                seen.set(id, {
                    id,
                    name: s.consultant_name || s.consultant || "Any Consultant",
                    quota_id: s.id,
                });
            }
        });
        return Array.from(seen.values());
    }, [slotsOnDate]);

    const hasMultipleConsultants = consultantsOnDate.length > 1;

    // Auto-select quota when date changes
    useEffect(() => {
        setSelectedQuotaId(null);
        if (slotsOnDate.length === 1) {
            setSelectedQuotaId(slotsOnDate[0].id);
        } else if (!hasMultipleConsultants && slotsOnDate.length > 0) {
            setSelectedQuotaId(slotsOnDate[0].id);
        }
    }, [selectedDate]);

    // The resolved slot object
    const selectedSlot = useMemo(
        () => availableSlots.find((s) => String(s.id) === String(selectedQuotaId)),
        [availableSlots, selectedQuotaId]
    );

    const handleSelectConsultant = (quotaId) => {
        setSelectedQuotaId(quotaId);
    };

    const handleConfirm = async () => {
        if (!selectedQuotaId) {
            setError("Please select a date and consultant.");
            return;
        }
        try {
            setSubmitting(true);
            setError("");
            const csrfToken = getCookie("csrftoken");
            const response = await fetch("/api/appointments/reschedule/", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({ booking_id: bookingId, quota_id: selectedQuotaId }),
            });
            const data = await response.json();
            if (data.success) {
                setSuccessResult(data.booking);
                onSuccess && onSuccess(data.booking);
            } else {
                setError(data.error || "Reschedule failed. Please try again.");
            }
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="bg-[#052f48] text-white px-5 py-4 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-lg font-black">Reschedule Appointment</h2>
                        <p className="text-xs text-gray-300 mt-0.5">Group, scheme and department stay the same.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl disabled:opacity-50"
                    >
                        ×
                    </button>
                </div>

                {/* Current booking info */}
                {booking && (
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
                        <p className="text-[10px] uppercase font-black text-gray-400 mb-2">Current Booking</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>
                                <span className="text-gray-400 text-xs">Department: </span>
                                <span className="font-bold text-[#052f48]">{booking.department}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 text-xs">Group: </span>
                                <span className="font-bold text-[#052f48]">{booking.group}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 text-xs">Scheme: </span>
                                <span className="font-bold text-[#052f48]">{displayScheme(booking.scheme)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 text-xs">Current Date: </span>
                                <span className="font-bold text-amber-600">{formatDate(booking.consult_date)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-semibold">
                            {error}
                        </div>
                    )}

                    {/* Success state */}
                    {successResult && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
                            <p className="text-emerald-700 font-black text-base">Appointment Rescheduled!</p>
                            <p className="text-sm text-gray-700">
                                New date: <strong>{formatDate(successResult.new_date)}</strong>
                            </p>
                            {successResult.queue_number && (
                                <p className="text-sm text-gray-700">
                                    Queue number: <strong className="text-emerald-700 text-lg">{successResult.queue_number}</strong>
                                    {successResult.expected_time && (
                                        <span className="text-gray-500 ml-2">· {successResult.expected_time}</span>
                                    )}
                                </p>
                            )}
                            {successResult.consultant_name && (
                                <p className="text-sm text-gray-500">{successResult.consultant_name}</p>
                            )}
                        </div>
                    )}

                    {loading && (
                        <div className="py-10 text-center text-[#052f48] font-bold">
                            Loading available dates...
                        </div>
                    )}

                    {!loading && !successResult && availableDates.length === 0 && (
                        <div className="py-10 text-center">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center text-2xl mb-3">📅</div>
                            <p className="text-[#052f48] font-black">No available dates</p>
                            <p className="text-gray-500 text-sm mt-1">
                                No future slots are open for {booking?.department}.
                            </p>
                        </div>
                    )}

                    {!loading && !successResult && availableDates.length > 0 && (
                        <>
                            {/* Step 1: Select Date */}
                            <div>
                                <p className="text-xs font-black text-[#052f48] uppercase mb-2">Select New Date</p>
                                <select
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-[#052f48] focus:outline-none focus:border-[#052f48] bg-white"
                                >
                                    <option value="">— Choose a date —</option>
                                    {availableDates.map((d) => {
                                        const slotsCount = availableSlots.filter((s) => s.consult_date === d).reduce(
                                            (sum, s) => sum + s.remaining_slots, 0
                                        );
                                        return (
                                            <option key={d} value={d}>
                                                {formatDate(d)} · {slotsCount} slot{slotsCount !== 1 ? "s" : ""} available
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {/* Step 2: Consultant (only when date chosen AND multiple consultants) */}
                            {selectedDate && hasMultipleConsultants && (
                                <div>
                                    <p className="text-xs font-black text-[#052f48] uppercase mb-2">Select Consultant</p>
                                    <div className="space-y-2">
                                        {consultantsOnDate.map((c) => {
                                            const slot = slotsOnDate.find((s) => String(s.id) === String(c.quota_id));
                                            const isSelected = String(selectedQuotaId) === String(c.quota_id);
                                            return (
                                                <button
                                                    key={c.id || c.name}
                                                    type="button"
                                                    onClick={() => handleSelectConsultant(c.quota_id)}
                                                    className={`w-full text-left border rounded-xl px-4 py-3 transition flex items-center justify-between gap-3 ${
                                                        isSelected
                                                            ? "border-[#052f48] bg-[#052f48]/5"
                                                            : "border-gray-200 bg-gray-50 hover:bg-white"
                                                    }`}
                                                >
                                                    <div>
                                                        <p className="font-bold text-[#052f48] text-sm">{c.name}</p>
                                                        {slot && (
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                {slot.start_time || "08:00"}{slot.end_time ? ` – ${slot.end_time}` : ""}
                                                                {" · "}{slot.remaining_slots} slot{slot.remaining_slots !== 1 ? "s" : ""} left
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center ${isSelected ? "bg-[#052f48] border-[#052f48]" : "bg-white border-gray-300"}`}>
                                                        {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Queue Preview */}
                            {selectedSlot && (
                                <div className="bg-[#052f48]/5 border border-[#052f48]/20 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-black text-[#052f48] uppercase">Appointment Preview</p>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-gray-400 text-xs">New Date</p>
                                            <p className="font-bold text-[#052f48]">{formatDate(selectedSlot.consult_date)}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-xs">Time</p>
                                            <p className="font-bold text-[#052f48]">
                                                {selectedSlot.start_time || "08:00"}
                                                {selectedSlot.end_time ? ` – ${selectedSlot.end_time}` : ""}
                                            </p>
                                        </div>
                                        {(selectedSlot.consultant_name || selectedSlot.consultant) && (
                                            <div>
                                                <p className="text-gray-400 text-xs">Consultant</p>
                                                <p className="font-bold text-[#052f48]">
                                                    {selectedSlot.consultant_name || selectedSlot.consultant}
                                                </p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-gray-400 text-xs">Slots Left</p>
                                            <p className="font-bold text-emerald-600">{selectedSlot.remaining_slots}</p>
                                        </div>
                                    </div>

                                    {/* Queue estimate */}
                                    <div className="border-t border-[#052f48]/10 pt-3 flex items-center gap-4">
                                        <div className="text-center bg-white border border-emerald-200 rounded-xl px-4 py-2 min-w-[72px]">
                                            {selectedSlot.estimated_queue_number ? (
                                                <>
                                                    <p className="text-[10px] uppercase text-gray-400 font-bold">Queue</p>
                                                    <p className="text-2xl font-black text-emerald-700 leading-none mt-0.5">
                                                        {selectedSlot.estimated_queue_number}
                                                    </p>
                                                    {selectedSlot.estimated_queue_time && (
                                                        <p className="text-xs font-bold text-[#052f48] mt-1">
                                                            {selectedSlot.estimated_queue_time}
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-xs text-amber-600 font-bold leading-tight py-1">
                                                    Visit Hospital
                                                </p>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 leading-relaxed">
                                            {selectedSlot.estimated_queue_number
                                                ? "Estimated queue position based on current bookings."
                                                : "Queue will be assigned at the hospital."}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!successResult ? (
                    <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition disabled:opacity-50 text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!selectedQuotaId || submitting}
                            className={`px-6 py-2.5 rounded-xl font-black text-sm shadow-sm transition text-white ${
                                selectedQuotaId && !submitting
                                    ? "bg-[#052f48] hover:bg-[#254a60]"
                                    : "bg-gray-300 cursor-not-allowed"
                            }`}
                        >
                            {submitting ? "Rescheduling..." : "Confirm Reschedule"}
                        </button>
                    </div>
                ) : (
                    <div className="px-5 py-4 bg-emerald-50 border-t border-emerald-100 flex justify-end shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-sm transition"
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
