import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

// Utility function to extract token from request
const extractToken = (req, preferredCookie) => {
  // Check the preferred cookie if specified
  if (preferredCookie && req.cookies?.[preferredCookie]) {
    const token = req.cookies[preferredCookie];
    if (token && token !== 'undefined' && token !== 'null') {
      req.tokenSource = 'cookie';
      return token;
    }
  }

  // Fallback to role-specific cookies in order
  const specificToken = req.cookies?.admin_token || req.cookies?.user_token || req.cookies?.company_token || req.cookies?.company_staff_token || req.cookies?.token;
  
  if (specificToken && specificToken !== 'undefined' && specificToken !== 'null') {
    req.tokenSource = 'cookie';
    return specificToken;
  }

  // Fallback to Authorization Bearer header
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const headerToken = authHeader.split(' ')[1];
    if (headerToken && headerToken !== 'undefined' && headerToken !== 'null') {
      req.tokenSource = 'authorization';
      return headerToken;
    }
  }

  return undefined;
};

// Generic authentication middleware
const createAuthMiddleware = (modelName, tokenKey = 'id', cookieName) => {
  return async (req, res, next) => {
    // Extract token, prioritizing the specific cookie for this middleware
    const token = extractToken(req, cookieName);

    // Check if token exists
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: "No token provided, authorization denied" 
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
      });

      // Validate payload key
      const idValue = decoded[tokenKey];
      if (!idValue) {
        return res.status(401).json({ 
          success: false, 
          message: "Invalid token payload" 
        });
      }

      // Find entity in database using Prisma
      // Prisma property names are lowercase by default
      const modelKey = modelName.toLowerCase();
      const entity = await prisma[modelKey].findUnique({
        where: { id: idValue },
      });

      // Check if entity exists
      if (!entity) {
        return res.status(401).json({ 
          success: false, 
          message: `${modelName} not found` 
        });
      }

      // Remove password before attaching to request
      const { password, ...entityWithoutPassword } = entity;

      // Attach entity to request
      req[modelKey] = entityWithoutPassword;
      next();

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: "Invalid token" });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: "Token has expired" });
      }
      console.error('Authentication error:', error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
};

// Specific middleware for different entity types
export const protectAdmin = createAuthMiddleware('Admin', 'id', 'admin_token');
export const protectCompany = createAuthMiddleware('Company', 'id', 'company_token');
export const authenticate = createAuthMiddleware('User', 'userId', 'user_token');

// Unified CRM Authentication Middleware
export const protectCRM = async (req, res, next) => {
  const token = extractToken(req, 'company_staff_token') || extractToken(req, 'admin_token');

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: "No token provided, CRM authorization denied" 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.token = token;
    
    // 1. Check if it's CompanyStaff (Employer Team / Employer CRM Account)
    if (decoded.staffId) {
      const staff = await prisma.companyStaff.findUnique({
        where: { id: decoded.staffId },
        include: { company: true }
      });
      if (staff) {
        req.staff = staff;
        req.companyId = staff.companyId;
        req.userRole = staff.role; // HR, recruiter, manager
        return next();
      }
    }

    // 2. Check Admin (CRM Super Admin)
    if (decoded.id) {
      const admin = await prisma.admin.findUnique({
        where: { id: decoded.id }
      });
      if (admin) {
        req.admin = admin;
        req.userRole = admin.role; // admin, super-admin, recruiter
        // For super admin, they can pass companyId as query param to simulate multi-tenant access
        if (req.query.companyId) {
          req.companyId = req.query.companyId;
        } else {
          const firstCompany = await prisma.company.findFirst();
          if (firstCompany) {
            req.companyId = firstCompany.id;
          }
        }
        return next();
      }
    }

    return res.status(401).json({ success: false, message: "Invalid token structure or identity not found" });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: "Token has expired" });
    }
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Combined Admin or CRM authorization
export const protectAdminOrCRM = async (req, res, next) => {
  const hasStaffToken = extractToken(req, 'company_staff_token');
  if (hasStaffToken) {
    return protectCRM(req, res, next);
  }
  return protectAdmin(req, res, next);
};

// Optional: Role-based access control middleware
export const roleCheck = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.userRole;

    if (!userRole) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: "Access forbidden: insufficient permissions" 
      });
    }

    next();
  };
};

// Premium Access Middleware
export const checkPremiumAccess = (req, res, next) => {
  const company = req.company;

  if (!company || !company.havePremiumAccess) {
    return res.status(403).json({
      success: false,
      message: "Premium access required to access this resource",
    });
  }

  next();
};