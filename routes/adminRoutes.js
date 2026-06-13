import express from "express";
import { uploadCandidatesCSV, uploadUsersCSV } from "../controllers/adminController.js";
import {
  allUser,
  createJobByAdmin,
  getAllCompanies,
  getAdminData,
  getUserProfileById,
  loginAdmin,
  logoutAdmin,
  registerAdmin,
  raiseJobObjection,
  getUserJobApplications,
  getCompanyPostedJobs,
  getCompanyJobApplicants,
  updateJobByAdmin,
  getJobApplicationStats,
  changeApplicationStatus,
  createSubAdmin,
  getAllSubAdmins,
  deleteSubAdmin,
  getEligibleCandidates,
  verifyJob,
  approveCompanyChange,
  rejectCompanyChange,
} from "../controllers/adminController.js";
import { protectAdmin, protectAdminOrCRM } from "../middleware/authMiddleware.js";
import upload from "../config/multer.js";
const router = express.Router();

// Register Admin
router.post("/register", registerAdmin);
router.post(
  "/upload-candidates-csv",
  protectAdmin,
  upload.single("file"),
  uploadCandidatesCSV
);
router.post(
  "/upload-users-csv",
  protectAdmin,
  upload.single("file"),
  uploadUsersCSV
);
// Admin Login
router.post("/login", loginAdmin);
router.get("/logout", protectAdmin, logoutAdmin);
router.get("/admin", protectAdmin, getAdminData);

// Admin job creation routes (accept companyImage file)
router.post("/create-job", protectAdmin, upload.single('companyImage'), createJobByAdmin);
router.get("/companies", protectAdmin, getAllCompanies);
router.put("/companies/:companyId/approve-changes", protectAdmin, approveCompanyChange);
router.put("/companies/:companyId/reject-changes", protectAdmin, rejectCompanyChange);

// Admin jobs listing (primary admin sees all jobs; sub-admin sees only their created jobs; CRM users see all allocated jobs)
router.get("/jobs", protectAdminOrCRM, async (req, res, next) => {
  // forward to controller implementation
  try {
    const controller = await import('../controllers/adminController.js');
    return controller.getAdminJobs(req, res);
  } catch (err) {
    next(err);
  }
});

// Sub-Admin management (only accessible to primary admin)
router.post("/sub-admin", protectAdmin, createSubAdmin);
router.get("/sub-admins", protectAdmin, getAllSubAdmins);
router.delete("/sub-admins/:subAdminId", protectAdmin, deleteSubAdmin);

// User management routes
router.get("/all-users", protectAdmin, allUser);

// Route to get user profile by userId
router.get("/user-profile/:userId", protectAdminOrCRM, getUserProfileById);
router.get("/job-applications/:userId", protectAdmin, getUserJobApplications);

// Route to raise an objection for a job post
router.put("/job-objection/:jobId", protectAdmin, raiseJobObjection);

// Route: Get all job posts by a specific company (recruiter)
router.get("/company-jobs/:companyId", protectAdmin, getCompanyPostedJobs);

// Route: Get all applicants for a specific job
router.get("/job-applicants/:jobId", protectAdminOrCRM, getCompanyJobApplicants);

// Route: Update job by admin
router.put("/jobs/:jobId", protectAdmin, updateJobByAdmin);
router.put("/jobs/:jobId/verify", protectAdmin, verifyJob);

// Routes: Accept and reject job applications
router.put("/applications/:applicationId/status", protectAdmin, changeApplicationStatus);

// Route: Get application statistics for a job (optional)
router.get("/job-stats/:jobId", protectAdmin, getJobApplicationStats);

// Route: Get eligible CRM candidates for a job
router.get("/jobs/:jobId/eligible-candidates", protectAdminOrCRM, getEligibleCandidates);

// Route: Delete job by admin
router.delete("/jobs/:jobId", protectAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const deleted = await (await import('../models/Job.js')).default.findByIdAndDelete(jobId);
    if (!deleted) return res.status(404).json({ success: false, message: 'Job not found' });
    return res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job by admin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
