# GitHub Pages Setup Guide

This repository is configured to automatically deploy to GitHub Pages using GitHub Actions.

## Prerequisites

- Your repository must be public, or you need a GitHub Pro/Enterprise account for private repositories
- You need admin access to the repository

## Setup Instructions

### Step 1: Enable GitHub Pages (CRITICAL)

**This is the most important step** - without this, deployment will fail with a 404 error.

1. Go to your repository on GitHub
2. Click on **Settings** (the gear icon at the top)
3. Scroll down in the left sidebar and click on **Pages** (under "Code and automation")
4. Under **Build and deployment**:
   - For **Source**, select **GitHub Actions** from the dropdown
   - **DO NOT** select "Deploy from a branch"
5. Click **Save** if prompted

**Note:** The Pages option may not appear in the sidebar until after the first workflow run. If you don't see it:
- Push a commit to trigger the workflow
- Wait for it to fail (expected)
- Then the Pages option should appear in Settings
- Follow steps 3-5 above

### Step 2: Trigger Deployment

The workflow will automatically run when:
- You push changes to the `main` branch
- You manually trigger it from the Actions tab

To manually trigger the workflow:
1. Go to the **Actions** tab in your repository
2. Click on **Deploy to GitHub Pages** workflow
3. Click **Run workflow** button (green button on the right)
4. Select the `main` branch and click **Run workflow**

### Step 3: Access Your Site

Once the deployment is complete:
- Your site will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPO/`
- You can find the exact URL in:
  - The Actions tab → Click on the successful workflow run → Look for the deployment URL
  - Or in Settings → Pages (after successful deployment)

## Troubleshooting

### Error: "Failed to create deployment (status: 404)"

**This is the most common error** and it means GitHub Pages is not properly enabled.

**Solution:**
1. Go to repository **Settings** → **Pages**
2. Make sure **Source** is set to **GitHub Actions** (NOT "Deploy from a branch")
3. If you don't see the Pages option:
   - Wait for one workflow run to complete (even if it fails)
   - Refresh the Settings page
   - The Pages option should now appear
4. Once configured, re-run the workflow from the Actions tab

### Error: "Resource not accessible by integration"

This means the workflow doesn't have permission to deploy.

**Solution:**
1. Go to repository **Settings** → **Actions** → **General**
2. Scroll down to **Workflow permissions**
3. Select **Read and write permissions**
4. Check **Allow GitHub Actions to create and approve pull requests** (optional but recommended)
5. Click **Save**
6. Re-run the workflow

### Workflow is skipped or doesn't run

**Check these:**
1. Make sure you're pushing to the `main` branch
2. Go to **Settings** → **Actions** → **General** and ensure Actions are enabled
3. The workflow is stored in `.github/workflows/gh-pages.yml` - make sure it exists

### Build succeeds but site doesn't update

1. Check that BOTH jobs (build AND deploy) completed successfully in the Actions tab
2. Wait 2-5 minutes for changes to propagate through GitHub's CDN
3. Hard refresh your browser (Ctrl+Shift+R on Windows/Linux, Cmd+Shift+R on Mac)
4. Try accessing in an incognito/private window
5. Verify the correct URL: `https://YOUR_USERNAME.github.io/YOUR_REPO/`

### Build fails with "npm ci" error

The workflow uses `npm ci` which requires a valid `package-lock.json`. If missing:
1. Delete `node_modules` folder
2. Run `npm install` locally
3. Commit the updated `package-lock.json`
4. Push to trigger the workflow again

## What the Workflow Does

1. **Build Job**:
   - Checks out the repository
   - Sets up Node.js
   - Installs dependencies with `npm ci`
   - Builds the project with `npm run build`
   - Adds a `.nojekyll` file to prevent Jekyll processing
   - Uploads the `dist` folder as a GitHub Pages artifact

2. **Deploy Job**:
   - Deploys the artifact to GitHub Pages
   - Provides the deployment URL in the workflow output

## Additional Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Deploying with GitHub Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow)
