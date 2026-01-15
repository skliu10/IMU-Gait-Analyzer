# 🌐 Deployment Guide

## Overview

This project has two parts:
- **Frontend**: Static HTML (deployed to Vercel)
- **Backend**: Python WebSocket server (deployed to Render)

## Frontend Deployment (Vercel)

### Initial Setup

1. **Install Vercel CLI** (optional):
```bash
npm install -g vercel
```

2. **Deploy**:
```bash
vercel
```

3. **Follow prompts**:
   - Link to existing project or create new
   - Set root directory to `.` (current directory)
   - No build command needed
   - Output directory: `.` (serves index.html directly)

### Configuration

The `vercel.json` is already configured:
- ✅ Bluetooth permissions enabled
- ✅ Cache headers set
- ✅ No build step required

### Environment Variables

Update the WebSocket URL in `index.html`:

```javascript
// For production, update this line:
const WS_URL = 'wss://your-backend-app.onrender.com';
```

## Backend Deployment (Render)

### Method 1: Using render.yaml (Recommended)

1. **Push to GitHub**:
```bash
git add .
git commit -m "Deploy backend"
git push origin main
```

2. **Connect to Render**:
   - Go to [render.com](https://render.com)
   - Click "New +" → "Blueprint"
   - Connect your GitHub repo
   - Render will auto-detect `render.yaml`
   - Click "Apply"

3. **Done!** Render will:
   - Install Python dependencies
   - Start the WebSocket server
   - Assign a URL (e.g., `https://imu-gait-analyzer.onrender.com`)

### Method 2: Manual Setup

1. **Create New Web Service** on Render:
   - Name: `imu-gait-analyzer`
   - Environment: `Python 3`
   - Build Command: `cd backend && pip install -r requirements.txt`
   - Start Command: `cd backend && python server.py`
   - Plan: `Free`

2. **Environment Variables**:
   - Render auto-sets `PORT` - no config needed

3. **Deploy**:
   - Click "Create Web Service"
   - Wait for build to complete

## Post-Deployment

### Update Frontend to Use Backend

In `index.html`, update the WebSocket URL:

```javascript
const WS_URL = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'ws://localhost:8000';
    }
    // Replace with your actual Render URL
    return 'wss://imu-gait-analyzer.onrender.com';
})();
```

### Test the Connection

1. Open your Vercel URL
2. Open browser console (F12)
3. Connect to IMU
4. Check for "✅ HeadGait WebSocket Connected" message

## Monitoring

### Vercel
- View logs at [vercel.com/dashboard](https://vercel.com/dashboard)
- Check analytics and traffic

### Render
- View logs at [dashboard.render.com](https://dashboard.render.com)
- Monitor WebSocket connections
- Check HeadGait model status

## Troubleshooting

### Frontend Issues

**"Bluetooth not available"**
- ❌ Must use HTTPS (Vercel provides this)
- ❌ Firefox doesn't support Web Bluetooth
- ✅ Use Chrome or Edge

**"HeadGait: Disconnected"**
- Check backend is running on Render
- Verify WebSocket URL is correct
- Check for CORS issues (Render should handle this)

### Backend Issues

**"Failed to bind to port"**
- Render sets `PORT` env variable automatically
- Code should use: `PORT = int(os.getenv("PORT", 8000))`

**"Module not found: headgait_integration"**
- Make sure `backend/headgait_integration.py` exists
- Check requirements.txt has all dependencies
- HeadGait submodule must be initialized

**"WebSocket connection failed"**
- Use `wss://` (not `ws://`) for production
- Check Render service is active (free tier sleeps after 15min)
- Verify firewall/network settings

### HeadGait Model Issues

**"HeadGait models: DISABLED"**
- Run `cd backend && bash setup.sh` locally
- Check that `headgait/` submodule is initialized
- Fallback algorithm will be used if models unavailable

## Free Tier Limits

### Vercel (Free)
- ✅ 100 GB bandwidth/month
- ✅ Unlimited static sites
- ✅ Auto-deploy on push

### Render (Free)
- ✅ 750 hours/month (runs 24/7)
- ⚠️ Spins down after 15min inactivity
- ⚠️ Cold start takes ~30s
- ✅ Auto-deploy on push

## Custom Domain (Optional)

### For Frontend (Vercel)
1. Go to project settings
2. Add domain (e.g., `gait-tracker.yourdomain.com`)
3. Update DNS records as instructed

### For Backend (Render)
1. Upgrade to paid plan ($7/mo)
2. Add custom domain in settings
3. Update DNS records

## Continuous Deployment

Both Vercel and Render support auto-deploy:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Both services auto-deploy!
```

## Rollback

### Vercel
- Go to deployments
- Click "..." on previous deployment
- Click "Promote to Production"

### Render
- Go to deploy history
- Click "Rollback" on previous deploy

---

**Need Help?** Check logs first, then open an issue on GitHub.
