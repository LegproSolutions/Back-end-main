import express from "express";
import prisma from "../config/prisma.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { v2 as cloudinary } from 'cloudinary';
import upload from "../config/multer.js";
import streamifier from "streamifier";
import fs from "fs/promises";
import path from "path";

const router = express.Router();

// Create or update user profile
router.post("/create", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const profileData = req.body;

    // Remove unwanted fields from body if they exist
    delete profileData.id;
    delete profileData.userId;

    // Convert dateOfBirth to Date object if it exists and is not empty
    if (profileData.dateOfBirth && profileData.dateOfBirth.toString().trim() !== "") {
      profileData.dateOfBirth = new Date(profileData.dateOfBirth);
    } else {
      profileData.dateOfBirth = null;
    }

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: { 
        ...profileData,
        updatedAt: new Date()
      },
      create: {
        ...profileData,
        userId,
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get user profile
router.get("/get-user", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Upload resume
router.post("/upload-resume", authenticate, upload.single('resume'), async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No resume file uploaded"
      });
    }

    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        success: false,
        message: "Only PDF files are allowed for resume upload"
      });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File size should be less than 5MB"
      });
    }

    const existingProfile = await prisma.userProfile.findUnique({ where: { userId } });
    
    // Check if Cloudinary is configured
    const isCloudinaryConfigured = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_KEY !== "your_api_key";

    if (isCloudinaryConfigured && existingProfile && existingProfile.resume && typeof existingProfile.resume === 'object') {
      const resumeObj = existingProfile.resume;
      if (resumeObj.publicId) {
        try {
          await cloudinary.uploader.destroy(resumeObj.publicId, {
            resource_type: 'raw'
          });
        } catch (deleteError) {
          console.error('Error deleting previous resume:', deleteError);
        }
      }
    }

    let uploadResult;
    if (isCloudinaryConfigured) {
      uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'resumes',
            public_id: `resume_${userId}_${Date.now()}`,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
    } else {
      console.warn("Cloudinary not configured. Using local storage instead.");
      const uploadDir = path.join(process.cwd(), "public", "uploads", "resumes");
      await fs.mkdir(uploadDir, { recursive: true });
      const filename = `resume_${userId}_${Date.now()}.pdf`;
      const filePath = path.join(uploadDir, filename);
      await fs.writeFile(filePath, req.file.buffer);
      const baseUrl = req.protocol + "://" + req.get("host");
      uploadResult = {
        secure_url: `${baseUrl}/uploads/resumes/${filename}`,
        public_id: `local_${filename}`
      };
    }

    const resumeData = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      originalName: req.file.originalname,
      uploadedAt: new Date()
    };

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { resume: resumeData.url }
      }),
      prisma.userProfile.upsert({
        where: { userId },
        update: { 
          resume: resumeData,
          updatedAt: new Date()
        },
        create: {
          userId,
          email: req.user.email,
          resume: resumeData,
          updatedAt: new Date()
        }
      })
    ]);

    res.status(200).json({
      success: true,
      message: isCloudinaryConfigured ? "Resume uploaded successfully" : "Resume uploaded successfully (Mock Mode)",
      url: resumeData.url,
      publicId: resumeData.publicId,
      originalName: resumeData.originalName
    });

  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({
      success: false,
      message: "Error uploading resume. Please try again.",
      error: error.message
    });
  }
});

// Upload Profile Image
router.post("/upload-profileImage", authenticate, upload.single('profileImage'), async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file uploaded"
      });
    }

    // Check if Cloudinary is configured
    const isCloudinaryConfigured = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_KEY !== "your_api_key";

    let uploadResult;
    if (isCloudinaryConfigured) {
      uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'profile_images',
            public_id: `profile_${userId}_${Date.now()}`,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
    } else {
      console.warn("Cloudinary not configured. Using local storage instead.");
      const uploadDir = path.join(process.cwd(), "public", "uploads", "profile_images");
      await fs.mkdir(uploadDir, { recursive: true });
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `profile_${userId}_${Date.now()}${ext}`;
      const filePath = path.join(uploadDir, filename);
      await fs.writeFile(filePath, req.file.buffer);
      const baseUrl = req.protocol + "://" + req.get("host");
      uploadResult = {
        secure_url: `${baseUrl}/uploads/profile_images/${filename}`,
        public_id: `local_${filename}`
      };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { image: uploadResult.secure_url }
      }),
      prisma.userProfile.upsert({
        where: { userId },
        update: { 
          profilePicture: uploadResult.secure_url,
          updatedAt: new Date()
        },
        create: {
          userId,
          email: req.user.email,
          profilePicture: uploadResult.secure_url,
          updatedAt: new Date()
        }
      })
    ]);

    res.status(200).json({
      success: true,
      message: isCloudinaryConfigured ? "Profile image uploaded successfully" : "Profile image uploaded successfully (Mock Mode)",
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });

  } catch (error) {
    console.error('Profile image upload error:', error);
    res.status(500).json({
      success: false,
      message: "Error uploading profile image. Please try again.",
      error: error.message
    });
  }
});

// Delete resume only
router.delete("/delete-resume", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found"
      });
    }

    if (!profile.resume) {
      return res.status(404).json({
        success: false,
        message: "No resume found to delete"
      });
    }

    // Check if Cloudinary is configured
    const isCloudinaryConfigured = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_KEY !== "your_api_key";

    if (isCloudinaryConfigured && typeof profile.resume === 'object' && profile.resume.publicId) {
      try {
        await cloudinary.uploader.destroy(profile.resume.publicId, {
          resource_type: 'raw'
        });
      } catch (deleteError) {
        console.error('Error deleting resume from Cloudinary:', deleteError);
        return res.status(500).json({
          success: false,
          message: "Error deleting resume from cloud storage"
        });
      }
    }

    await prisma.userProfile.update({
      where: { userId },
      data: { 
        resume: null,
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: "Resume deleted successfully"
    });

  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({
      success: false,
      message: "Error deleting resume",
      error: error.message
    });
  }
});

// Delete user profile
router.delete("/delete", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await prisma.userProfile.findUnique({ where: { userId } });
    
    // Check if Cloudinary is configured
    const isCloudinaryConfigured = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_KEY !== "your_api_key";
    
    if (isCloudinaryConfigured && profile && profile.resume && typeof profile.resume === 'object' && profile.resume.publicId) {
      try {
        await cloudinary.uploader.destroy(profile.resume.publicId, {
          resource_type: 'raw'
        });
      } catch (deleteError) {
        console.error('Error deleting resume during profile deletion:', deleteError);
      }
    }
    
    await prisma.userProfile.delete({ where: { userId } });
    res.status(200).json({
      success: true,
      message: "Profile deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get checklist responses for a job
router.get("/checklist/:jobId", authenticate, async (req, res) => {
  try {
    const candidateId = req.user.id;
    const { jobId } = req.params;

    const checklist = await prisma.candidateJobChecklist.findUnique({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId,
        },
      },
    });

    res.status(200).json({
      success: true,
      answers: checklist ? checklist.answers : null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Save/update checklist responses for a job
router.post("/checklist/:jobId", authenticate, async (req, res) => {
  try {
    const candidateId = req.user.id;
    const { jobId } = req.params;
    const { answers } = req.body;

    const checklist = await prisma.candidateJobChecklist.upsert({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId,
        },
      },
      update: {
        answers,
        updatedAt: new Date(),
      },
      create: {
        candidateId,
        jobId,
        answers,
      },
    });

    res.status(200).json({
      success: true,
      checklist,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
