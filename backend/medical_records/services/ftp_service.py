from ftplib import FTP, FTP_TLS
from io import BytesIO

from django.conf import settings


def get_ftp_connection():
    """
    Creates FTP/FTPS connection using credentials from settings.py.
    """

    if not settings.FTP_REPORT_HOST:
        raise ValueError("FTP_REPORT_HOST is not configured")

    if settings.FTP_REPORT_USE_TLS:
        ftp = FTP_TLS()
        ftp.connect(settings.FTP_REPORT_HOST, settings.FTP_REPORT_PORT, timeout=30)
        ftp.login(settings.FTP_REPORT_USER, settings.FTP_REPORT_PASSWORD)
        ftp.prot_p()
    else:
        ftp = FTP()
        ftp.connect(settings.FTP_REPORT_HOST, settings.FTP_REPORT_PORT, timeout=30)
        ftp.login(settings.FTP_REPORT_USER, settings.FTP_REPORT_PASSWORD)

    return ftp


def read_ftp_file(file_path):
    """
    Reads report file from FTP and returns bytes.

    file_path can come from tblpatreport.fldlink.
    """

    ftp = get_ftp_connection()

    try:
        file_buffer = BytesIO()

        ftp.retrbinary(
            f"RETR {file_path}",
            file_buffer.write,
        )

        file_buffer.seek(0)
        return file_buffer.read()

    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()