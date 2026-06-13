import prisma from "../config/prisma.js";
import { v2 as cloudinary } from "cloudinary";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import streamifier from "streamifier";
import { OAuth2Client } from "google-auth-library";
import fs from "fs/promises";
import path from "path";
import { sendEmail } from "../utils/sendEmail.js";


//register
export const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // 1. Full Name Validation
    const nameRegex = /^[A-Za-z\s]+$/;
    if (name.trim().length < 3 || !nameRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid full name",
      });
    }

    // 2. Email Validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    // 3. Phone Validation
    const phoneRegex = /^(?:\+91|91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid Indian mobile number",
      });
    }

    // 4. Password Validation
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    if (
      password.length < 8 ||
      !hasUppercase ||
      !hasLowercase ||
      !hasNumber ||
      !hasSpecial
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must contain uppercase, lowercase, number and special character",
      });
    }

    // Check if email or phone is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });

    if (existingUser) {
      let msg =
        existingUser.email === email
          ? "Email is already registered"
          : "Phone number is already registered";

      return res.status(400).json({
        success: false,
        message: msg,
      });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user, profile, and CRM candidate in a transaction
    const [newUser, newUserProfile] = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone,
          password: hashedPassword,
        },
      });

      const profile = await tx.userProfile.create({
        data: {
          userId: user.id,
          firstName: name.split(" ")[0] || name,
          lastName: name.split(" ")[1] || "",
          email,
          phone,
        },
      });

      // Also create/sync with CRM Talent Pool
      await tx.cRMCandidate.upsert({
        where: { phone: phone },
        update: {
          name,
          email,
          source: "JobMela Portal"
        },
        create: {
          name,
          phone,
          email,
          source: "JobMela Portal",
          status: "new_lead"
        }
      });

      return [user, profile];
    });

    // Generate JWT token (expires in 1 day)
    const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    // Set the JWT token in a cookie
    res.cookie("user_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send token in response too
    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUserProfile.phone,
      },
      message: "User registered successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login Controller
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide email and password" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res
        .status(400)
        .json({
          success: false,
          message: "No account found with this email address. Please register first to apply for jobs."
        });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account was created with Google. Please use Google Sign-In.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Email or Password" });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.cookie("user_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      requirePasswordUpdate: user.isTempPassword,
      message: "Login successful",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login_With_Google Controller
export const googleAuth = async (req, res) => {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  const { code } = req.body;
  try {
    const oAuth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "postmessage"
    );

    const { tokens } = await oAuth2Client.getToken(code);
    const { id_token } = tokens;

    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email, name, picture } = ticket.getPayload();

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name,
            email,
            image: picture,
          },
        });

        await tx.userProfile.create({
          data: {
            userId: newUser.id,
            firstName: name.split(" ")[0] || name,
            lastName: name.split(" ")[1] || "",
            email,
          },
        });
        return newUser;
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res
      .cookie("user_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .status(200)
      .json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image || null,
        },
        message: "Google login successful",
      });
  } catch (err) {
    console.error("Google Auth Error:", err);
    res.status(500).json({
      success: false,
      message: "Google authentication failed",
      error: err.message,
    });
  }
};

