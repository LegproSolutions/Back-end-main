import express from "express";
import {
  registerCompany,
  loginCompany,
  getCompanyData,
  postJob,
  listCompanyJobs,
  getCompanyJobApplicants,
  changeJobApplicationStatus,
  changeInterviewStatus,
  changeOnboardingStatus,
  editJob,
  deleteJob,
  logoutCompany,
  forgotPassword,
  updatePassword,
  updateCompanyProfile
} from "../controllers/companyController.js";
import upload from "../config/multer.js";
import { protectCompany } from "../middleware/authMiddleware.js";

const router = express.Router();

// Registration
router.post("/register", upload.single("image"), registerCompany);

// Login
router.post("/login", loginCompany);

// Logout
router.post("/logout", logoutCompany);

// Get company data
router.get("/company", protectCompany, getCompanyData);

// Update company data
router.put("/update-company", protectCompany, upload.single("image"), updateCompanyProfile);

// Post job
router.post("/post-job", protectCompany, postJob);

// List company jobs
router.get("/list-jobs", protectCompany, listCompanyJobs);

// Get applicants for a job
router.get("/applicants/:jobId", protectCompany, getCompanyJobApplicants);

// Change application status
router.post("/change-status", protectCompany, changeJobApplicationStatus);

// Change interview status
router.post("/change-int", protectCompany, changeInterviewStatus);

// Change onboarding status
router.post("/change-onboard", protectCompany, changeOnboardingStatus);

// Edit job
router.put("/edit-job/:jobId", protectCompany, editJob);

// Delete job
router.delete("/delete-job/:jobId", protectCompany, deleteJob);

// Forgot password
router.post("/forgot-password", forgotPassword);

// Update password
router.post("/update-password", updatePassword);

export default router;
