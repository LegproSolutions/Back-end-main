import dotenv from "dotenv";
dotenv.config();
import "./config/instrument.js";
import express from "express";
import cors from "cors";
import prisma from "./config/prisma.js";
import * as Sentry from "@sentry/node";
import adminRoutes from "./routes/adminRoutes.js";
import connectCloudinary from "./config/cloudinary.js";
import jobRoutes from "./routes/jobRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import userProfileRoutes from "./routes/userProfile.js";
import statRoutes from "./routes/statRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import crmRouter from "./routes/crm/crmRoutes.js";
import cookieParser from "cookie-parser";
import { addDirectAdmin } from "./controllers/adminController.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();

// ✅ Trusted Frontend Origins
const allowedOrigins = [
  "https://www.jobmela.co.in", // main domain
  "https://jobmela.co.in", // without www
  "https://jobmela.com",
  "https://www.jobmela.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://192.168.1.10:5174",
];

// ✅ Secure CORS Setup
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow mobile apps/postman
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".lhr.life") ||
      origin.includes("serveo") ||
      origin.endsWith(".loca.lt")
    ) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked for origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "Accept",
    "Origin",
    "User-Agent",
    "DNT",
    "Cache-Control",
    "X-Mx-ReqToken",
    "Keep-Alive",
    "X-Requested-With",
    "If-Modified-Since",
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Enable preflight

// ✅ Middleware Config
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(cookieParser());

// ✅ Optional: Redirect HTTP → HTTPS
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === "production" &&
    req.headers["x-forwarded-proto"] !== "https"
  ) {
    return res.redirect("https://" + req.headers.host + req.url);
  }
  next();
});

// ✅ Test Routes
app.get("/", (req, res) => res.send("🚀 JobMela API is Live!"));
app.get("/api/test", (req, res) =>
  res.json({ success: true, message: "Backend API working fine!" })
);

// ✅ API Routes
app.use("/api/admin", adminRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", userProfileRoutes);
app.use("/api/stats", statRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/crm", crmRouter);

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Serve resumes with explicit sendFile and headers to prevent blank pages in browser
app.get('/uploads/resumes/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'public/uploads/resumes', req.params.filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Resume Not Found</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            text-align: center;
            padding: 80px 20px;
            background: #f8fafc;
            color: #334155;
            margin: 0;
          }
          .card {
            max-width: 480px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
            border: 1px solid #e2e8f0;
          }
          h1 {
            color: #ef4444;
            margin-top: 0;
            font-size: 24px;
          }
          p {
            font-size: 16px;
            line-height: 1.6;
            color: #64748b;
          }
          .btn {
            display: inline-block;
            margin-top: 24px;
            padding: 10px 20px;
            background-color: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            font-size: 14px;
          }
          .btn:hover {
            background-color: #2563eb;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Resume Not Found</h1>
          <p>The requested resume file is not available on the server. The file might have been moved or deleted.</p>
          <a href="javascript:window.close()" class="btn">Close Tab</a>
        </div>
      </body>
      </html>
    `);
  }

  // Detect file header/format
  try {
    const buffer = Buffer.alloc(10);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 10, 0);
    fs.closeSync(fd);
    
    const fileHeader = buffer.toString('utf-8');
    const isRealPdf = fileHeader.startsWith('%PDF-');

    if (isRealPdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
      return res.sendFile(filePath);
    } else {
      // Serve mock/text resume as beautiful HTML layout
      const content = fs.readFileSync(filePath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Resume Preview</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              padding: 40px 20px;
              background-color: #f1f5f9;
              color: #1e293b;
              margin: 0;
              display: flex;
              justify-content: center;
            }
            .container {
              width: 100%;
              max-width: 800px;
              background: #ffffff;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
              border: 1px solid #e2e8f0;
            }
            .header-banner {
              background: #3b82f6;
              color: white;
              padding: 10px 20px;
              border-radius: 6px;
              margin-bottom: 24px;
              font-size: 14px;
              font-weight: 500;
              text-align: center;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              font-family: inherit;
              font-size: 15px;
              line-height: 1.6;
              margin: 0;
              color: #334155;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header-banner">📄 Candidate Resume Preview (Mock Data)</div>
            <pre>${escapeHtml(content)}</pre>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("Error serving resume:", error);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Internal Server Error</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 80px 20px; background: #f8fafc; }
          .card { max-width: 480px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; border: 1px solid #e2e8f0; }
          h1 { color: #ef4444; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Error Loading Resume</h1>
          <p>An unexpected error occurred while loading the resume. Please try again later.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Serve static uploads folder with proper headers for PDFs
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ✅ Sentry Error Handler (optional but recommended)
app.use(Sentry.Handlers.errorHandler());

// ✅ Port
const PORT = process.env.PORT || 5001;

// ✅ Initialize Direct Admin Account
const initializeDirectAdmin = async () => {
  try {
    console.log("🔧 Initializing direct admin...");
    const result = await addDirectAdmin();

    if (result.success) {
      console.log("✅ Direct admin initialized successfully!");
      console.log(`📧 Email: ${process.env.ADMIN_EMAIL || "AdminAbhisek@JobMela.com"}`);
      console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || "Pass1125@"}`);
      console.log("🪪 PassKey: NAVGAP2025BJ");
    } else {
      console.log("ℹ️ Direct admin initialization:", result.message);
    }
  } catch (error) {
    console.error("❌ Error initializing direct admin:", error.message);
  }
};

// ✅ Start Server
const startServer = async () => {
  try {
    // Test Prisma Connection
    await prisma.$connect();
    console.log("✅ PostgreSQL connected successfully via Prisma");

    await connectCloudinary();
    console.log("✅ Cloudinary connected successfully");

    await initializeDirectAdmin();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server is live on port ${PORT}`);
      console.log("🌐 Frontend allowed origins:");
      allowedOrigins.forEach((o) => console.log("  - " + o));
      console.log("📡 Ready to accept requests from JobMela frontend!");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer(); 

