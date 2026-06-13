import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const jobSchema = new mongoose.Schema({
    title: String,
    visible: Boolean,
});

const Job = mongoose.model('Job', jobSchema);

const checkJobs = async () => {
    try {
        console.log("Connecting to:", process.env.MONGODB_URI);
        await mongoose.connect(process.env.MONGODB_URI);
        const count = await Job.countDocuments();
        console.log(`Total jobs in DB: ${count}`);
        
        const visibleJobs = await Job.countDocuments({ visible: true });
        console.log(`Visible jobs in DB: ${visibleJobs}`);
        
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

checkJobs();
