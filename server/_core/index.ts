import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import axios from "axios";

const BACKEND_BASE_URL = process.env.TZ_BACKEND_URL || "https://tzapp-admin.figo.cn";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // API Proxy: forward /api/tz/* to customer backend
  // MUST be registered BEFORE body parsers so multipart/form-data is forwarded raw
  app.all("/api/tz/*", async (req, res) => {
    try {
      const targetPath = req.originalUrl.replace("/api/tz", "");
      const targetUrl = `${BACKEND_BASE_URL}${targetPath}`;
      const contentType = req.headers["content-type"] || "application/json";
      const isMultipart = contentType.includes("multipart/form-data");

      const headers: Record<string, string> = {};
      // For multipart, forward Content-Type with boundary intact
      if (isMultipart) {
        headers["Content-Type"] = contentType;
      } else {
        headers["Content-Type"] = contentType;
      }
      if (req.headers["x-app-key"]) headers["X-App-Key"] = req.headers["x-app-key"] as string;
      if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"] as string;

      let requestData: any;
      if (isMultipart) {
        // For multipart requests, pipe raw body directly
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => resolve());
          req.on("error", reject);
        });
        requestData = Buffer.concat(chunks);
      } else {
        // For JSON requests, parse body first
        requestData = await new Promise<any>((resolve, reject) => {
          let body = "";
          req.on("data", (chunk: string) => { body += chunk; });
          req.on("end", () => {
            try {
              resolve(body ? JSON.parse(body) : undefined);
            } catch {
              resolve(body);
            }
          });
          req.on("error", reject);
        });
      }

      const response = await axios({
        method: req.method as any,
        url: targetUrl,
        data: requestData,
        headers,
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
        validateStatus: () => true,
        responseType: "arraybuffer",
      });

      // Forward response headers
      const respContentType = response.headers["content-type"];
      if (respContentType) res.setHeader("Content-Type", respContentType);
      res.status(response.status).send(response.data);
    } catch (err: any) {
      console.error("[API Proxy Error]", err.message);
      res.status(502).json({ error: "Backend proxy error", message: err.message });
    }
  });

  // Configure body parser AFTER proxy routes
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
