import dotenv from "dotenv";
dotenv.config();
import connectDB from "./config/db.js";
import User from "./models/User.js";
import Company from "./models/Company.js";
import Job from "./models/Job.js";

const checkCounts = async () => {
    await connectDB();
    const users = await User.countDocuments();
    const companies = await Company.countDocuments();
    const jobs = await Job.countDocuments();
    const activeJobs = await Job.countDocuments({ visible: true, isVerified: true });
    
    console.log({ users, companies, jobs, activeJobs });
    process.exit(0);
};

checkCounts();
