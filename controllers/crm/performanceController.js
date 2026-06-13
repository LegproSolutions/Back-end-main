import prisma from "../../config/prisma.js";
import { getAllocatedClientIds } from "../../middleware/crmPermissionMiddleware.js";

// Helper to get start and end dates
const getDateRange = (filter) => {
  const now = new Date();
  let start = new Date();
  
  if (filter === "daily") {
    start.setHours(0, 0, 0, 0);
  } else if (filter === "weekly") {
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "monthly") {
    start.setMonth(now.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
  } else {
    // Default to daily
    start.setHours(0, 0, 0, 0);
  }
  return { start, end: now };
};

// GET /api/crm/performance/dashboard
export const getRecruiterPerformance = async (req, res) => {
  try {
    const recruiterId = req.query.recruiterId || req.staff?.id || req.admin?.id;
    
    // Daily Dates
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    // Weekly Dates
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    
    // Monthly Dates
    const monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - 1);

    // --- DAILY PERFORMANCE ---
    const [
      dailyAssigned,
      dailyCalls,
      dailyConnected,
      dailyNotConnected,
      dailyFollowups,
      dailyInterested,
      dailyShortlisted,
      dailyInterviewScheduled,
      dailySelected,
      dailyJoined
    ] = await Promise.all([
      prisma.assignmentHistory.count({
        where: { assignedTo: recruiterId, assignmentDate: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, status: "Connected", createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, status: { not: "Connected" }, createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, followUpDate: { not: null }, createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Interested", createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Shortlisted", createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Interview Scheduled", createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Selected", createdAt: { gte: todayStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Joined", createdAt: { gte: todayStart } }
      })
    ]);

    // --- WEEKLY PERFORMANCE ---
    const [
      weeklyAssigned,
      weeklyCalls,
      weeklyFollowups,
      weeklyShortlisted,
      weeklySelected,
      weeklyJoined
    ] = await Promise.all([
      prisma.assignmentHistory.count({
        where: { assignedTo: recruiterId, assignmentDate: { gte: weekStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, createdAt: { gte: weekStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, followUpDate: { not: null }, createdAt: { gte: weekStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Shortlisted", createdAt: { gte: weekStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Selected", createdAt: { gte: weekStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Joined", createdAt: { gte: weekStart } }
      })
    ]);

    // --- MONTHLY PERFORMANCE ---
    const [
      monthlyAssigned,
      monthlyCalls,
      monthlyShortlisted,
      monthlySelected,
      monthlyJoined
    ] = await Promise.all([
      prisma.assignmentHistory.count({
        where: { assignedTo: recruiterId, assignmentDate: { gte: monthStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, createdAt: { gte: monthStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Shortlisted", createdAt: { gte: monthStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Selected", createdAt: { gte: monthStart } }
      }),
      prisma.call.count({
        where: { recruiter_id: recruiterId, disposition2: "Joined", createdAt: { gte: monthStart } }
      })
    ]);

    // Monthly Targets & Ratios
    const targetCalls = 500;
    const targetSelections = 20;
    const targetJoinings = 10;

    const achievementPercentage = monthlyCalls > 0 ? Math.round((monthlyCalls / targetCalls) * 100) : 0;
    const conversionRate = monthlyAssigned > 0 ? Math.round((monthlyJoined / monthlyAssigned) * 100) : 0;
    const selectionRatio = monthlyShortlisted > 0 ? Math.round((monthlySelected / monthlyShortlisted) * 100) : 0;
    const joiningRatio = monthlySelected > 0 ? Math.round((monthlyJoined / monthlySelected) * 100) : 0;

    res.json({
      success: true,
      data: {
        daily: {
          assigned: dailyAssigned,
          calls: dailyCalls,
          connected: dailyConnected,
          notConnected: dailyNotConnected,
          followups: dailyFollowups,
          interested: dailyInterested,
          shortlisted: dailyShortlisted,
          interviewScheduled: dailyInterviewScheduled,
          selected: dailySelected,
          joined: dailyJoined
        },
        weekly: {
          assigned: weeklyAssigned,
          calls: weeklyCalls,
          followups: weeklyFollowups,
          shortlisted: weeklyShortlisted,
          selected: weeklySelected,
          joined: weeklyJoined
        },
        monthly: {
          assigned: monthlyAssigned,
          calls: monthlyCalls,
          shortlisted: monthlyShortlisted,
          selected: monthlySelected,
          joined: monthlyJoined,
          targetCalls,
          targetSelections,
          targetJoinings,
          achievementPercentage,
          conversionRate,
          selectionRatio,
          joiningRatio
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/crm/performance/leaderboard
export const getRecruiterLeaderboard = async (req, res) => {
  try {
    const { filter = "daily" } = req.query; // daily, weekly, monthly
    const { start } = getDateRange(filter);

    // Get all recruiters (CompanyStaff with role recruiter)
    const recruiters = await prisma.companyStaff.findMany({
      where: { companyId: req.companyId, role: "recruiter" }
    });

    const leaderboard = [];

    for (const r of recruiters) {
      const [
        callsCount,
        connectedCount,
        shortlistedCount,
        selectedCount,
        joinedCount,
        assignedCount
      ] = await Promise.all([
        prisma.call.count({
          where: { recruiter_id: r.id, createdAt: { gte: start } }
        }),
        prisma.call.count({
          where: { recruiter_id: r.id, status: "Connected", createdAt: { gte: start } }
        }),
        prisma.call.count({
          where: { recruiter_id: r.id, disposition2: "Shortlisted", createdAt: { gte: start } }
        }),
        prisma.call.count({
          where: { recruiter_id: r.id, disposition2: "Selected", createdAt: { gte: start } }
        }),
        prisma.call.count({
          where: { recruiter_id: r.id, disposition2: "Joined", createdAt: { gte: start } }
        }),
        prisma.assignmentHistory.count({
          where: { assignedTo: r.id, assignmentDate: { gte: start } }
        })
      ]);

      const shortlistRate = assignedCount > 0 ? Math.round((shortlistedCount / assignedCount) * 100) : 0;
      const selectionRate = shortlistedCount > 0 ? Math.round((selectedCount / shortlistedCount) * 100) : 0;
      const joiningRate = selectedCount > 0 ? Math.round((joinedCount / selectedCount) * 100) : 0;

      // Score used to rank top performers (composite score)
      const performanceScore = (callsCount * 1) + (shortlistedCount * 5) + (selectedCount * 15) + (joinedCount * 30);

      leaderboard.push({
        recruiterId: r.id,
        name: r.name,
        email: r.email,
        callsMade: callsCount,
        connectedCalls: connectedCount,
        shortlisted: shortlistedCount,
        selected: selectedCount,
        joined: joinedCount,
        shortlistRate,
        selectionRate,
        joiningRate,
        performanceScore
      });
    }

    // Sort by performanceScore descending
    leaderboard.sort((a, b) => b.performanceScore - a.performanceScore);

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/crm/reports/dashboard
export const getManagerReports = async (req, res) => {
  try {
    const { recruiterId, clientId, jobId, startDate, endDate, disposition, appStatus } = req.query;

    const clientIds = await getAllocatedClientIds(req);

    const where = { isDeleted: false };
    const callWhere = {};
    const assignWhere = {};

    if (clientIds !== null) {
      where.client_id = { in: clientIds };
      assignWhere.clientId = { in: clientIds };
      callWhere.candidate = { client_id: { in: clientIds } };
    }

    if (recruiterId) {
      where.assigned_recruiter = recruiterId;
      callWhere.recruiter_id = recruiterId;
      assignWhere.assignedTo = recruiterId;
    }

    if (clientId) {
      if (clientIds !== null && !clientIds.includes(clientId)) {
        return res.status(403).json({ success: false, message: "Access forbidden: client not allocated to you" });
      }
      where.client_id = clientId;
      assignWhere.clientId = clientId;
    }

    if (jobId) {
      // Find candidate IDs related to this job via pipeline or checklist
      where.pipelines = { some: { client: { jobs: { some: { id: jobId } } } } };
      assignWhere.jobId = jobId;
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      callWhere.createdAt = { gte: start, lte: end };
      assignWhere.assignmentDate = { gte: start, lte: end };
    }

    if (disposition) {
      callWhere.status = disposition;
    }

    if (appStatus) {
      where.status = appStatus;
    }

    const [
      totalAssigned,
      totalCalls,
      connectedCalls,
      notConnectedCalls,
      interestedCount,
      notInterestedCount,
      shortlistedCount,
      rejectedCount,
      selectedCount,
      offeredCount,
      joinedCount
    ] = await Promise.all([
      prisma.assignmentHistory.count({ where: assignWhere }),
      prisma.call.count({ where: callWhere }),
      prisma.call.count({ where: { ...callWhere, status: "Connected" } }),
      prisma.call.count({ where: { ...callWhere, status: { not: "Connected" } } }),
      prisma.cRMCandidate.count({ where: { ...where, status: "Interested" } }),
      prisma.cRMCandidate.count({ where: { ...where, status: "Not Interested" } }),
      prisma.cRMCandidate.count({ where: { ...where, status: "Shortlisted" } }),
      prisma.cRMCandidate.count({ where: { ...where, status: "Rejected" } }),
      prisma.cRMCandidate.count({ where: { ...where, status: "Selected" } }),
      prisma.cRMCandidate.count({ where: { ...where, status: "Offered" } }),
      prisma.cRMCandidate.count({ where: { ...where, status: "Joined" } })
    ]);

    // Client Wise Summary
    const clients = await prisma.client.findMany({
      where: { 
        companyId: req.companyId, 
        isDeleted: false,
        ...(clientIds !== null ? { id: { in: clientIds } } : {})
      }
    });
    const clientWiseReports = [];
    for (const c of clients) {
      const [cApps, cShort, cSel, cJoin] = await Promise.all([
        prisma.cRMCandidate.count({ where: { client_id: c.id, isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { client_id: c.id, status: "Shortlisted", isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { client_id: c.id, status: "Selected", isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { client_id: c.id, status: "Joined", isDeleted: false } })
      ]);
      clientWiseReports.push({
        clientId: c.id,
        companyName: c.company_name,
        totalApplications: cApps,
        totalShortlisted: cShort,
        totalSelected: cSel,
        totalJoined: cJoin
      });
    }

    // Job Wise Summary
    const jobs = await prisma.cRMJob.findMany({
      where: { 
        client: { companyId: req.companyId }, 
        isDeleted: false,
        ...(clientIds !== null ? { client_id: { in: clientIds } } : {})
      }
    });
    const jobWiseReports = [];
    for (const j of jobs) {
      const [jApps, jShort, jSel, jJoin] = await Promise.all([
        prisma.cRMCandidate.count({ where: { client_id: j.client_id, isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { client_id: j.client_id, status: "Shortlisted", isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { client_id: j.client_id, status: "Selected", isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { client_id: j.client_id, status: "Joined", isDeleted: false } })
      ]);
      jobWiseReports.push({
        jobId: j.id,
        title: j.title,
        totalApplications: jApps,
        totalShortlisted: jShort,
        totalSelected: jSel,
        totalJoined: jJoin
      });
    }

    // Recruiter Wise Summary
    const recruiters = await prisma.companyStaff.findMany({
      where: { companyId: req.companyId, role: "recruiter" }
    });
    const recruiterWiseReports = [];
    for (const r of recruiters) {
      const [rCalls, rShort, rSel, rJoin] = await Promise.all([
        prisma.call.count({ where: { recruiter_id: r.id } }),
        prisma.cRMCandidate.count({ where: { assigned_recruiter: r.id, status: "Shortlisted", isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { assigned_recruiter: r.id, status: "Selected", isDeleted: false } }),
        prisma.cRMCandidate.count({ where: { assigned_recruiter: r.id, status: "Joined", isDeleted: false } })
      ]);
      recruiterWiseReports.push({
        recruiterId: r.id,
        name: r.name,
        callsCount: rCalls,
        shortlisted: rShort,
        selected: rSel,
        joined: rJoin
      });
    }

    res.json({
      success: true,
      data: {
        metrics: {
          totalAssigned,
          totalCalls,
          connectedCalls,
          notConnectedCalls,
          pendingCalls: Math.max(0, totalAssigned - totalCalls),
          interested: interestedCount,
          notInterested: notInterestedCount,
          shortlisted: shortlistedCount,
          rejected: rejectedCount,
          selected: selectedCount,
          offered: offeredCount,
          joined: joinedCount
        },
        clientWise: clientWiseReports,
        jobWise: jobWiseReports,
        recruiterWise: recruiterWiseReports
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
