import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const checkDBs = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Current DB collections:", collections.map(c => c.name));
    
    // Check JobMela database specifically if possible
    // Wait, with this URI we are connected to a specific one.
    
    process.exit(0);
};

checkDBs();
