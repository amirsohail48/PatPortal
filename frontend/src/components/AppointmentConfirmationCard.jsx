function formatMoney(value) {
  const n = Number(value || 0);
  return Number.isNaN(n) ? "0.00" : n.toFixed(2);
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}:</span>
      <strong className="text-right break-all text-[#052f48]">{value || "-"}</strong>
    </div>
  );
}

export default function AppointmentConfirmationCard({ confirmation }) {
  return (
    <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden text-left">
      <div className="bg-emerald-600 text-white px-5 py-4">
        <h3 className="text-lg font-black">Appointment Confirmed</h3>
        <p className="text-xs text-emerald-100 mt-1">
          Please keep this booking detail for your hospital visit.
        </p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {confirmation.queue_pending ? (
            <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-sm font-bold text-amber-700">Queue Not Yet Assigned</p>
              <p className="text-sm text-amber-600 mt-1">
                Please visit the hospital for your booking detail.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white border border-emerald-100 rounded-xl p-4 text-center">
                <p className="text-xs uppercase text-gray-400 font-bold">Queue Number</p>
                <p className="text-4xl font-black text-emerald-700 mt-2">
                  {confirmation.queue_number || "-"}
                </p>
              </div>

              <div className="bg-white border border-emerald-100 rounded-xl p-4 text-center">
                <p className="text-xs uppercase text-gray-400 font-bold">Expected Time</p>
                <p className="text-3xl font-black text-[#052f48] mt-2">
                  {confirmation.expected_time || "-"}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <InfoRow label="Booking ID" value={confirmation.booking_id} />
          <InfoRow label="Department" value={confirmation.department} />
          <InfoRow label="Group" value={confirmation.group} />
          <InfoRow label="Scheme" value={confirmation.scheme} />
          <InfoRow label="Date" value={formatDate(confirmation.consult_date)} />
          <InfoRow label="Service" value={confirmation.item_name} />
          <InfoRow
            label="Amount"
            value={confirmation.item_cost ? `NPR ${formatMoney(confirmation.item_cost)}` : null}
          />
        </div>

        {!confirmation.queue_pending && (
          <div className="mt-5 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-sm font-bold">
            {confirmation.advisory || "Please arrive 15 minutes early."}
          </div>
        )}
      </div>
    </div>
  );
}
