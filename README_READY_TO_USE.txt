EMPLOYEE DOCUMENT PORTAL - WINDOWS QUICK START (NO PYTHON REQUIRED)

WHAT YOU NEED
- Windows 10/11
- Node.js LTS (JavaScript runtime) installed once: https://nodejs.org/
- Internet connection on the first run to download app packages
- Python is NOT required by this version.

START
1. Extract this ZIP into a normal folder (do not run it from inside the ZIP).
2. Double-click START_PORTAL.bat.
3. On first launch, it creates a private .env configuration and installs JavaScript packages.
4. Your browser opens at http://localhost:3000.
5. Initial admin password: PortalAdmin!7xQ#2026
6. Before using real employee data, run CHANGE_ADMIN_PASSWORD.bat to set your own strong password.
7. Admin login is available from the top-right button on the employee form.
8. Use the Form requirements tab in Admin to add/edit required employee fields and documents.
9. Use Export Excel to download employee records.
10. Double-click BACKUP_DATA.bat regularly to back up the database and uploaded files.

DATA STORAGE
- Employee records and form requirements are saved in data/portal-data.json.
- Uploaded documents are saved in uploads/.
- Keep the data and uploads folders together with the app. Do not delete them.
- The JSON data file is written locally; make regular backups and do not edit it while the app is running.

IMPORTANT LIMITATIONS
- This package is for local use on one computer. It is not automatically available to employees on other devices or over the internet.
- Do not expose this local app directly to the public internet. Employee identity documents are sensitive. A live company-wide version needs HTTPS, secure server configuration, persistent storage, backups, and access controls.
- Keep the .env file and backup folders private; they contain employee information or admin credentials.