// Get user data
export const getUserData = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { profile: true },
    });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const { password, profile, ...userWithoutPassword } = user;
    const flattenedUser = {
      ...userWithoutPassword,
      ...(profile || {}),
    };
    res.json({ success: true, user: flattenedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Apply For Job
export const applyForJob = async (req, res) => {
  const { companyId, ...applicationData } = req.body;
  const userId = req.user.id;
  const jobId = req.params.id;

  try {
    let jobData;
    if (/^\d+$/.test(jobId)) {
      jobData = await prisma.job.findUnique({ where: { jobId: parseInt(jobId) } });
    } else {
      jobData = await prisma.job.findUnique({ where: { id: jobId } });
    }

    if (!jobData) {
      return res.status(404).json({ success: false, message: "Job Not Found" });
    }

    if (new Date() > new Date(jobData.deadline)) {
      return res.status(400).json({ success: false, message: "This job has expired." });
    }

    if (companyId && jobData.companyId !== companyId) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request: the selected job does not belong to the specified company.",
      });
    }

    const isAlreadyApplied = await prisma.jobApplication.findFirst({
      where: { jobId: jobData.id, userId },
    });
    if (isAlreadyApplied) {
      return res
        .status(400)
        .json({ success: false, message: "Already Applied" });
    }

    const application = await prisma.jobApplication.create({
      data: {
        companyId: jobData.companyId,
        userId,
        jobId: jobData.id,
        applicationData,
        date: BigInt(Date.now()),
      },
    });

    // Run CRM sync in background (non-blocking)
    syncApplicationToCRM(userId, jobData.companyId, jobData.id, applicationData).catch(err => 
      console.error("CRM sync failed:", err.message)
    );

    res.json({ success: true, message: "Applied Successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get User Applied Applications Data
export const getUserJobApplications = async (req, res) => {
  try {
    const userId = req.user.id;

    const applications = await prisma.jobApplication.findMany({
      where: { userId },
      include: {
        company: {
          select: { name: true, email: true, image: true }
        },
        job: {
          select: { title: true, description: true, location: true, category: true, level: true, salary: true, id: true, jobId: true, hrContact: true, companyDetails: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const normalizedApplications = applications.map(app => ({
      ...app,
      date: app.date ? Number(app.date) : null
    }));

    return res.json({ success: true, applications: normalizedApplications });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Update User Resume
export const updateUserResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resumeFile = req.file;

    if (!resumeFile) {
      return res.json({
        success: false,
        message: "No file received by Multer",
      });
    }

    // Check if Cloudinary is configured
    const isCloudinaryConfigured = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_KEY !== "your_api_key";

    let uploadResult;
    if (isCloudinaryConfigured) {
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "resumes", resource_type: "raw" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          streamifier.createReadStream(buffer).pipe(stream);
        });
      };
      uploadResult = await streamUpload(resumeFile.buffer);
    } else {
      console.warn("Cloudinary not configured. Using local storage instead.");
      const uploadDir = path.join(process.cwd(), "public", "uploads", "resumes");
      await fs.mkdir(uploadDir, { recursive: true });
      const filename = `resume_${userId}_${Date.now()}.pdf`;
      const filePath = path.join(uploadDir, filename);
      await fs.writeFile(filePath, resumeFile.buffer);
      const baseUrl = req.protocol + "://" + req.get("host");
      uploadResult = {
        secure_url: `${baseUrl}/uploads/resumes/${filename}`,
        public_id: `local_${filename}`
      };
    }

    // Update user and user profile in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { resume: uploadResult.secure_url }
      }),
      prisma.userProfile.upsert({
        where: { userId },
        update: { 
          resume: uploadResult,
          updatedAt: new Date()
        },
        create: {
          userId,
          email: req.user.email,
          resume: uploadResult,
          updatedAt: new Date()
        }
      })
    ]);

    return res.json({ success: true, message: isCloudinaryConfigured ? "Resume Updated" : "Resume Updated (Mock Mode)", url: uploadResult.secure_url });
  } catch (error) {
    console.error("Update Resume Error:", error);
    return res.json({ success: false, message: error.message });
  }
};

// Logout Controller
export const logout = async (req, res) => {
  try {
    res.clearCookie("user_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Forgot Password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword, isTempPassword: true }
    });

    const emailSent = await sendEmail({
      to: email,
      subject: "Password Reset - Job Mela",
      text: `Your temporary password is: ${tempPassword}\nPlease login and update your password immediately.`,
      html: `<p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please login and update your password immediately.</p>`
    });

    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send email. Please try again later." });
    }

    res.json({ success: true, message: "A temporary password has been sent to your email." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update Password
export const updatePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user.id;

    if (!newPassword) {
      return res.status(400).json({ success: false, message: "New password is required" });
    }

    // Validation
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
    if (
      newPassword.length < 8 ||
      !hasUppercase ||
      !hasLowercase ||
      !hasNumber ||
      !hasSpecial
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must contain uppercase, lowercase, number and special character",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, isTempPassword: false }
    });

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper to sync portal application to CRM candidate and pipeline
const syncApplicationToCRM = async (userId, companyId, jobId, applicationData) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!user) return;

    const phone = user.phone || user.profile?.phone || applicationData.phone || "0000000000";
    const email = user.email || user.profile?.email || null;
    const name = user.name || "Portal Applicant";

    // Find or create CRM Client for this company
    let client = await prisma.client.findFirst({
      where: { companyId }
    });

    if (!client) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (company) {
        client = await prisma.client.create({
          data: {
            companyId,
            company_name: company.name,
            email: company.email,
            phone: company.phone,
            contact_person: company.name,
            industry: "Other",
            status: "active"
          }
        });
      }
    }

    if (!client) return;

    // Find or create CRM Job corresponding to portal Job
    let crmJob = await prisma.cRMJob.findFirst({
      where: { jobId }
    });

    if (!crmJob) {
      const portalJob = await prisma.job.findUnique({ where: { id: jobId } });
      if (portalJob) {
        crmJob = await prisma.cRMJob.create({
          data: {
            jobId,
            client_id: client.id,
            title: portalJob.title,
            location: portalJob.location,
            minSalary: String(portalJob.salary),
            maxSalary: String(portalJob.salary),
            openPositions: portalJob.openings,
            requirements: portalJob.description,
            education: portalJob.qualification,
            minExperience: String(portalJob.experience)
          }
        });
      }
    }

    const cleanPhone = String(phone).replace(/[^0-9]/g, '').slice(-10);
    
    let crmCandidate = await prisma.cRMCandidate.findFirst({
      where: { phone: cleanPhone }
    });

    if (crmCandidate) {
      crmCandidate = await prisma.cRMCandidate.update({
        where: { id: crmCandidate.id },
        data: {
          userId,
          name,
          email: email || crmCandidate.email,
          resume_url: user.resume || crmCandidate.resume_url,
          status: "Applied"
        }
      });
    } else {
      crmCandidate = await prisma.cRMCandidate.create({
        data: {
          client_id: client.id,
          userId,
          name,
          phone: cleanPhone,
          email,
          resume_url: user.resume,
          source: "JobMela Portal",
          status: "Applied"
        }
      });
    }

    let stage = await prisma.pipelineStage.findUnique({
      where: { stage_name: "Applied" }
    });

    if (!stage) {
      stage = await prisma.pipelineStage.create({
        data: { stage_name: "Applied", order: 0 }
      });
    }

    const existingPipeline = await prisma.candidatePipeline.findFirst({
      where: { candidate_id: crmCandidate.id, client_id: client.id }
    });

    if (existingPipeline) {
      await prisma.candidatePipeline.update({
        where: { id: existingPipeline.id },
        data: { stage_id: stage.id }
      });
    } else {
      await prisma.candidatePipeline.create({
        data: {
          candidate_id: crmCandidate.id,
          client_id: client.id,
          stage_id: stage.id,
          notes: `Applied to job: ${crmJob?.title || "Portal Job"}`
        }
      });
    }

    await prisma.auditLog.create({
      data: {
        companyId,
        action: "CANDIDATE_APPLIED",
        details: `Candidate ${name} applied from portal to job: ${crmJob?.title || "Portal Job"}`
      }
    });

  } catch (err) {
    console.error("Error syncing portal application to CRM:", err.message);
  }
};


