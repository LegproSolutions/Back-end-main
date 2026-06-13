import express from "express";
import {
  getCandidates,
  getCandidateById,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  bulkCandidateImport,
  getClients,
  getClientById,
  createClient,
  updateClient,
  updatePipelineStage,
  getCRMJobs,
  getCRMStats,
  getPipelineByClient,
} from "../../controllers/crm/crmController.js";
import {
  loginCompanyStaff,
  getCRMMe,
  logoutCRM
} from "../../controllers/crm/crmAuthController.js";
import {
  getCRMDashboardStats
} from "../../controllers/crm/dashboardController.js";
import {
  createTeamMember,
  getTeamMembers,
  updateTeamMember,
  deleteTeamMember
} from "../../controllers/crm/teamController.js";
import {
  getNotifications,
  markNotificationRead
} from "../../controllers/crm/notificationController.js";
import {
  getCRMReportsSummary,
  exportCRMReportCSV
} from "../../controllers/crm/reportController.js";
import {
  assignCandidates,
  getAssignmentHistory
} from "../../controllers/crm/assignmentController.js";
import {
  logCall,
  getFollowupsDueToday
} from "../../controllers/crm/callController.js";
import {
  getRecruiterPerformance,
  getRecruiterLeaderboard,
  getManagerReports
} from "../../controllers/crm/performanceController.js";
import { protectCRM, roleCheck } from "../../middleware/authMiddleware.js";
import { checkCrmPermission } from "../../middleware/crmPermissionMiddleware.js";

const crmRouter = express.Router();

// --- PUBLIC AUTH ENDPOINTS ---
crmRouter.post("/auth/login", loginCompanyStaff);
crmRouter.post("/auth/logout", logoutCRM);

// --- PROTECTED CRM ROUTES (Employer / Staff / Admin) ---
crmRouter.use(protectCRM);

// Current Session Info
crmRouter.get("/auth/me", getCRMMe);

// Dashboard Analytics
crmRouter.get("/dashboard/stats", checkCrmPermission("dashboard_view"), getCRMDashboardStats);

// Candidates
crmRouter.get("/candidates", checkCrmPermission("candidate_view"), getCandidates);
crmRouter.get("/candidates/:id", checkCrmPermission("candidate_view"), getCandidateById);
crmRouter.post("/candidates", checkCrmPermission("candidate_add"), createCandidate);
crmRouter.put("/candidates/:id", checkCrmPermission("candidate_edit"), updateCandidate);
crmRouter.delete("/candidates/:id", checkCrmPermission("candidate_delete"), deleteCandidate);
crmRouter.post("/candidates/bulk-json", checkCrmPermission("candidate_add"), bulkCandidateImport);

// Clients
crmRouter.get("/clients", checkCrmPermission("client_view"), getClients);
crmRouter.get("/clients/:id", checkCrmPermission("client_view"), getClientById);
crmRouter.post("/clients", checkCrmPermission("client_add"), createClient);
crmRouter.put("/clients/:id", checkCrmPermission("client_edit"), updateClient);

// Pipeline
crmRouter.post("/pipeline/update", checkCrmPermission("application_status_update"), updatePipelineStage);
crmRouter.put("/pipeline/candidate/:candidateId/stage", checkCrmPermission("application_status_update"), updatePipelineStage);
crmRouter.get("/pipeline/client/:id", checkCrmPermission("application_view"), getPipelineByClient);

// Jobs
crmRouter.get("/jobs", checkCrmPermission("job_view"), getCRMJobs);

// Old Stats
crmRouter.get("/stats", checkCrmPermission("dashboard_view"), getCRMStats);

// --- NEW MODULE 12: TEAM MANAGEMENT ---
crmRouter.post("/team", checkCrmPermission("users_create"), createTeamMember);
crmRouter.get("/team", checkCrmPermission("settings_view"), getTeamMembers);
crmRouter.put("/team/:id", checkCrmPermission("users_edit"), updateTeamMember);
crmRouter.delete("/team/:id", checkCrmPermission("users_delete"), deleteTeamMember);

// --- NEW MODULE 17: NOTIFICATION CENTER ---
crmRouter.get("/notifications", checkCrmPermission("settings_view"), getNotifications);
crmRouter.put("/notifications/:id/read", checkCrmPermission("settings_manage"), markNotificationRead);

// --- NEW MODULE 15: REPORTS & ANALYTICS ---
crmRouter.get("/reports/summary", checkCrmPermission("reports_view"), getCRMReportsSummary);
crmRouter.get("/reports/export-csv", checkCrmPermission("reports_export"), exportCRMReportCSV);

// --- ADDITIONAL MODULES: ASSIGNMENTS, CALLS, PERFORMANCE ---
crmRouter.post("/assignment/assign", checkCrmPermission("candidate_edit"), assignCandidates);
crmRouter.get("/assignment/history", checkCrmPermission("candidate_view"), getAssignmentHistory);
crmRouter.post("/calls/log", checkCrmPermission("candidate_edit"), logCall);
crmRouter.get("/calls/followups", checkCrmPermission("candidate_view"), getFollowupsDueToday);
crmRouter.get("/performance/dashboard", checkCrmPermission("dashboard_view"), getRecruiterPerformance);
crmRouter.get("/performance/leaderboard", checkCrmPermission("dashboard_view"), getRecruiterLeaderboard);
crmRouter.get("/reports/dashboard", checkCrmPermission("reports_view"), getManagerReports);

export default crmRouter;
