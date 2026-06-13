module.exports = {
  apps: [
    {
      name: "jobmela-backend",
      script: "server.js",
      watch: false,
      env: {
        NODE_ENV: "production"
        // No need to hardcode anything else here
      }
    }
  ]
};
