import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
import PatientProfile from "./pages/PatientProfile";
import BillPayment from "./pages/BillPayment";
import ArchivedReports from "./pages/ArchivedReports";
import InvoicesReceipts from "./pages/InvoicesReceipts";
import PrescriptionPage from "./pages/PrescriptionPage";
import VisitHistory from "./pages/VisitHistory";
import Appointment from "./pages/Appointment";
import ConnectIPSResult from "./pages/ConnectIPSResult";
import KhaltiResult from "./pages/KhaltiResult";
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
    "/connectips-result": <ConnectIPSResult />,
    "/dicom": <DicomPage />,
    "/change-password": <ChangePassword />,
    "/payment-result": <PaymentResult />,
    "/transactionResponse/success": <ConnectIPSResult resultType="SUCCESS_RETURN" />,
    "/transactionResponse/failure": <ConnectIPSResult resultType="FAILURE_RETURN" />,
    "/grievances-feedback": <GrievancesFeedback />,
    "/deposit": <DepositPage />,
    "/khalti-result": <KhaltiResult />,
  };

  const page = protectedRoutes[path];
  if (page) {
    return <AuthGuard>{page}</AuthGuard>;
  }

  return <Login />;
}
