VOLEXSTUDIO — REFINED STATIC PREVIEW
====================================

WHAT CHANGED
- The public Artists / Marketers roster starts empty; sample staff are no longer pre-filled.
- Owner can import a staff CSV with required columns: username, rank, password.
- Optional CSV columns: name, department, bio. If name is omitted, it is generated from the username. Department defaults to Artist, except usernames beginning with marketer_ or marketer- are treated as Marketer.
- Importing a CSV synchronises the staff roster to that file. After the first import, you will be asked to confirm before replacing the roster; users absent from the file are removed from the visible roster.
- Staff passwords in the CSV are checked at sign-in; the app stores a browser-side hash where Web Crypto is available.
- Owner now has an Account & security tab to change the Owner_Demo password. Staff also have their own password-change form.
- Added editorial typography and a redesigned CSV upload area.

FIRST OWNER SIGN-IN
Username: Owner_Demo
Temporary password: demo-only
After sign-in, open Account & security, then change the password.

HOW TO IMPORT THE TEAM CSV
1. Open your deployed website in the same browser where you intend to manage the demo.
2. Click Sign in. In the role selector choose Owner / administrator.
3. Sign in as Owner_Demo with demo-only unless you have already changed it.
4. In the owner dashboard, open Team roster.
5. Click Download example CSV, or edit the included staff-roster-example.csv in Excel / LibreOffice.
6. Replace the example rows with your staff and unique usernames, ranks and temporary passwords. Save as CSV UTF-8.
7. Choose the CSV file, then click Import roster.
8. Staff can then sign in using their username and CSV password, and change their own password in their profile workspace.

CSV FORMAT
The first three columns are required and can be in any order:
username,rank,password
Optional columns:
name,department,bio

The included example file contains fake demo users and fake temporary passwords. Replace them before using the file in a demo. CSV passwords are plain text until you delete the file; never put a real or reused password in it.

IMPORTANT LIMITATION — THIS IS NOT PRODUCTION AUTHENTICATION
This is a static frontend hosted on Cloudflare Workers. The roster, password hashes, profile images, owner password setting and messages are stored in browser localStorage on that device. They do not automatically sync to other visitors/devices. A person who can inspect or modify browser-side code/data can bypass the demo checks. Hashing in the browser does not make this secure. Do not use real employee credentials or store sensitive customer/staff data.

For a real site where the owner imports a roster once and every staff member can sign in from their own phone, we need server-side authentication and a database (for example a Cloudflare Worker API + D1 database), plus server-side authorization. A static asset upload alone cannot provide that.

DEPLOYING THIS UPDATE
Upload/replace the files at the root of your current Worker static-assets deployment. Keep index.html, app.js, style.css, mobile-fix.css, polish.css and _headers together at the root. Do not nest them in another folder. The included CSV is an example to edit; it is not automatically imported.
