import json
import re
import html as html_lib
from django.utils.html import escape
from django.db import connections
from weasyprint import HTML

from patients.services.encounter_service import (
    get_latest_encounter_id,
    patient_owns_encounter,
    get_patient_summary_by_encounter,
)

def dict_fetch_all(cursor):
    columns = [col[0] for col in cursor.description]
    return [
        dict(zip(columns, row))
        for row in cursor.fetchall()
    ]


LEGACY_DB = "legacy_hmis"


def run_query(sql, params=None, db_alias=LEGACY_DB):
    with connections[db_alias].cursor() as cursor:
        cursor.execute(sql, params or [])
        return dict_fetch_all(cursor)


def format_datetime(value):
    if not value:
        return ""
    try:
        return value.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)


def normalize_rows(rows):
    normalized = []

    for row in rows:
        clean_row = {}

        for key, value in row.items():
            if hasattr(value, "strftime"):
                clean_row[key] = format_datetime(value)
            elif value is None:
                clean_row[key] = ""
            else:
                clean_row[key] = str(value)

        normalized.append(clean_row)

    return normalized


def get_event_rows(encounter_id, table_name, event_type):
    if table_name == "tblpattiming":
        sql = """
            SELECT fldid, flditem, fldfirsttime
            FROM tblpattiming
            WHERE fldencounterval=%s
              AND fldtype=%s
              AND fldfirstsave='1'
              AND fldsecondsave='0'
            ORDER BY fldfirsttime
        """
    else:
        sql = """
            SELECT fldid, flditem, fldfirsttime
            FROM tblpatevents
            WHERE fldencounterval=%s
              AND fldtype=%s
              AND fldfirstsave='1'
              AND fldsecondsave='0'
            ORDER BY fldfirsttime
        """

    return normalize_rows(run_query(sql, [encounter_id, event_type]))


def is_abnormal(value):
    return str(value or "0").strip() == "1"

def get_result_status(value):
    if is_abnormal(value):
        return "warning"

    return "normal"

def build_range(low, high, unit, fallback=""):
    """
    Builds readable reference range.

    Example:
    low=10, high=20, unit=mg/dL
    → 10 - 20 mg/dL
    """

    low = str(low or "").strip()
    high = str(high or "").strip()
    unit = str(unit or "").strip()
    fallback = str(fallback or "").strip()

    if low and high:
        return f"{low} - {high} {unit}".strip()

    if low:
        return f">= {low} {unit}".strip()

    if high:
        return f"<= {high} {unit}".strip()

    return fallback

def prepare_lab_detail_row(row):
    abnormal = row.get("fldabnormal")

    result_value = (
        row.get("fldreportquanti")
        or row.get("fldreportquali")
        or ""
    )

    reference_range = build_range(
        low=row.get("limit_low") or row.get("test_low"),
        high=row.get("limit_high") or row.get("test_high"),
        unit=row.get("limit_unit") or row.get("test_unit") or row.get("fldtestunit"),
    )

    row["result_value"] = result_value
    row["result_status"] = get_result_status(abnormal)
    row["result_color"] = "red" if is_abnormal(abnormal) else "green"
    row["reference_range"] = reference_range

    return row


def prepare_subtest_row(row):
    abnormal = row.get("fldabnormal")

    row["result_value"] = row.get("fldreport") or ""
    row["result_status"] = get_result_status(abnormal)
    row["result_color"] = "red" if is_abnormal(abnormal) else "green"
    row["reference_range"] = row.get("fldreference") or ""

    return row

