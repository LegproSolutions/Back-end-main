import prisma from "../../config/prisma.js";
import { getAllocatedClientIds } from "../../middleware/crmPermissionMiddleware.js";

// Fetch multi-tenant CRM Dashboard stats
export const getCRMDashboardStats = async (req, res) => {
  try {
    const { companyId } = req;
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company profile required for stats" });
    }

    const clientIds = await getAllocatedClientIds(req);

    // Find all CRM Clients linked to this company that are allocated to the user
    const clients = await prisma.client.findMany({
      where: {
        companyId,
        isDeleted: false,
        ...(clientIds !== null ? { id: { in: clientIds } } : {})
      }
    });

    const targetClientIds = clients.map(c => c.id);

    if (targetClientIds.length === 0) {
      return res.json({
        success: true,
        data: {
          activeJobs: 0,
          totalApplications: 0,
          screenedCandidates: 0,
          shortlisted: 0,
          selected: 0,
          joined: 0,
          fulfillmentPercentage: 0,
          funnel: [],
          monthlyHiring: [],
          sourceAnalysis: [],
          joiningRatio: 0,
          recentActivities: [],
          upcomingInterviews: []
        }
      });
    }

    // 1. Fetch counts
    const [
      activeJobsCount,
      totalCandidatesCount,
      screenedCount,
      shortlistedCount,
      selectedCount,
      joinedCount,
      rejectedCount,
      dropoutCount
    ] = await Promise.all([
      prisma.cRMJob.count({
        where: { client_id: { in: targetClientIds }, status: "open", isDeleted: false }
      }),
      prisma.cRMCandidate.count({
        where: { client_id: { in: targetClientIds }, isDeleted: false }
      }),
      prisma.cRMCandidate.count({
        where: {
          client_id: { in: targetClientIds },
          status: { in: ["AI Screened", "Interested", "Qualified"] },
          isDeleted: false
        }
      }),
      prisma.cRMCandidate.count({
        where: {
          client_id: { in: targetClientIds },
          status: { in: ["Qualified", "Interview Scheduled", "Interviewed"] },
          isDeleted: false
        }
      }),
      prisma.cRMCandidate.count({
        where: {
          client_id: { in: targetClientIds },
          status: { in: ["Selected", "Offer Released"] },
          isDeleted: false
        }
      }),
      prisma.cRMCandidate.count({
        where: { client_id: { in: targetClientIds }, status: "Joined", isDeleted: false }
      }),
      prisma.cRMCandidate.count({
        where: { client_id: { in: targetClientIds }, status: "Rejected", isDeleted: false }
      }),
      prisma.cRMCandidate.count({
        where: { client_id: { in: targetClientIds }, status: "Dropout", isDeleted: false }
      })
    ]);

    // 2. Fulfillment percentage
    // Total open positions across all active jobs
    const activeJobs = await prisma.cRMJob.findMany({
      where: { client_id: { in: targetClientIds }, isDeleted: false }
    });
    const totalPositions = activeJobs.reduce((acc, job) => acc + job.openPositions, 0);
    const filledPositions = activeJobs.reduce((acc, job) => acc + job.filledPositions, 0);
    const fulfillmentPercentage = totalPositions > 0 ? Math.round((filledPositions / totalPositions) * 100) : 0;

    // 3. Funnel data
    const funnel = [
      { stage: "Applied", count: totalCandidatesCount },
      { stage: "Screened", count: screenedCount },
      { stage: "Shortlisted", count: shortlistedCount },
      { stage: "Selected", count: selectedCount },
      { stage: "Joined", count: joinedCount }
    ];

    // 4. Source Analysis
    const sourceGroups = await prisma.cRMCandidate.groupBy({
      by: ["source"],
      where: { client_id: { in: targetClientIds }, isDeleted: false },
      _count: { id: true }
    });
    const sourceAnalysis = sourceGroups.map(g => ({
      name: g.source || "Direct",
      value: g._count.id
    }));

    // 5. Monthly Hiring Trend (Joined candidates per month)
    const joinedCandidates = await prisma.cRMCandidate.findMany({
      where: { client_id: { in: targetClientIds }, status: "Joined", isDeleted: false },
      select: { updatedAt: true }
    });
    
    const monthlyHiringMap = {};
    joinedCandidates.forEach(c => {
      const date = new Date(c.updatedAt);
      const monthName = date.toLocaleString('default', { month: 'short' });
      monthlyHiringMap[monthName] = (monthlyHiringMap[monthName] || 0) + 1;
    });

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonthIdx = new Date().getMonth();
    const monthlyHiring = [];
    for (let i = 5; i >= 0; i--) {
      const idx = (currentMonthIdx - i + 12) % 12;
      const mName = months[idx];
      monthlyHiring.push({
        month: mName,
        hired: monthlyHiringMap[mName] || 0
      });
    }

    // 6. Joining Ratio (Joined vs Total Selections)
    const totalSelected = joinedCount + selectedCount + dropoutCount;
    const joiningRatio = totalSelected > 0 ? Math.round((joinedCount / totalSelected) * 100) : 0;

    // 7. Recent activities (Audit Logs)
    const recentActivities = await prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    // 8. Upcoming Interviews
    const upcomingInterviews = await prisma.interview.findMany({
      where: {
        companyId,
        scheduledAt: { gte: new Date() },
        candidate: {
          client_id: { in: targetClientIds }
        }
      },
      include: {
        candidate: { select: { name: true, phone: true } },
        job: { select: { title: true } }
      },
      orderBy: { scheduledAt: "asc" },
      take: 5
    });

    res.json({
      success: true,
      data: {
        activeJobs: activeJobsCount,
        totalApplications: totalCandidatesCount,
        screenedCandidates: screenedCount,
        shortlisted: shortlistedCount,
        selected: selectedCount,
        joined: joinedCount,
        fulfillmentPercentage,
        funnel,
        monthlyHiring,
        sourceAnalysis,
        joiningRatio,
        recentActivities,
        upcomingInterviews
      }
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

