import express from "express";
import { getJobById, getJobs, getCompaniesWithJobs } from "../controllers/jobController.js";

const router = express.Router();

// Route to get all jobs data
router.get("/", getJobs);

// Route to get companies with their jobs
router.get("/companies-with-jobs", getCompaniesWithJobs);

// Route to get a single job by ID (this should be last to avoid conflicts)
router.get("/:id", getJobById);

export default router;