def get_lab_reports(encounter_id):

    tests = run_query(
        """
        SELECT DISTINCT fldtestid AS test_id
        FROM tblpatlabtest
        WHERE fldencounterval=%s
          AND (fldstatus='Reported' OR fldstatus='Verified')
          AND flvisible='Visible'
        ORDER BY fldtestid
        """,
        [encounter_id],
    )

    result = []

    for test in tests:
        test_id = test["test_id"]

        masters = run_query(
            """
            SELECT fldid, fldtime_sample, fldtestid, fldsampletype, flduserid_report
            FROM tblpatlabtest
            WHERE fldencounterval=%s
              AND fldtestid=%s
              AND (fldstatus='Reported' OR fldstatus='Verified')
              AND flvisible='Visible'
            ORDER BY fldid DESC
            """,
            [encounter_id, test_id],
        )

        for master in masters:
            details = run_query(
                """
                SELECT 
                    plt.fldid,
                    plt.fldencounterval,
                    plt.fldtestid,
                    plt.fldreportquali,
                    plt.fldreportquanti,
                    plt.fldtest_type,
                    plt.fldabnormal,
                    plt.fldtestunit,
                    plt.fldmethod,

                    tl.fldmetlow AS limit_low,
                    tl.fldmethigh AS limit_high,
                    tl.fldmetunit AS limit_unit

                FROM tblpatlabtest plt

                LEFT JOIN tbltestlimit tl
                    ON tl.fldtestid = plt.fldtestid
                   AND tl.fldmethod = plt.fldmethod

                WHERE plt.fldid=%s
                """,
                [master["fldid"]],
            )

            normalized_details = normalize_rows(details)
            normalized_details = [
                prepare_lab_detail_row(row)
                for row in normalized_details
            ]

            subtests = run_query(
                """
                SELECT 
                    pls.fldsubtest,
                    pls.fldreport,
                    pls.fldid,
                    pls.fldtestid,
                    pls.fldtanswertype,
                    pls.fldindex,
                    pls.fldabnormal,

                    tq.fldreference

                FROM tblpatlabsubtest pls

                LEFT JOIN tbltestquali tq
                    ON tq.fldtestid = %s
                   AND tq.fldsubtest = pls.fldsubtest

                WHERE pls.fldencounterval=%s
                  AND (
                        pls.fldtestid=%s
                        OR pls.fldtestid=%s
                  )
                  AND pls.fldreport IS NOT NULL

                ORDER BY pls.fldindex, pls.fldid
                """,
                [
                    master["fldtestid"],      # for tbltestquali reference lookup
                    encounter_id,
                    master["fldid"],          # some systems store master ID here
                    master["fldtestid"],      # some systems store test name here
                ],
            )

            normalized_subtests = normalize_rows(subtests)
            normalized_subtests = [
                prepare_subtest_row(row)
                for row in normalized_subtests
            ]

            result.append({
                "master": normalize_rows([master])[0],
                "details": normalized_details,
                "subtests": normalized_subtests,
            })

    return result


def get_radio_reports(encounter_id):
    tests = run_query(
        """
        SELECT DISTINCT fldtestid AS test_id
        FROM tblpatradiotest
        WHERE fldencounterval=%s
          AND (fldstatus='Reported' OR fldstatus='Verified')
          AND flvisible='Visible'
        ORDER BY fldtestid
        """,
        [encounter_id],
    )

    result = []

    for test in tests:
        test_id = test["test_id"]

        masters = run_query(
            """
            SELECT fldid, fldtime_report, fldtestid, flduserid_report
            FROM tblpatradiotest
            WHERE fldencounterval=%s
              AND fldtestid=%s
              AND (fldstatus='Reported' OR fldstatus='Verified')
              AND flvisible='Visible'
            ORDER BY fldid DESC
            """,
            [encounter_id, test_id],
        )

        for master in masters:
            details = run_query(
                """
                SELECT fldid, fldencounterval, fldtestid, fldreportquali,
                       fldreportquanti, fldtest_type, fldabnormal
                FROM tblpatradiotest
                WHERE fldid=%s
                """,
                [master["fldid"]],
            )

            subtests = run_query(
                """
                SELECT fldsubtest, fldreport, fldid, fldtestid,
                       fldtanswertype, fldindex
                FROM tblpatradiosubtest
                WHERE fldencounterval=%s
                  AND fldtestid=%s
                ORDER BY fldindex, fldid
                """,
                [encounter_id, master["fldid"]],
            )

            result.append({
                "master": normalize_rows([master])[0],
                "details": normalize_rows(details),
                "subtests": normalize_rows(subtests),
            })

    return result

def parse_eye_report(value):
    """
    Converts:
    {"RIGHT":"0.00","LEFT":"0.00"}

    Into:
    {"right": "0.00", "left": "0.00"}
    """

    if not value:
        return {
            "right": "",
            "left": "",
        }

    try:
        data = json.loads(value)

        return {
            "right": str(data.get("RIGHT") or ""),
            "left": str(data.get("LEFT") or ""),
        }
    except Exception:
        return {
            "right": str(value),
            "left": "",
        }


def clean_glass_label(value):
    return str(value or "").replace(";", " - ").strip()


