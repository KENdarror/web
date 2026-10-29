VOLEXSTUDIO DEPLOYMENT

FILES
- index.html: responsive website structure
- style.css: base layout and component styles
- polish.css: visual/accessibility polish layer
- mobile-fix.css: narrow-screen and modal layout fixes
- app.js: Supabase-backed customer/owner/staff flows
- SUPABASE_SETUP.sql: schema, policies, storage setup
- supabase/functions/create-staff/index.ts: secure owner-only staff account creation function

1. CONFIGURE THE SUPABASE PUBLIC KEY
Open app.js and replace PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE with the project's publishable key (or legacy anon key) from Supabase Dashboard > Project Settings > API Keys. Do NOT put a secret/service-role key in app.js.
The project URL is already set to https://tysltsdeyojqfgfnowrh.supabase.co .

2. APPLY DATABASE SETUP
In Supabase Dashboard > SQL Editor, review and run SUPABASE_SETUP.sql. This file enables Row Level Security and creates storage policies. If your existing database has custom constraints or differently named columns, reconcile those before running. Back up the database first.

3. CREATE YOUR OWNER ACCOUNT
Deploy the site, use Sign in > Create an account with your intended owner email, and confirm the email if Supabase requires it. In SQL Editor, run the one-time owner promotion statement at the bottom of SUPABASE_SETUP.sql after replacing YOUR_OWNER_EMAIL@example.com with that exact email. Do not enable public owner registration.

4. DEPLOY THE SECURE STAFF FUNCTION
Install Supabase CLI and log in, then from this project folder run:
  supabase link --project-ref tysltsdeyojqfgfnowrh
  supabase functions deploy create-staff
Supabase supplies SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to deployed Edge Functions by default. If your project setup does not, configure them as function secrets in the Supabase dashboard/CLI. The service-role key must stay inside the function environment only.

5. DEPLOY THE WEBSITE
Upload index.html, app.js, style.css, polish.css and mobile-fix.css together in the same root folder of your static host (Cloudflare Pages is fine). Use the root folder as the build output directory if the site is deployed without a build step. Make sure the actual deployed app.js has the public key, then hard-refresh the browser.

IMPORTANT CHECKS BEFORE ANNOUNCING THE SITE
- Confirm email/password auth settings in Supabase.
- Test public gallery, guest enquiry, customer login, and owner login.
- Test owner product upload, product hide/delete, enquiry status changes, and staff account creation.
- Check Supabase Logs and browser Console for RLS errors.
- Turn on the suitable security settings for your Supabase project and rotate any secret/service-role keys previously shared publicly.

NOTES
- Product prices are intentionally not displayed; enquiry is not order acceptance.
- Staff account creation requires the Edge Function; it cannot be safely done in browser-only code.
- The front-end uses the existing main tables (profiles, staff, products, enquiries) plus site_settings and a Storage bucket named volex-assets.
