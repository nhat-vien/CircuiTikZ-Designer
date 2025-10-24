# Fix GitHub Pages 404 Deployment Error

## The Problem

If you see this error:
```
Error: Failed to create deployment (status: 404)
Ensure GitHub Pages has been enabled
```

## The Solution (2 minutes)

### Step 1: Enable GitHub Pages
1. Open your repository on GitHub
2. Click **Settings** (top menu)
3. Click **Pages** (left sidebar, under "Code and automation")
4. Under **Build and deployment**, find **Source**
5. Select **GitHub Actions** from the dropdown
6. Save

### Step 2: Re-run the Workflow
1. Go to the **Actions** tab
2. Find the failed workflow run
3. Click **Re-run all jobs**

OR push a new commit:
```bash
git commit --allow-empty -m "Trigger GitHub Pages deployment"
git push
```

### Step 3: Verify
Once the workflow completes successfully, your site will be available at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO/
```

## Why This Happens

The 404 error occurs because:
- GitHub Pages is not enabled for your repository, OR
- The source is set to "Deploy from a branch" instead of "GitHub Actions"

The workflow cannot create deployments unless Pages is configured to use GitHub Actions as the source.

## Still Having Issues?

1. **Can't find the Pages option in Settings?**
   - The Pages option may not appear until after the first workflow run
   - Let the workflow fail once, then check Settings again
   - The Pages option should now be visible

2. **Getting "Resource not accessible" error?**
   - Go to Settings → Actions → General
   - Under "Workflow permissions", select "Read and write permissions"
   - Save and re-run the workflow

3. **Workflow doesn't run at all?**
   - Make sure Actions are enabled: Settings → Actions → General
   - Check you're pushing to the `main` branch
   - Verify the workflow file exists at `.github/workflows/gh-pages.yml`

## Need More Help?

See the complete guide: [PAGES_SETUP.md](PAGES_SETUP.md)