def get_glass_prescription(encounter_id):
    heads = run_query(
        """
        SELECT fldid, fldhead, fldtime, flduserid, fldrepquali
        FROM tblpatientexam
        WHERE fldencounterval=%s
          AND fldinput='Physician Examinations'
          AND fldhead IN (
            'Prescribed Glass',
            'Prescribed Glass Source',
            'Prescribed Glass Remarks'
          )
          AND fldsave='1'
        ORDER BY fldtime, fldid
        """,
        [encounter_id],
    )

    result = {
        "prescribed_glass": [],
        "source": "",
        "remarks": "",
    }

    for head in heads:
        head_id = head.get("fldid")
        head_name = head.get("fldhead")
        head_value = str(head.get("fldrepquali") or "").strip()

        if head_name == "Prescribed Glass":
            sub_rows = run_query(
                """
                SELECT fldsubtexam, fldreport, fldtanswertype, fldid, fldheadid
                FROM tblpatientsubexam
                WHERE fldheadid=%s
                  AND fldencounterval=%s
                ORDER BY fldid
                """,
                [head_id, encounter_id],
            )

            for row in sub_rows:
                parsed = parse_eye_report(row.get("fldreport"))

                result["prescribed_glass"].append({
                    "label": clean_glass_label(row.get("fldsubtexam")),
                    "right": parsed["right"],
                    "left": parsed["left"],
                })

        elif head_name == "Prescribed Glass Source":
            result["source"] = head_value

        elif head_name == "Prescribed Glass Remarks":
            result["remarks"] = head_value

    return result


def get_clinical_summary(patient_id, encounter_id=None):
    if not encounter_id:
        encounter_id = get_latest_encounter_id(patient_id)

    if not patient_owns_encounter(patient_id, encounter_id):
        raise PermissionError("You are not allowed to access this encounter")

    data = {
        "patient": get_patient_summary_by_encounter(patient_id, encounter_id),
        "encounter_id": encounter_id,

        "events": {
            "equipment": get_event_rows(encounter_id, "tblpattiming", "Equipment"),
            "general_events": get_event_rows(encounter_id, "tblpatevents", "Events"),
            "delivery": get_event_rows(encounter_id, "tblpatevents", "Delivery"),
            "procedures": get_event_rows(encounter_id, "tblpatevents", "Procedure"),
            "devices": get_event_rows(encounter_id, "tblpatevents", "Devices"),
        },

        "iv_fluids": normalize_rows(run_query(
            """
            SELECT fldid, flddoseno, fldfromtime, fldtotime
            FROM tblnurdosing
            WHERE fldencounterval=%s
              AND flddoseno IN (
                SELECT fldid
                FROM tblpatdosing
                WHERE fldencounterval=%s
                  AND fldsave_order='1'
                  AND fldroute='fluid'
                  AND fldcurval='Continue'
              )
            ORDER BY fldfromtime
            """,
            [encounter_id, encounter_id],
        )),

        "diagnosis": {
            "provisional": normalize_rows(run_query(
                """
                SELECT fldcode, fldcodenew
                FROM tblpatfindings
                WHERE fldencounterval=%s
                  AND fldtype='Provisional Diagnosis'
                  AND fldsave='1'
                """,
                [encounter_id],
            )),
            "final": normalize_rows(run_query(
                """
                SELECT fldcode, fldcodenew
                FROM tblpatfindings
                WHERE fldencounterval=%s
                  AND fldtype='Final Diagnosis'
                  AND fldsave='1'
                """,
                [encounter_id],
            )),
        },

        "investigation_advice": normalize_rows(run_query(
            """
            SELECT flditemtype, flditemname, flditemqty, fldretqty,
                   fldordtime, fldorduserid
            FROM tblpatbilling
            WHERE fldencounterval=%s
              AND (flditemtype='Diagnostic Tests' OR flditemtype='Radio Diagnostics')
            ORDER BY flditemtype, flditemname
            """,
            [encounter_id],
        )),

        "active_medications": normalize_rows(run_query(
            """
            SELECT fldid, fldroute, flditem, flddose, fldfreq, flddays,
                   flditemtype, (fldqtydisp-fldqtyret) AS fldqtydisp,
                   flddirection, fldstarttime, fldlevel
            FROM tblpatdosing
            WHERE fldencounterval=%s
              AND flditemtype='Medicines'
              AND (fldorder='Request' OR fldorder='UseOwn')
              AND fldcurval='Continue'
            ORDER BY fldstarttime
            """,
            [encounter_id],
        )),

        "discharge_medications": normalize_rows(run_query(
            """
            SELECT fldid, fldroute, flditem, flddose, fldfreq, flddays,
                   flditemtype, fldqtydisp, flddirection, fldstarttime
            FROM tblpatoutdosing
            WHERE fldencounterval=%s
              AND flditemtype='Medicines'
            ORDER BY fldstarttime
            """,
            [encounter_id],
        )),

        "pending_medications": normalize_rows(run_query(
            """
            SELECT fldid, fldroute, flditem, flddose, fldfreq, flddays,
                   flditemtype, (fldqtydisp-fldqtyret) AS fldqtydisp,
                   flddirection, fldstarttime
            FROM tblpatdosing
            WHERE fldencounterval=%s
              AND flditemtype='Medicines'
              AND fldorder='Request'
              AND fldsave_order='0'
              AND fldlevel='Requested'
              AND fldcurval='Continue'
            ORDER BY fldstarttime
            """,
            [encounter_id],
        )),

        "nutrition": normalize_rows(run_query(
            """
            SELECT flddosetime, fldcategory, flditem, flddose, fldfreq, flduserid
            FROM tblextradosing
            WHERE fldencounterval=%s
              AND fldtype='Input Food/Fluid'
              AND (fldstatus='Continue' OR fldstatus='Completed')
            ORDER BY flddosetime
            """,
            [encounter_id],
        )),

        "pending_services": normalize_rows(run_query(
            """
            SELECT flditemtype, flditemname, flditemqty
            FROM tblpatbilling
            WHERE fldencounterval=%s
              AND fldsave='0'
              AND fldstatus='Planned'
              AND fldbillno IS NULL
            ORDER BY flditemtype, flditemname
            """,
            [encounter_id],
        )),

        "opd_advices": normalize_rows(run_query(
            """
            SELECT flddetail, fldtime, flduserid
            FROM tblexamgeneral
            WHERE fldencounterval=%s
              AND fldinput='Notes'
              AND flditem='Initial Planning'

            UNION ALL

            SELECT flddetail, fldtime, flduserid
            FROM tblpatientnotes
            WHERE fldencounterval=%s
              AND fldinput='Notes'
              AND flditem='Initial Planning'

            ORDER BY fldtime
            """,
            [encounter_id, encounter_id],
        )),

        "laboratory": get_lab_reports(encounter_id),

        "radio_diagnostics": get_radio_reports(encounter_id),

        "planned_procedures": normalize_rows(run_query(
            """
            SELECT fldid, fldnewdate, flditem, flddetail, fldorduserid
            FROM tblpatgeneral
            WHERE fldencounterval=%s
              AND fldinput='Procedures'
              AND fldreportquali='Planned'
            ORDER BY fldnewdate
            """,
            [encounter_id],
        )),

        "glass_prescription": get_glass_prescription(encounter_id),

       
    }

    return data


