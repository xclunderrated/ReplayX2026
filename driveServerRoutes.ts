import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { google } from "googleapis";

const TOKENS_FILE = path.join(process.cwd(), ".replayx-drive-tokens.json");

export interface StoredDriveTokens {
  tokens: any;
  user?: {
    email: string;
    name?: string;
    picture?: string;
  };
  lastSyncAt?: number;
  backupFileId?: string;
}

export function loadStoredDriveTokens(): StoredDriveTokens | null {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("[GoogleDrive] Error reading tokens file:", err);
  }
  return null;
}

export function saveStoredDriveTokens(stored: StoredDriveTokens) {
  try {
    // This file holds a live Google OAuth refresh token for the connected
    // account. Restrict it to the owner: the default mode would follow the
    // process umask (typically 0644), leaving it readable by every local user.
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(stored, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    // writeFileSync only applies `mode` when creating the file, so an existing
    // one written before this fix keeps its old permissions until re-chmodded.
    try {
      fs.chmodSync(TOKENS_FILE, 0o600);
    } catch {
      // Best effort: unsupported on some Windows filesystems.
    }
  } catch (err) {
    console.error("[GoogleDrive] Error writing tokens file:", err);
  }
}

export function getOAuth2Client(req?: express.Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  let redirectUri = process.env.APP_URL
    ? `${process.env.APP_URL.replace(/\/$/, "")}/api/auth/google/callback`
    : "";

  if (!redirectUri && req) {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    redirectUri = `${protocol}://${host}/api/auth/google/callback`;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getAuthenticatedDriveClient(req?: express.Request) {
  const stored = loadStoredDriveTokens();
  if (!stored || !stored.tokens) {
    return null;
  }
  const oauth2Client = getOAuth2Client(req);
  oauth2Client.setCredentials(stored.tokens);

  oauth2Client.on("tokens", (newTokens) => {
    const current = loadStoredDriveTokens() || { tokens: {} };
    stored.tokens = { ...current.tokens, ...newTokens };
    saveStoredDriveTokens(stored);
  });

  return {
    drive: google.drive({ version: "v3", auth: oauth2Client }),
    oauth2Client,
    stored,
  };
}

/**
 * Single-use nonces for the OAuth `state` parameter.
 *
 * Held in memory only, so a restart simply forces a fresh login rather than
 * leaving a replayable token behind. Bounded and expiry-limited so a caller who
 * never completes the flow cannot grow it, and consumed on use so a captured
 * callback URL cannot be replayed.
 */
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const OAUTH_STATE_MAX = 16;
/** Nonce -> expiry. Insertion order is issue order, so the first key is the oldest. */
const pendingOAuthStates = new Map<string, number>();

function issueOAuthState(): string {
  const value = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  for (const [key, expiresAt] of pendingOAuthStates) {
    if (now > expiresAt) pendingOAuthStates.delete(key);
  }
  pendingOAuthStates.set(value, now + OAUTH_STATE_TTL_MS);
  // Bound it even if every entry is unexpired.
  while (pendingOAuthStates.size > OAUTH_STATE_MAX) {
    const oldest = pendingOAuthStates.keys().next();
    if (oldest.done) break;
    pendingOAuthStates.delete(oldest.value);
  }
  return value;
}

/** Returns true only for a nonce this server issued, unexpired, and unused. */
function consumeOAuthState(candidate: string): boolean {
  const expiresAt = pendingOAuthStates.get(candidate);
  if (expiresAt === undefined) return false;
  // Single use: removed whether or not it had expired, so a captured callback URL
  // cannot be replayed.
  pendingOAuthStates.delete(candidate);
  return Date.now() <= expiresAt;
}

/**
 * Rejects state-changing requests that did not originate from this server.
 *
 * The Drive routes include an unauthenticated `POST /api/auth/google/logout`
 * that deletes the stored token file. With no origin check, any page a browser
 * on the network visited could trigger it with a simple form post — CSRF.
 * Loopback is always allowed, since the app is served from the same origin.
 */
function requireSameOrigin(req: express.Request, res: express.Response): boolean {
  const origin = req.headers.origin;
  if (!origin) {
    // No Origin header: a same-origin form post or a non-browser client. Nothing
    // to forge, and the loopback bind is the primary control.
    return true;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    res.status(403).json({ error: "Malformed Origin header." });
    return false;
  }
  if (originHost === req.headers.host) return true;
  res.status(403).json({ error: "Cross-origin request rejected." });
  return false;
}

export function registerDriveRoutes(app: express.Express) {
  // 1. Initiate OAuth Login
  app.get("/api/auth/google/login", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const oauth2Client = getOAuth2Client(req);
    const redirectUri = (oauth2Client as any)._redirectUri || "";

    if (!clientId || !clientSecret) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Drive Setup Required</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #131722; color: #d1d4dc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
              .card { background: #1e222d; border: 1px solid #2a2e39; border-radius: 12px; padding: 28px; max-width: 480px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: left; }
              h2 { color: #f59e0b; margin-top: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; }
              p { font-size: 13px; color: #868993; line-height: 1.6; margin: 10px 0; }
              ol { font-size: 13px; color: #d1d4dc; padding-left: 20px; line-height: 1.6; }
              code { background: #131722; color: #2962ff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; }
              .btn { display: inline-block; margin-top: 18px; padding: 8px 16px; background: #2a2e39; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; border: 1px solid #363c4e; }
              .btn:hover { background: #363c4e; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>⚠️ Google OAuth Credentials Missing</h2>
              <p>To enable Google Drive Cloud Backup for ReplayX, the following environment variables must be configured in your environment settings:</p>
              <ol>
                <li><code>GOOGLE_CLIENT_ID</code></li>
                <li><code>GOOGLE_CLIENT_SECRET</code></li>
              </ol>
              <p>When creating your OAuth 2.0 Web Client in the Google Cloud Console, add this Authorized Redirect URI:</p>
              <p><code>${redirectUri || "https://ais-dev-kxu4kdps3l7uvw6v2nykya-157330748961.europe-west1.run.app/api/auth/google/callback"}</code></p>
              <button class="btn" onclick="window.close()">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }

    // CSRF defence for the OAuth leg. Without `state`, an attacker can start the
    // flow with their own authorization code and have the callback bind *their*
    // Google account to this server's token file — or drive a victim's browser
    // through the flow and capture the code. The nonce is issued here, held in
    // memory only until the callback, and compared on return.
    const state = issueOAuthState();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      state,
      scope: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    });

    if (req.query.mode === "redirect") {
      return res.redirect(authUrl);
    }
    return res.json({ url: authUrl, state });
  });

  // 2. OAuth Callback
  app.get("/api/auth/google/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send("Authorization code missing.");
    }
    // A callback with no state, or a state we did not issue, is not a callback
    // from a flow this server started.
    const returnedState = typeof req.query.state === "string" ? req.query.state : "";
    if (!returnedState || !consumeOAuthState(returnedState)) {
      console.warn("[GoogleDrive] Rejected OAuth callback with missing or unrecognised state.");
      return res
        .status(400)
        .send("OAuth state mismatch. Start the connection from the app and try again.");
    }
    try {
      const oauth2Client = getOAuth2Client(req);
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      let userInfo: { email: string; name?: string; picture?: string } = { email: "Connected User" };
      try {
        const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
        const userRes = await oauth2.userinfo.get();
        if (userRes.data && userRes.data.email) {
          userInfo = {
            email: userRes.data.email,
            name: userRes.data.name || undefined,
            picture: userRes.data.picture || undefined,
          };
        }
      } catch (e) {
        console.warn("[GoogleDrive] Could not fetch user profile:", e);
      }

      const stored: StoredDriveTokens = {
        tokens,
        user: userInfo,
      };
      saveStoredDriveTokens(stored);

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Drive Connected</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #131722; color: #d1d4dc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { background: #1e222d; border: 1px solid #2a2e39; border-radius: 12px; padding: 32px; text-align: center; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
              h2 { color: #2962ff; margin-top: 0; font-size: 20px; }
              p { font-size: 14px; color: #868993; line-height: 1.5; }
              .btn { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2962ff; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Google Drive Connected!</h2>
              <p>ReplayX workspace is now connected to Google Drive for automatic cloud backup.</p>
              <p>You can close this window to return to ReplayX.</p>
              <a href="/" class="btn" onclick="if(window.opener){window.opener.postMessage({ type: 'REPLAYX_GOOGLE_AUTH_SUCCESS' }, '*'); window.close(); return false;}">Return to App</a>
            </div>
            <script>
              if (window.opener) {
                try {
                  window.opener.postMessage({ type: 'REPLAYX_GOOGLE_AUTH_SUCCESS' }, '*');
                  setTimeout(function() { window.close(); }, 1200);
                } catch(e) {}
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("[GoogleDrive] Callback Error:", err);
      res.status(500).send(`Authentication failed: ${err.message || err}`);
    }
  });

  // 3. Status check
  app.get("/api/auth/google/status", async (req, res) => {
    const auth = await getAuthenticatedDriveClient(req);
    if (!auth) {
      return res.json({ connected: false });
    }

    let backupInfo: any = null;
    try {
      const listRes = await auth.drive.files.list({
        q: "name = 'ReplayX_Workspace_Backup.json' and trashed = false",
        fields: "files(id, name, modifiedTime, size)",
        pageSize: 1,
      });
      const file = listRes.data.files?.[0];
      if (file) {
        backupInfo = {
          exists: true,
          fileId: file.id,
          modifiedTime: file.modifiedTime,
          size: file.size ? parseInt(file.size, 10) : 0,
        };
      } else {
        backupInfo = { exists: false };
      }
    } catch (err: any) {
      console.warn("[GoogleDrive] Failed to query backup file status:", err?.message || err);
    }

    return res.json({
      connected: true,
      user: auth.stored.user,
      lastSyncAt: auth.stored.lastSyncAt || null,
      backupInfo,
    });
  });

  // 4. Logout / Disconnect
  app.post("/api/auth/google/logout", (req, res) => {
    // This deletes the stored token file. Unauthenticated and with no CSRF
    // defence it was reachable from any page the browser visited.
    if (!requireSameOrigin(req, res)) return;
    try {
      if (fs.existsSync(TOKENS_FILE)) {
        fs.unlinkSync(TOKENS_FILE);
      }
    } catch (e) {
      console.warn("[GoogleDrive] Logout unlink error:", e);
    }
    return res.json({ success: true, connected: false });
  });

  // 5. Automatic Sync Endpoint
  app.post("/api/drive/sync", async (req, res) => {
    if (!requireSameOrigin(req, res)) return;
    const auth = await getAuthenticatedDriveClient(req);
    if (!auth) {
      return res.status(401).json({ error: "Google Drive is not connected." });
    }

    const { workspaceState, deviceId, clientUpdatedAt, force } = req.body;
    if (!workspaceState) {
      return res.status(400).json({ error: "Missing workspaceState payload." });
    }

    try {
      const drive = auth.drive;

      const listRes = await drive.files.list({
        q: "name = 'ReplayX_Workspace_Backup.json' and trashed = false",
        fields: "files(id, name, modifiedTime, size)",
        pageSize: 1,
      });

      const existingFile = listRes.data.files?.[0];

      // Multi-device conflict check
      if (existingFile && existingFile.modifiedTime && clientUpdatedAt && !force) {
        const cloudTime = new Date(existingFile.modifiedTime).getTime();
        if (cloudTime > clientUpdatedAt + 5000) {
          return res.status(409).json({
            status: "conflict",
            message: "A newer backup exists in Google Drive from another device.",
            cloudModifiedTime: existingFile.modifiedTime,
            cloudFileId: existingFile.id,
          });
        }
      }

      const backupPayload = {
        version: 1,
        appName: "ReplayX Workspace",
        updatedAt: Date.now(),
        deviceId: deviceId || "default-device",
        workspaceState,
      };

      const jsonString = JSON.stringify(backupPayload, null, 2);
      const media = {
        mimeType: "application/json",
        body: jsonString,
      };

      let fileId = "";
      if (existingFile?.id) {
        fileId = existingFile.id;
        await drive.files.update({
          fileId: existingFile.id,
          media,
          fields: "id, name, modifiedTime, size",
        });
      } else {
        const createRes = await drive.files.create({
          requestBody: {
            name: "ReplayX_Workspace_Backup.json",
            mimeType: "application/json",
            description: "ReplayX complete workspace automatic cloud backup",
          },
          media,
          fields: "id, name, modifiedTime, size",
        });
        fileId = createRes.data.id!;
      }

      const now = Date.now();
      auth.stored.lastSyncAt = now;
      auth.stored.backupFileId = fileId;
      saveStoredDriveTokens(auth.stored);

      return res.json({
        status: "success",
        syncedAt: now,
        fileId,
        size: jsonString.length,
      });
    } catch (err: any) {
      console.error("[GoogleDrive] Sync error:", err);
      return res.status(500).json({ error: err?.message || "Failed to sync to Google Drive." });
    }
  });

  // 6. Restore Endpoint
  app.get("/api/drive/restore", async (req, res) => {
    const auth = await getAuthenticatedDriveClient(req);
    if (!auth) {
      return res.status(401).json({ error: "Google Drive is not connected." });
    }

    try {
      const drive = auth.drive;
      const listRes = await drive.files.list({
        q: "name = 'ReplayX_Workspace_Backup.json' and trashed = false",
        fields: "files(id, name, modifiedTime, size)",
        pageSize: 1,
      });

      const file = listRes.data.files?.[0];
      if (!file || !file.id) {
        return res.status(404).json({ error: "No ReplayX workspace backup found in Google Drive." });
      }

      const downloadRes = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "text" }
      );

      let backupData: any = downloadRes.data;
      if (typeof backupData === "string") {
        backupData = JSON.parse(backupData);
      }

      if (!backupData || !backupData.workspaceState) {
        return res.status(422).json({ error: "Backup file is invalid or corrupted." });
      }

      return res.json({
        status: "success",
        updatedAt: backupData.updatedAt || file.modifiedTime,
        deviceId: backupData.deviceId,
        workspaceState: backupData.workspaceState,
      });
    } catch (err: any) {
      console.error("[GoogleDrive] Restore error:", err);
      return res.status(500).json({ error: err?.message || "Failed to restore backup from Google Drive." });
    }
  });
}
