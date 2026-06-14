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
import DicomPage from "./pages/DicomPage";
import ChangePassword from "./pages/ChangePassword";
import PaymentResult from "./pages/PaymentResult";
import GrievancesFeedback from "./pages/GrievancesFeedback";
import DepositPage from "./pages/DepositPage";

export default function App() {
  const path = window.location.pathname;

  if (path === "/" || path === "/login") {
    return <Login />;
  }

  if (path === "/home") {
    return <HomePage />;
  }

  if (path === "/patient-profile") {
    return <PatientProfile />;
  }

  if (path === "/bill-payment") {
    return <BillPayment />;
  }

  if (path === "/archived-reports") {
    return <ArchivedReports />;
  }

  if (path === "/invoices-receipts") {
    return <InvoicesReceipts />;
  }
  if (path === "/prescriptions") {
    return <PrescriptionPage />;
  }
  if (path === "/visit-history") {
    return <VisitHistory />;
  }
  if (path === "/appointments") {
    return <Appointment />;
  }
  if (path === "/connectips-result") {
    return <ConnectIPSResult />;
  }
  if (path === "/dicom") {
    return <DicomPage />;
  }
  if (path === "/change-password") {
    return <ChangePassword />;
  }
  if (path === "/payment-result") {
    return <PaymentResult />;
  }
  if (path === "/transactionResponse/success") {
  return <ConnectIPSResult resultType="SUCCESS_RETURN" />;
  }

  if (path === "/transactionResponse/failure") {
    return <ConnectIPSResult resultType="FAILURE_RETURN" />;
  }
  if (path === "/grievances-feedback") {
  return <GrievancesFeedback />;
  }
  if (path === "/deposit") {
  return <DepositPage />;
  }

  return <Login />;
}