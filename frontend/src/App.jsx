import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
import PatientProfile from "./pages/PatientProfile";
import BillPayment from "./pages/BillPayment";
import ArchivedReports from "./pages/ArchivedReports";
import InvoicesReceipts from "./pages/InvoicesReceipts";
import PrescriptionPage from "./pages/PrescriptionPage";
import VisitHistory from "./pages/VisitHistory";
import Appointment from "./pages/Appointment";
import DicomPage from "./pages/DicomPage";
import ChangePassword from "./pages/ChangePassword";
import PaymentResult from "./pages/PaymentResult";
import GrievancesFeedback from "./pages/GrievancesFeedback";
import DepositPage from "./pages/DepositPage";
import AuthGuard from "./components/AuthGuard";

export default function App() {
  const path = window.location.pathname;

  if (path === "/" || path === "/login") {
    return <Login />;
  }

  const protectedRoutes = {
    "/home": <HomePage />,
    "/patient-profile": <PatientProfile />,
    "/bill-payment": <BillPayment />,
    "/archived-reports": <ArchivedReports />,
    "/invoices-receipts": <InvoicesReceipts />,
    "/prescriptions": <PrescriptionPage />,
    "/visit-history": <VisitHistory />,
    "/appointments": <Appointment />,
    "/dicom": <DicomPage />,
    "/change-password": <ChangePassword />,
    "/payment-result": <PaymentResult />,
    "/khalti-result": <PaymentResult />,
    "/connectips-result": <PaymentResult />,
    "/transactionResponse/success": <PaymentResult />,
    "/transactionResponse/failure": <PaymentResult />,
    "/grievances-feedback": <GrievancesFeedback />,
    "/deposit": <DepositPage />,
  };

  const page = protectedRoutes[path];
  if (page) {
    return <AuthGuard>{page}</AuthGuard>;
  }

  return <Login />;
}
