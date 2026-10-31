#!/bin/bash
# Run once on the Pi (from anywhere) to configure push-to-deploy.
# After this, `git push pi main` from your laptop installs, builds and reloads the app.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

cd "$REPO_DIR"

# 1. Allow git pushes into this working directory (updates the checked-out tree)
git config receive.denyCurrentBranch updateInsteadOf

# 2. Install PM2 if not already installed
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

# 3. Create the post-receive hook. REPO_DIR is baked in at setup time; the
#    rest is expanded when the hook runs.
HOOK="$REPO_DIR/.git/hooks/post-receive"
cat > "$HOOK" <<HOOK_EOF
#!/bin/bash
set -euo pipefail
# Git runs hooks with GIT_DIR set to .git; unset it so npm/next/git calls below
# see the working tree normally.
unset GIT_DIR GIT_WORK_TREE
REPO_DIR="$REPO_DIR"
cd "\$REPO_DIR"

echo "==> Installing dependencies (incl. dev: the build needs tailwind/postcss/typescript)"
npm ci --no-audit --no-fund

echo "==> Building"
NODE_OPTIONS=--max-old-space-size=1536 npm run build

echo "==> Pruning dev dependencies"
npm prune --omit=dev --no-audit --no-fund

echo "==> Reloading"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
HOOK_EOF
chmod +x "$HOOK"

# 4. Build once and start (or reload) the app under PM2 from the ecosystem file.
#    An app previously started as `pm2 start "npm run start"` is replaced.
if pm2 describe jarvis &>/dev/null; then
  JLIST="$(pm2 jlist 2>/dev/null || true)"
  if ! grep -q 'node_modules/next/dist/bin/next' <<<"$JLIST"; then
    pm2 delete jarvis
  fi
fi
if [ ! -d .next ]; then
  npm ci --no-audit --no-fund
  NODE_OPTIONS=--max-old-space-size=1536 npm run build
  npm prune --omit=dev --no-audit --no-fund
fi
pm2 startOrReload ecosystem.config.cjs --update-env

# 5. Configure PM2 to start on boot
pm2 startup || true
pm2 save

echo ""
echo "Done. Next steps:"
echo "  1. Run the 'sudo env PATH=... pm2 startup ...' command printed above (if any) to enable boot startup."
echo "  2. Keep PM2 logs bounded:  pm2 install pm2-logrotate"
echo "  3. On your laptop, run:"
echo "       git remote add pi <user>@<pi-ip>:$REPO_DIR"
echo "  4. Deploy with: git push pi main"
