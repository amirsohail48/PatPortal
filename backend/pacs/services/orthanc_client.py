import requests
from django.conf import settings
from requests.auth import HTTPBasicAuth


class OrthancClient:
    """
    Simple Python client for connecting Django to Orthanc REST API.
    """

    def __init__(self):
        self.base_url = settings.ORTHANC_URL.rstrip("/")
        self.auth = HTTPBasicAuth(
            settings.ORTHANC_USERNAME,
            settings.ORTHANC_PASSWORD
        )
        self.timeout = getattr(settings, "ORTHANC_TIMEOUT", 20)

    def request(self, method, endpoint, **kwargs):
        url = f"{self.base_url}{endpoint}"

        try:
            response = requests.request(
                method=method,
                url=url,
                auth=self.auth,
                timeout=self.timeout,
                **kwargs
            )

            response.raise_for_status()

            if response.content:
                content_type = response.headers.get("Content-Type", "")
                if "application/json" in content_type:
                    return response.json()
                return response.content

            return None

        except requests.exceptions.RequestException as error:
            raise Exception(f"Orthanc connection failed: {str(error)}")

    def system_info(self):
        return self.request("GET", "/system")

    def list_patients(self):
        return self.request("GET", "/patients")

    def get_patient(self, patient_id):
        return self.request("GET", f"/patients/{patient_id}")

    def list_studies(self):
        return self.request("GET", "/studies")

    def get_study(self, study_id):
        return self.request("GET", f"/studies/{study_id}")

    def list_series(self):
        return self.request("GET", "/series")

    def get_series(self, series_id):
        return self.request("GET", f"/series/{series_id}")

    def list_instances(self):
        return self.request("GET", "/instances")

    def get_instance(self, instance_id):
        return self.request("GET", f"/instances/{instance_id}")

    def upload_dicom(self, dicom_file):
        """
        Upload one DICOM file to Orthanc.
        Orthanc supports uploading DICOM files by POSTing binary data to /instances.
        """
        return self.request(
            "POST",
            "/instances",
            data=dicom_file,
            headers={"Content-Type": "application/dicom"}
        )

    def download_instance_file(self, instance_id):
        """
        Download original DICOM file from Orthanc.
        """
        return self.request("GET", f"/instances/{instance_id}/file")

    def find_studies_by_patient_id(self, patient_id):
        """
        Search studies by PatientID using Orthanc /tools/find.
        """
        payload = {
            "Level": "Studies",
            "Query": {
                "PatientID": patient_id
            },
            "ResponseContent": [
                "MainDicomTags",
                "PatientMainDicomTags",
                "Children"
            ]
        }

        return self.request("POST", "/tools/find", json=payload)