# Railway Deployment Guide

This guide will help you deploy the Amawell Scraper Server to Railway.

## Prerequisites

1. **GitHub Account**: You need a GitHub account to host your code
2. **Railway Account**: Sign up at [railway.app](https://railway.app)
3. **Git**: Make sure you have Git installed locally

## Step 1: Prepare Your Repository

1. **Initialize Git** (if not already done):
```bash
git init
git add .
git commit -m "Initial commit: Amawell scraper server"
```

2. **Create GitHub Repository**:
   - Go to GitHub and create a new repository
   - Don't initialize with README, .gitignore, or license (we already have these)

3. **Push to GitHub**:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Railway

1. **Connect to Railway**:
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

2. **Automatic Detection**:
   - Railway will automatically detect the configuration files:
     - `package.json` - Node.js project
     - `nixpacks.toml` - Build configuration
     - `railway.toml` - Deployment settings

3. **Deployment Process**:
   - Railway will install dependencies
   - Install Chromium and system packages
   - Build the application
   - Start the server

## Step 3: Verify Deployment

1. **Check Build Logs**:
   - In Railway dashboard, go to your project
   - Check the "Deployments" tab
   - Ensure build completed successfully

2. **Test Health Endpoint**:
```bash
curl https://YOUR_RAILWAY_URL/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

3. **Test Scrape Endpoint**:
```bash
curl -X POST https://YOUR_RAILWAY_URL/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amawell.sk/prstene/", "maxProducts": 1}'
```

## Step 4: Environment Variables (Optional)

Railway will automatically set:
- `PORT`: Railway sets this automatically
- `NODE_ENV`: Set to "production" automatically

You can add custom environment variables in Railway dashboard if needed.

## Step 5: Monitoring

1. **Logs**: Check Railway logs for any errors
2. **Metrics**: Monitor CPU, memory usage
3. **Health Checks**: Railway will monitor the `/health` endpoint

## Troubleshooting

### Build Issues

1. **Chrome/Chromium not found**:
   - Check `nixpacks.toml` configuration
   - Ensure all dependencies are listed

2. **CA Certificate errors**:
   - `ca-certificates` is included in nixpacks.toml
   - Check if the package is being installed

3. **Memory issues**:
   - Check Railway logs for memory errors
   - Consider upgrading Railway plan if needed

### Runtime Issues

1. **Server not starting**:
   - Check Railway logs
   - Verify `npm start` command in package.json

2. **API errors**:
   - Test with curl commands
   - Check rate limiting settings

3. **Scraping failures**:
   - Check if Amawell is blocking requests
   - Verify URL format

## Configuration Files Explained

### `railway.toml`
- Specifies build and deployment settings
- Sets health check endpoint
- Configures restart policy

### `nixpacks.toml`
- Installs Chromium and dependencies
- Configures build process
- Sets up production environment

### `package.json`
- Defines Node.js dependencies
- Sets start scripts
- Configures project metadata

## Security Considerations

1. **Rate Limiting**: 10 requests per minute per IP
2. **CORS**: Configured for production
3. **Input Validation**: URL and parameter validation
4. **Security Headers**: Helmet.js protection

## Performance Optimization

1. **Browser Settings**: Optimized for server environments
2. **Request Blocking**: Blocks unnecessary requests
3. **Memory Management**: Proper cleanup after each request
4. **Compression**: Response compression enabled

## Updating the Application

1. **Make Changes**: Update your code locally
2. **Commit and Push**:
```bash
git add .
git commit -m "Update description"
git push
```

3. **Automatic Deployment**: Railway will automatically redeploy

## Cost Optimization

1. **Free Tier**: Railway offers a free tier
2. **Usage Monitoring**: Monitor your usage in Railway dashboard
3. **Scaling**: Upgrade plan if needed for higher traffic

## Support

If you encounter issues:

1. **Check Railway Logs**: First step for debugging
2. **GitHub Issues**: Create issues in your repository
3. **Railway Support**: Contact Railway support if needed

## Example Usage

Once deployed, you can use the API like this:

```bash
# Health check
curl https://your-app.railway.app/health

# Scrape products
curl -X POST https://your-app.railway.app/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.amawell.sk/prstene/",
    "maxProducts": 5
  }'
```

The server is now ready for production use on Railway! 