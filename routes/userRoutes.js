import express from "express";
import {
  applyForJob,
  getUserData,
  getUserJobApplications,
  googleAuth,
  loginUser,
  logout,
  registerUser,
  updateUserResume,
  forgotPassword,
  updatePassword,
} from "../controllers/userController.js";
import upload from "../config/multer.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

//register
router.post("/user-register", registerUser); //tested - integrated

//login
router.post("/user-login", loginUser); //tested - integrated

// Login With Google
router.post("/google-auth", googleAuth); //tested - integrated 

// Get user Data
router.get("/user", authenticate, getUserData); //tested - integrated

// Apply for a job
router.post("/apply/:id", authenticate, applyForJob); //tested

// Get applied jobs data
router.get("/applications", authenticate, getUserJobApplications); //tested - integrated

// update user resume
router.post(
  "/update-resume",
  authenticate,
  upload.single("resume"),
  updateUserResume
); //tested

//logout user
router.post("/user-logout", logout);

//forgot password
router.post("/forgot-password", forgotPassword);

//update password
router.post("/update-password", authenticate, updatePassword);

export default router;
