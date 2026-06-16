import hashlib
import json
import os
import time
from pathlib import Path

import logging
import requests

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

class PacsServiceUnavailable(Exception):
    pass


class PacsRequestTimeout(Exception):
    pass

def orthanc_auth():
    if settings.ORTHANC_USERNAME and settings.ORTHANC_PASSWORD:
        return (settings.ORTHANC_USERNAME, settings.ORTHANC_PASSWORD)

    return None


def orthanc_request(method, path, **kwargs):
    url = f"{settings.ORTHANC_BASE_URL}{path}"

    try:
        response = requests.request(
            method=method,
            url=url,
            auth=orthanc_auth(),
            timeout=getattr(settings, "ORTHANC_TIMEOUT", 60),
            **kwargs,
        )

        if response.status_code >= 400:
            logger.error(
                "Orthanc returned error. status=%s url=%s response=%s",
                response.status_code,
                url,
                response.text,
            )
            raise PacsServiceUnavailable(
                "Unable to load DICOM images at the moment. Please try again later."
            )

        return response

    except requests.exceptions.ConnectTimeout:
        logger.exception("PACS connection timeout. url=%s", url)
        raise PacsRequestTimeout(
            "PACS imaging server is currently unavailable. Please try again later or contact the Radiology/PACS support team."
        )

    except requests.exceptions.ReadTimeout:
        logger.exception("PACS read timeout. url=%s", url)
        raise PacsRequestTimeout(
            "PACS imaging server did not respond in time. Please try again later."
        )

    except requests.exceptions.ConnectionError:
        logger.exception("PACS connection error. url=%s", url)
        raise PacsServiceUnavailable(
            "Unable to connect to the PACS imaging server. Please try again later or contact the Radiology/PACS support team."
        )

    except requests.exceptions.RequestException:
        logger.exception("Unexpected PACS request error. url=%s", url)
        raise PacsServiceUnavailable(
            "Unable to load DICOM images at the moment. Please try again later."
        )


def find_studies_by_tag(tag_name, value):
    payload = {
        "Level": "Study",
        "Expand": True,
        "Query": {
            tag_name: value,
        },
    }

    response = orthanc_request(
        "POST",
        "/tools/find",
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    return response.json()


def find_studies_by_encounter(encounter_id, patient_id=None):
    results = []
    seen_ids = set()

    searches = [
        ("AccessionNumber", encounter_id),
        ("PatientID", encounter_id),
    ]

    if patient_id:
        searches.append(("PatientID", patient_id))

    for tag_name, value in searches:
        if not value:
            continue

        studies = find_studies_by_tag(tag_name, value)

        for study in studies:
            study_id = study.get("ID")

            if study_id and study_id not in seen_ids:
                seen_ids.add(study_id)
                results.append(format_study(study))

    return results


def format_study(study):
    main_tags = study.get("MainDicomTags") or {}
    patient_tags = study.get("PatientMainDicomTags") or {}

    study_id = study.get("ID", "")

    return {
        "id": study_id,
        "study_instance_uid": main_tags.get("StudyInstanceUID", ""),
        "study_date": main_tags.get("StudyDate", ""),
        "study_time": main_tags.get("StudyTime", ""),
        "description": main_tags.get("StudyDescription", ""),
        "accession_number": main_tags.get("AccessionNumber", ""),
        "patient_name": patient_tags.get("PatientName", ""),
        "patient_id": patient_tags.get("PatientID", ""),
        "series_count": len(study.get("Series") or []),
    }


def get_study_series(study_id):
    response = orthanc_request("GET", f"/studies/{study_id}/series")
    series_list = response.json()

    result = []

    for series in series_list:
        main_tags = series.get("MainDicomTags") or {}
        instances = series.get("Instances") or []

        result.append({
            "id": series.get("ID", ""),
            "series_instance_uid": main_tags.get("SeriesInstanceUID", ""),
            "modality": main_tags.get("Modality", ""),
            "description": main_tags.get("SeriesDescription", ""),
            "series_number": main_tags.get("SeriesNumber", ""),
            "instances_count": len(instances),
            "first_instance_id": instances[0] if instances else "",
        })

    return result


def content_type_to_extension(content_type):
    content_type = str(content_type or "").lower()

    if "jpeg" in content_type or "jpg" in content_type:
        return ".jpg"

    if "png" in content_type:
        return ".png"

    return ".png"


def get_cache_root():
    cache_root = Path(settings.PACS_PREVIEW_CACHE_DIR)
    cache_root.mkdir(parents=True, exist_ok=True)
    return cache_root


def cleanup_old_cached_previews():
    cache_root = get_cache_root()
    ttl_seconds = int(getattr(settings, "PACS_PREVIEW_CACHE_TTL_SECONDS", 3600))

    if ttl_seconds <= 0:
        return

    now = time.time()

    for file_path in cache_root.glob("*"):
        try:
            if not file_path.is_file():
                continue

            file_age = now - file_path.stat().st_mtime

            if file_age > ttl_seconds:
                file_path.unlink(missing_ok=True)

        except Exception as error:
            print("PACS cache cleanup error:", error)


def get_existing_cached_preview(cache_key):
    cache_root = get_cache_root()
    ttl_seconds = int(getattr(settings, "PACS_PREVIEW_CACHE_TTL_SECONDS", 3600))

    image_files = list(cache_root.glob(f"{cache_key}.*"))

    for image_file in image_files:
        if image_file.suffix == ".json":
            continue

        meta_file = cache_root / f"{cache_key}.json"

        if not meta_file.exists():
            continue

        if ttl_seconds > 0:
            file_age = time.time() - image_file.stat().st_mtime

            if file_age > ttl_seconds:
                image_file.unlink(missing_ok=True)
                meta_file.unlink(missing_ok=True)
                continue

        try:
            with open(meta_file, "r") as file:
                meta = json.load(file)
        except Exception:
            meta = {}

        return {
            "path": str(image_file),
            "content_type": meta.get("content_type", "image/png"),
            "source": "LOCAL_CACHE",
        }

    return None


def download_instance_preview_from_orthanc(instance_id):
    response = orthanc_request(
        "GET",
        f"/instances/{instance_id}/preview",
    )

    content_type = response.headers.get("Content-Type", "image/png")
    extension = content_type_to_extension(content_type)

    return {
        "content": response.content,
        "content_type": content_type,
        "extension": extension,
    }


def get_cached_instance_preview(instance_id):
    """
    Main function:
    1. Check if preview is already stored locally.
    2. If yes, serve local preview.
    3. If no, download from Orthanc, save locally, then serve local preview.
    """

    cleanup_old_cached_previews()

    cache_root = get_cache_root()

    cache_key = hashlib.sha256(str(instance_id).encode("utf-8")).hexdigest()

    existing_preview = get_existing_cached_preview(cache_key)

    if existing_preview:
        return existing_preview

    preview = download_instance_preview_from_orthanc(instance_id)

    image_path = cache_root / f"{cache_key}{preview['extension']}"
    meta_path = cache_root / f"{cache_key}.json"

    with open(image_path, "wb") as file:
        file.write(preview["content"])

    with open(meta_path, "w") as file:
        json.dump(
            {
                "instance_id": instance_id,
                "content_type": preview["content_type"],
                "created_at": time.time(),
            },
            file,
        )

    return {
        "path": str(image_path),
        "content_type": preview["content_type"],
        "source": "ORTHANC_FETCHED_AND_CACHED",
    }