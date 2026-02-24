
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

console.log("Initializing StallMate Server...");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Starting StallMate Server...");
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Google OAuth URL generation
  app.get("/api/auth/google/url", (req, res) => {
    const client_id = "950489680613-dnvqv44q1aml8tdakijnp0r0hr5gqqt0.apps.googleusercontent.com";
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirect_uri = `${appUrl.replace(/\/$/, '')}/auth/callback`;
    const scope = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ');

    const params = new URLSearchParams({
      client_id,
      redirect_uri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent'
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url });
  });

  // Google OAuth Callback
  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("No code provided");
    }

    const client_id = "950489680613-dnvqv44q1aml8tdakijnp0r0hr5gqqt0.apps.googleusercontent.com";
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirect_uri = `${appUrl.replace(/\/$/, '')}/auth/callback`;

    if (!client_secret) {
      return res.status(500).send("GOOGLE_CLIENT_SECRET not configured on server");
    }

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id,
          client_secret,
          redirect_uri,
          grant_type: "authorization_code",
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        return res.status(500).send(`Token exchange failed: ${data.error_description || data.error}`);
      }

      // Send success message to parent window and close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  payload: ${JSON.stringify(data)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth exchange error:", error);
      res.status(500).send("Internal server error during token exchange");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
