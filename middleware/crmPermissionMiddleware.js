import prisma from "../config/prisma.js";

// Middleware to check if the user has the required permission
export const checkCrmPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // 1. Super Admin/Admin bypass
      if (req.admin) {
        return next();
      }

      // 2. Staff checks
      if (req.staff) {
        const permissions = req.staff.permissions;
        
        let permissionsList = [];
        if (Array.isArray(permissions)) {
          permissionsList = permissions;
        } else if (typeof permissions === "string") {
          try {
            permissionsList = JSON.parse(permissions);
          } catch (e) {
            permissionsList = [];
          }
        } else if (permissions && typeof permissions === "object") {
          permissionsList = Object.keys(permissions).filter(key => permissions[key] === true);
        }

        // Expand permissions for legacy system support and implicit dashboard view
        const mapping = {
          "candidates": ["candidate_view", "candidate_add", "candidate_edit", "candidate_delete"],
          "pipeline": ["application_view", "application_status_update"],
          "ai-screening": ["candidate_view", "interview_view"],
          "jobs": ["job_view", "job_add", "job_edit", "job_delete"],
          "clients": ["client_view", "client_add", "client_edit", "client_delete"],
          "settings": ["settings_view", "settings_manage"],
          "reports": ["reports_view", "reports_export"],
          "dashboard": ["dashboard_view", "dashboard_analytics"]
        };
        const expanded = new Set(permissionsList);
        permissionsList.forEach(p => {
          if (mapping[p]) {
            mapping[p].forEach(item => expanded.add(item));
          }
        });
        // Auto-grant dashboard_view if user has any other view permission
        const viewPermissions = ["candidate_view", "job_view", "client_view", "application_view", "reports_view"];
        const hasAnyViewPerm = viewPermissions.some(vp => expanded.has(vp));
        if (hasAnyViewPerm) {
          expanded.add("dashboard_view");
        }
        permissionsList = Array.from(expanded);

        if (permissionsList.includes(requiredPermission)) {
          return next();
        }

        return res.status(403).json({
          success: false,
          message: `Access forbidden: Missing permission '${requiredPermission}'`
        });
      }

      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid CRM session identity"
      });
    } catch (error) {
      console.error("CRM Permission Check Error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
};

// Middleware to get allocated client IDs for the logged-in user
export const getAllocatedClientIds = async (req) => {
  if (req.admin) {
    return null; // Admin has access to all clients
  }
  
  if (req.staff) {
    const allocations = await prisma.clientAllocation.findMany({
      where: { staffId: req.staff.id },
      select: { clientId: true }
    });
    return allocations.map(a => a.clientId);
  }
  
  return [];
};
