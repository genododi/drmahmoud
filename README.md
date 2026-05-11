# Clinic website + Patient Portal

Static site for **genododi.github.io/drmahmoud/** (GitHub Pages).

## What's here

| File | Purpose |
| --- | --- |
| `index.html` | Public landing page (clinic info, services, contact) |
| `portal.html` | Patient portal: login by Patient ID, view & download records |
| `portal.js` | Portal logic: fetches `patients/<id>.json` and renders records |
| `portal.css` | Styles for the portal (kept under this name to avoid colliding with the existing landing page) |
| `patients/` | Per-patient JSON record bundles (one file per patient) |
| `portal_all_patients.json` | Optional combined dump (used as fallback) |

## How patient login works

1. Patient opens `portal.html` (e.g. by scanning the QR code printed at the bottom of any prescription/report).
2. They enter their **Patient ID** (the same ID shown on their printed papers).
3. The portal fetches `patients/<id>.json` (or falls back to `portal_all_patients.json`).
4. If found, it renders the records and lets the patient download/print them.

Records shown:

- Glasses prescriptions
- Medications
- Treatment plans
- Investigations
- Medical reports
- Examinations
- Surgeries
- Labs

## How the patient downloads their records

After login, the portal offers three download paths:

1. **"Download all my records (ZIP of PDFs)"** — primary, one click. The portal
   builds a properly formatted PDF for every record (mirroring the clinic
   letterhead used by the EMR) and packages them into a single ZIP, organised
   into one folder per service (`Glasses/`, `Medications/`, …). The original
   `records.json` is included inside the ZIP for safekeeping.
2. **"Download PDF" on each individual record** — for patients who only want
   one specific prescription or report.
3. **"Download as JSON"** — power-user export of the raw bundle.

PDF generation runs entirely in the patient's browser (jsPDF +
jsPDF-AutoTable + JSZip, loaded from cdnjs.cloudflare.com). Nothing is sent
to a server.

> **Security note:** patient ID is the only credential. Anyone who learns or guesses a patient's ID can read their bundle. Do not store information you wouldn't be comfortable handing the patient in person, and consider rotating IDs that get widely shared.

## How to publish a patient's records

### Recommended: one-click auto-publish from the EMR

In the EMR (`ophthalmology-emr-frontend`):

1. Open the patient's detail page (or the Patients list for bulk).
2. Click **Publish to Portal** (single patient) or **Publish All to Portal** (everyone).
3. **First time only:** paste a GitHub fine-grained Personal Access Token with
   *Contents: Read & write* on `genododi/drmahmoud`. The token is stored only
   in this browser (localStorage) and is sent only to api.github.com.
4. The EMR commits `patients/<id>.json` straight to this repo and updates
   `name-index.json` so the patient can also log in by full name.

The patient is reachable on the portal within seconds (GitHub Pages rebuilds in
about 30–60 s).

### Fallback: manual file export

If you can't use the GitHub auto-publish (e.g. on a phone or behind a strict
network), the EMR still offers the old export buttons:

- **Export JSON** on a patient page → downloads `<patientId>.json`. Drop it
  into `patient-portal/patients/` and commit & push.
- **Export All (JSON)** on the Patients list → downloads a combined dump and
  a `name-index_<date>.json`. Rename them to `portal_all_patients.json` and
  `name-index.json` respectively, then commit & push.

The portal tries the per-patient file first, then falls back to the combined
dump, so any of these workflows works.

## Deploying to GitHub Pages

```
# from the repo that hosts genododi.github.io/drmahmoud
# (or wherever this folder lives)

git add .
git commit -m "Update patient portal bundles"
git push
```

GitHub Pages will serve the site at `https://genododi.github.io/drmahmoud/`. Once
deployed, every PDF printed by the EMR includes a small QR pointing here (and
deep-linking to the right patient ID), so patients can scan & log in with one
tap.

## Local preview

```
cd patient-portal
python3 -m http.server 8000
# then open http://localhost:8000/portal.html
```
