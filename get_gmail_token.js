// get_gmail_token.js
// Usage:
// 1) Put credentials.json (downloaded from Google Cloud Console) next to this file.
// 2) Ensure the OAuth client has the redirect URI: http://localhost:8080/oauth2callback
//    (If you created a Desktop client, 'installed' flow may be used; this script supports both.)
// 3) Run: node get_gmail_token.js
//
// It will print an auth URL. Open it in a browser, sign in, and Google will redirect back to
// http://localhost:8080/oauth2callback?code=... . The script automatically receives the code,
// exchanges it for tokens, saves token.json and prints token details.

const fs = require("fs");
const http = require("http");
const { URL } = require("url");
const { google } = require("googleapis");
const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const CRED_PATH = "./credential.json";
const TOKEN_PATH = "./token.json";

function exitWith(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(CRED_PATH)) {
  exitWith(`Missing ${CRED_PATH}. Download OAuth client credentials from Google Cloud Console and save as ${CRED_PATH}`);
}

let creds;
try {
  creds = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
} catch (err) {
  exitWith(`Failed to parse ${CRED_PATH}: ${err.message}`);
}

const clientInfo = creds.installed || creds.web;
if (!clientInfo) {
  exitWith(`credentials.json must contain either "installed" or "web" top-level key. Paste the file contents here for inspection if unsure.`);
}

const { client_id, client_secret, redirect_uris } = clientInfo;
if (!client_id || !client_secret || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
  exitWith(`credentials.json is missing client_id/client_secret/redirect_uris. Check the file.`);
}

// We will use the first redirect URI provided in the credentials JSON.
const redirectUri = redirect_uris[0];
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

(async function main() {
  // Generate the auth URL and print instructions.
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline", // request refresh_token
    scope: SCOPES,
    prompt: "consent", // ensure refresh token is returned during testing
  });

  console.log("\n=== Gmail OAuth2 Token Generator ===");
  console.log(`Listening on http://localhost:${port} to receive the OAuth callback.`);
  console.log("\n1) Open the URL below in your browser (or copy/paste):\n");
  console.log(authUrl);
  console.log("\n2) Sign in & grant permission. Google will redirect to:");
  console.log(`   ${redirectUri} (this script handles the callback)`);
  console.log("\n3) After success the tokens will be saved to:", TOKEN_PATH);
  console.log("\nIf you created a Web client ensure the redirect URI in Google Cloud Console exactly matches:");
  console.log(`   ${redirectUri}\n`);

  // Create a tiny HTTP server to accept the redirect and exchange the code.
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname !== "/oauth2callback") {
        // simple reply for other routes
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("This server only handles the OAuth2 callback at /oauth2callback\n");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) {
        console.error("OAuth error from provider:", error);
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>OAuth Error</h1><p>${error}</p>`);
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>No code found in query</h1><p>Make sure you opened the auth URL and completed the consent screen.</p>");
        return;
      }

      console.log("Received code. Exchanging for tokens...");
      const { tokens } = await oAuth2Client.getToken(code);
      // persist tokens
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log("Saved tokens to", TOKEN_PATH);
      console.log("Token keys:", Object.keys(tokens));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body>
        <h2>Authentication successful</h2>
        <p>Tokens saved to <code>${TOKEN_PATH}</code>.</p>
        <p>You can close this tab and return to your app.</p>
      </body></html>`);

      // graceful shutdown after a short delay so the browser gets the response
      setTimeout(() => {
        server.close(() => {
          console.log("Server closed. Exiting.");
          process.exit(0);
        });
      }, 1000);
    } catch (err) {
      console.error("Error handling callback:", err.response?.data || err.message || err);
      try {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal server error. See terminal for details.");
      } catch (e) {}
    }
  });

  server.on("error", (err) => {
    console.error("Server error:", err.message);
    console.error("Possible reason: port in use or no permission to bind. You can set PORT env var to change the port.");
    process.exit(1);
  });

  server.listen(port, () => {
    // If the redirectUri is not using localhost:port we still listen; user must ensure redirectUri matches.
    console.log(`\nServer is listening at http://localhost:${port}`);
    console.log("Waiting for OAuth callback at /oauth2callback ...\n");
  });
})().catch((e) => {
  console.error("Unexpected error:", e && e.stack ? e.stack : e);
  process.exit(1);
});