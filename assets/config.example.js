/* ===========================================================================
   Connection settings — the only file you edit to point the calculator
   at your own Google Sheet.

   endpoint : Apps Script web app URL. Deploy > New deployment > Web app,
              then copy the URL that ends in /exec.
   token    : must match SHARED_TOKEN at the top of apps-script/Code.gs,
              character for character.

   After changing SHARED_TOKEN in Code.gs you must redeploy:
   Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
   Saving alone leaves the live web app on the old token.

   Leave endpoint as the PASTE_ placeholder and the app stays in local mode —
   everything still works, it just saves to the browser instead of Sheets.
   =========================================================================== */
window.GP_CONFIG = {
  endpoint: 'PASTE_YOUR_EXEC_URL_HERE',
  token: 'PASTE_YOUR_TOKEN_HERE'
};
