#!/bin/bash
# Run once on the Pi from the ~/air-gradient directory to configure auto-deploy.
# After this, `git push pi main` from your laptop will build and restart the app.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

cd "$REPO_DIR"

# 1. Allow git pushes into this working directory
git config receive.denyCurrentBranch updateInsteadOf

# 2. Install PM2 if not already installed
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

# 3. Start app under PM2 if not already running
if ! pm2 describe airgradient &>/dev/null; then
  pm2 start "npm run start" --name airgradient
fi

# 4. Create the post-receive hook
HOOK="$REPO_DIR/.git/hooks/post-receive"
cat > "$HOOK" <<'EOF'
#!/bin/bash
set -e
cd ~/air-gradient
npm ci --omit=dev
npm run build
pm2 restart airgradient
EOF
chmod +x "$HOOK"

# 5. Configure PM2 to start on boot
pm2 startup
pm2 save

echo ""
echo "Done. Next steps:"
echo "  1. Run the 'pm2 startup' command printed above (if any) to enable boot startup."
echo "  2. On your laptop, run:"
echo "       git remote add pi <user>@<pi-ip>:~/air-gradient"
echo "  3. Deploy with: git push pi main"
