// PM2 process file for the Pi (see scripts/pi-setup.sh).
//   pm2 startOrReload ecosystem.config.cjs --update-env
// Runs Next directly (not via `npm run start`) so PM2's signals reach the
// server, with a memory ceiling so a leak restarts the app instead of the Pi
// swapping itself to death.
module.exports = {
  apps: [
    {
      name: 'jarvis',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '700M',
      kill_timeout: 5000,
      autorestart: true,
      time: true,
    },
  ],
}