def build_summary_html(data):
    patient = data.get("patient") or {}

    def clean_html_text(value):
        if value is None:
            return ""

        text = str(value)
        text = re.sub(r"<[^>]*>", "", text)
        text = html_lib.unescape(text)

        return text.strip()

    def first_value(row, keys):
        for key in keys:
            value = row.get(key)
            if value:
                return clean_html_text(value)
        return ""

    def text_list(rows, keys):
        if not rows:
            return ""

        values = []

        for row in rows:
            value = first_value(row, keys)
            if value:
                values.append(value)

        return "<br>".join(escape(value) for value in values)

    def medicine_list(rows):
        if not rows:
            return ""

        lines = []

        for index, row in enumerate(rows, start=1):
            name = (
                row.get("flditem")
                or row.get("item")
                or row.get("flditemname")
                or "-"
            )

            dose = f" {row.get('flddose')}" if row.get("flddose") else ""
            freq = f" — {row.get('fldfreq')}" if row.get("fldfreq") else ""
            days = f" for {row.get('flddays')} days" if row.get("flddays") else ""

            line = f"{index}. {clean_html_text(name)}{dose}{freq}{days}"
            lines.append(line)

        return "<br>".join(escape(line) for line in lines)

    def section(title, body):
        if not body:
            return ""

        return f"""
        <div class="section">
            <h3>{escape(title)}</h3>
            <div class="section-body">{body}</div>
        </div>
        """

    def diagnosis_block():
        provisional = text_list(
            data.get("diagnosis", {}).get("provisional", []),
            ["fldcode", "fldcodenew", "code"],
        )

        final = text_list(
            data.get("diagnosis", {}).get("final", []),
            ["fldcode", "fldcodenew", "code"],
        )

        if not provisional and not final:
            return ""

        return f"""
        <div class="section">
            <h3>Diagnosis</h3>

            {f'''
            <div class="sub-block">
                <h4>Provisional Diagnosis</h4>
                <div>{provisional}</div>
            </div>
            ''' if provisional else ""}

            {f'''
            <div class="sub-block">
                <h4>Final Diagnosis</h4>
                <div>{final}</div>
            </div>
            ''' if final else ""}
        </div>
        """

    def laboratory_block():
        reports = data.get("laboratory") or []
        rows = []

        for report in reports:
            detail = (report.get("details") or [{}])[0]
            master = report.get("master") or {}

            if detail.get("fldtestid") or detail.get("result_value"):
                rows.append({
                    "test_name": detail.get("fldtestid") or master.get("fldtestid") or "-",
                    "result": detail.get("result_value") or "-",
                    "range": detail.get("reference_range") or "-",
                    "status": detail.get("result_status") or "normal",
                    "is_subtest": False,
                })

            for sub in report.get("subtests") or []:
                rows.append({
                    "test_name": sub.get("fldsubtest") or "-",
                    "result": sub.get("result_value") or sub.get("fldreport") or "-",
                    "range": sub.get("reference_range") or sub.get("fldreference") or "-",
                    "status": sub.get("result_status") or "normal",
                    "is_subtest": True,
                })

        if not rows:
            return ""

        html = """
        <div class="section">
            <h3>Laboratory</h3>
            <table class="lab-table">
                <thead>
                    <tr>
                        <th>Test Name</th>
                        <th>Result</th>
                        <th>Range</th>
                    </tr>
                </thead>
                <tbody>
        """

        for row in rows:
            is_abnormal = row["status"] == "warning"
            result_class = "abnormal" if is_abnormal else "normal"
            indent_class = "subtest" if row["is_subtest"] else ""

            html += f"""
            <tr>
                <td class="{indent_class}">{escape(clean_html_text(row["test_name"]))}</td>
                <td class="{result_class}">{escape(clean_html_text(row["result"]))}</td>
                <td>{escape(clean_html_text(row["range"]))}</td>
            </tr>
            """

        html += """
                </tbody>
            </table>
        </div>
        """

        return html

    def radio_block():
        reports = data.get("radio_diagnostics") or []
        lines = []

        for report in reports:
            for sub in report.get("subtests") or []:
                if sub.get("fldsubtest"):
                    lines.append(f"<strong>{escape(clean_html_text(sub.get('fldsubtest')))}</strong>")

                if sub.get("fldreport"):
                    lines.append(escape(clean_html_text(sub.get("fldreport"))))

            for detail in report.get("details") or []:
                if detail.get("fldreportquali"):
                    lines.append(escape(clean_html_text(detail.get("fldreportquali"))))

        if not lines:
            return ""

        return section("Radio Diagnostic", "<br>".join(lines))

    def glass_prescription_block():
        glass_data = data.get("glass_prescription") or {}

        prescribed = glass_data.get("prescribed_glass") or []
        source = glass_data.get("source") or ""
        remarks = glass_data.get("remarks") or ""

        if not prescribed and not source and not remarks:
            return ""

        html = ""

        if prescribed:
            headers = []
            right = {}
            left = {}

            for row in prescribed:
                label = str(row.get("label") or "").strip().replace(";", " - ")

                if not label:
                    continue

                if label not in headers:
                    headers.append(label)

                right[label] = row.get("right") or ""
                left[label] = row.get("left") or ""

            if headers:
                html += """
                <div class="section no-padding">
                    <h3 class="table-title">Prescribed Glass</h3>
                    <table class="glass-table">
                        <thead>
                            <tr>
                                <th>Eye</th>
                """

                for header in headers:
                    html += f"<th>{escape(header)}</th>"

                html += """
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>OD</strong><br><span>Right Eye</span></td>
                """

                for header in headers:
                    html += f"<td>{escape(str(right.get(header) or '-'))}</td>"

                html += """
                            </tr>
                            <tr>
                                <td><strong>OS</strong><br><span>Left Eye</span></td>
                """

                for header in headers:
                    html += f"<td>{escape(str(left.get(header) or '-'))}</td>"

                html += """
                            </tr>
                        </tbody>
                    </table>
                </div>
                """

        if source:
            html += section(
                "Prescribed Glass Source",
                escape(clean_html_text(source)),
            )

        if remarks:
            html += section(
                "Prescribed Glass Remarks",
                escape(clean_html_text(remarks)),
            )

        return html

    html = f"""
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Clinical Summary - {escape(patient.get("patient_name", ""))}</title>

        <style>
            @page {{
                size: A4;
                margin: 12mm;
            }}

            body {{
                font-family: Arial, sans-serif;
                background: #f8fafc;
                color: #052f48;
                padding: 24px;
                font-size: 13px;
            }}

            .container {{
                width: 100%
                margin: 0 auto;
                background: white;
                border: 1px solid #d6dde3;
            }}

            .header {{
                background: #052f48;
                color: white;
                padding: 16px 20px;
            }}

            .header h1 {{
                margin: 0;
                font-size: 20px;
            }}

            .patient-box {{
                background: #f1f5f9;
                padding: 14px 20px;
                border-bottom: 1px solid #d6dde3;
                line-height: 1.6;
            }}

            .content {{
                padding: 18px 20px;
            }}

            .section {{
                border: 1px solid #d6dde3;
                border-radius: 8px;
                padding: 14px;
                margin-bottom: 14px;
                page-break-inside: avoid;
            }}

            .section h3 {{
                margin: 0 0 8px 0;
                font-size: 15px;
                color: #052f48;
                font-weight: bold;
            }}

            .section-body {{
                color: #1f2937;
                line-height: 1.55;
                white-space: normal;
            }}

            .sub-block {{
                margin-bottom: 10px;
            }}

            .sub-block h4 {{
                margin: 0 0 4px 0;
                color: #052f48;
                font-size: 13px;
                font-weight: bold;
            }}

            table {{
                width: 100%;
                border-collapse: collapse;
            }}

            th, td {{
                border-bottom: 1px solid #e5e7eb;
                padding: 7px 8px;
                text-align: left;
                vertical-align: top;
            }}

            th {{
                color: #052f48;
                font-weight: bold;
                background: #f8fafc;
            }}

            .lab-table .normal {{
                color: #047857;
                font-weight: bold;
            }}

            .lab-table .abnormal {{
                color: #b91c1c;
                font-weight: bold;
            }}

            .lab-table .subtest {{
                padding-left: 28px;
            }}

            .no-padding {{
                padding: 0;
                overflow: hidden;
            }}

            .table-title {{
                background: #052f48;
                color: white !important;
                padding: 10px 14px;
                margin: 0 !important;
            }}

            .glass-table th,
            .glass-table td {{
                border: 1px solid #d1d5db;
                text-align: center;
                padding: 8px;
            }}

            .glass-table td {{
                color: #1e3a8a;
                font-weight: bold;
            }}

            .glass-table td:first-child {{
                color: #052f48;
            }}

            .glass-table span {{
                font-size: 10px;
                color: #6b7280;
                font-weight: normal;
            }}
        </style>
    </head>

    <body>
        <div class="container">
            <div class="header">
                <h1>Prescription</h1>
                <div>Preview only from HIS clinical data</div>
            </div>

            <div class="patient-box">
                <strong>Patient:</strong> {escape(patient.get("patient_name", "-"))}<br>
                <strong>Patient ID:</strong> {escape(patient.get("patient_id", "-"))}<br>
                <strong>Encounter:</strong> {escape(data.get("encounter_id", "-"))}
            </div>

            <div class="content">
    """

    html += section(
        "OPD Advice",
        text_list(data.get("opd_advices"), ["flddetail", "detail"]),
    )

    html += diagnosis_block()

    html += section(
        "Investigation Advice",
        text_list(data.get("investigation_advice"), ["flditemname", "itemname", "item_name"]),
    )

    html += section(
        "Active Medicines",
        medicine_list(data.get("active_medications")),
    )

    html += section(
        "Discharge Medicines",
        medicine_list(data.get("discharge_medications")),
    )

    html += section(
        "Unavailable Medicines",
        medicine_list(data.get("pending_medications")),
    )

    html += laboratory_block()
    html += radio_block()

    html += section(
        "Procedure",
        text_list(data.get("planned_procedures"), ["flddetail", "flditem", "fldnewdate"]),
    )

    html += glass_prescription_block()

    html += """
            </div>
        </div>
    </body>
    </html>
    """

    return html