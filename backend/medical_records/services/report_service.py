import base64
import mimetypes
from collections import OrderedDict

from django.http import Http404
from legacy_hmis.models import Tblencounter, Tblpatreport
from patients.services.encounter_service import get_latest_encounter_id

from medical_records.services.ftp_service import read_ftp_file


REPORT_CATEGORIES = [
    "Diagnostic Tests",
    "Radio Diagnostics",
    "General Reports",
    "Past Documents",
    "Scanned Images",
]


def patient_owns_encounter(patient_id, encounter_id):
    return Tblencounter.objects.filter(
        fldpatientval=patient_id,
        fldencounterval=encounter_id,
    ).exists()


def get_reports_by_encounter(patient_id, encounter_id=None):
    if not encounter_id:
        encounter_id = get_latest_encounter_id(patient_id)

    if not patient_owns_encounter(patient_id, encounter_id):
        raise PermissionError("You are not allowed to access this encounter")

    reports = (
        Tblpatreport.objects
        .filter(fldencounterval=encounter_id)
        .order_by("fldcateg", "-fldtime", "-fldid")
    )

    grouped = OrderedDict()

    for category in REPORT_CATEGORIES:
        grouped[category] = []

    grouped["Others"] = []

    for report in reports:
        category = report.fldcateg or "Others"

        if category not in grouped:
            grouped[category] = []

        extension = clean_extension(report.fldextension)
        source = "FTP" if report.fldlink else "DATABASE"

        grouped[category].append({
            "report_id": report.fldid,
            "title": report.fldtitle or report.flddetail or f"Report #{report.fldid}",
            "detail": report.flddetail or "",
            "category": category,
            "extension": extension,
            "source": source,
            "date": report.fldtime.strftime("%Y-%m-%d %H:%M") if report.fldtime else "",
            "view_url": f"/api/reports/file/{report.fldid}/",
            "download_url": f"/api/reports/file/{report.fldid}/?download=1",
            "is_image": extension in ["png", "jpg", "jpeg", "webp"],
            "is_pdf": extension == "pdf",
        })

    return {
        "encounter_id": encounter_id,
        "categories": grouped,
    }


def clean_extension(extension):
    if not extension:
        return "bin"

    extension = str(extension).lower().strip().replace(".", "")

    if extension == "jpeg":
        return "jpg"

    return extension


def get_content_type(extension):
    extension = clean_extension(extension)

    mime_type, _ = mimetypes.guess_type(f"file.{extension}")

    return mime_type or "application/octet-stream"


def get_report_file(report_id):
    try:
        report = Tblpatreport.objects.get(fldid=report_id)
    except Tblpatreport.DoesNotExist:
        raise Http404("Report not found")

    extension = clean_extension(report.fldextension)
    content_type = get_content_type(extension)

    filename = f"{report.fldtitle or 'patient-report'}-{report.fldid}.{extension}"
    filename = filename.replace("/", "-").replace("\\", "-")

    if report.fldlink:
        file_data = read_ftp_file(report.fldlink)
        return {
            "storage": "FTP",
            "data": file_data,
            "content_type": content_type,
            "filename": filename,
            "report": report,
        }

    if not report.fldpic:
        raise Http404("Report file is missing")

    file_data = decode_report_data(report.fldpic)

    return {
        "storage": "DATABASE",
        "data": file_data,
        "content_type": content_type,
        "filename": filename,
        "report": report,
    }


def decode_report_data(value):
    """
    Handles base64 data from fldpic.
    If fldpic includes data URI prefix, remove it.
    """

    value = str(value).strip()

    if "," in value and value.startswith("data:"):
        value = value.split(",", 1)[1]

    try:
        return base64.b64decode(value)
    except Exception:
        return value.encode("utf-8")