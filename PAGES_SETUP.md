# GitHub Pages Setup Guide

This repository is configured to automatically deploy to GitHub Pages using GitHub Actions.

## Prerequisites

- Your repository must be public, or you need a GitHub Pro/Enterprise account for private repositories
- You need admin access to the repository

## Setup Instructions

### Step 1: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click on **Settings** (the gear icon)
3. In the left sidebar, click on **Pages**
4. Under **Build and deployment**:
   - Set **Source** to **GitHub Actions** (not "Deploy from a branch")

### Step 2: Trigger Deployment

The workflow will automatically run when:
- You push changes to the `main` branch
- You manually trigger it from the Actions tab

To manually trigger the workflow:
1. Go to the **Actions** tab in your repository
2. Click on **Deploy to GitHub Pages** workflow
3. Click **Run workflow** and select the `main` branch

### Step 3: Access Your Site

Once the deployment is complete:
- Your site will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPO/`
- You can find the exact URL in the Actions tab after a successful deployment

## For Forked Repositories

If you have forked this repository and want to enable GitHub Pages deployment:

1. Follow the setup instructions above to enable GitHub Pages
2. Edit `.github/workflows/gh-pages.yml` and remove the following condition from both the `build` and `deploy` jobs:
   ```yaml
   if: ${{ github.event.repository.fork == false }}
   ```
3. Commit and push the changes

## Troubleshooting

### Error: "Failed to create deployment (status: 404)"

This error occurs when GitHub Pages has not been enabled in the repository settings. Follow Step 1 above to enable it.

### Workflow is skipped on forks

This is intentional. Follow the "For Forked Repositories" instructions above to enable deployment on your fork.

### Build succeeds but site doesn't update

1. Check that the deployment job completed successfully in the Actions tab
2. Wait a few minutes for changes to propagate
3. Clear your browser cache
4. Verify the correct URL format: `https://YOUR_USERNAME.github.io/YOUR_REPO/`

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
