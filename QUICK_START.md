# 🚀 Quick Start Guide

## Step 1: Hardware Setup

1. Upload `esp32_example.ino` to your ESP32 IMU device
2. Upload haptic firmware to ESP32 haptic device (optional)
3. Power on both devices

## Step 2: Open the App

### Option A: Local (No Deployment)
1. Open `index.html` in Chrome or Edge browser
2. That's it! The app runs entirely in your browser

### Option B: Deployed (Vercel + Render)
1. Visit your Vercel URL (e.g., `https://imu-tracker.vercel.app`)
2. Make sure backend is running on Render

## Step 3: Connect Devices

1. Click **"Connect to IMU"** button
2. Select `a_XIAO_IMU_DATA` from the Bluetooth dialog
3. Click **"Connect to Haptic"** button (optional)
4. Select `ESP32-C3_Haptic` from the Bluetooth dialog
5. Wait for HeadGait backend to connect (auto-connects)

## Step 4: Calibrate

1. Stand still and click **"Start 10s Calibration"**
2. Wait 10 seconds while staying still
3. You'll see calibration lines appear on the chart

## Step 5: Start Tracking

### For Real-time Feedback:
1. Click **"Start Run"** to enable haptic feedback
2. Walk normally - haptic vibrates when head tilt exceeds ±2σ

### For Data Logging:
1. Click **"Start CSV Log"**
2. Choose a filename
3. Walk or run as needed
4. Click **"Stop & Save"** when done

## Troubleshooting

### IMU won't connect
- Make sure ESP32 is powered on
- Check that device name is `a_XIAO_IMU_DATA`
- Use Chrome or Edge (Firefox doesn't support Web Bluetooth)

### HeadGait shows "Disconnected"
- Check backend is running: `cd backend && python server.py`
- Or check your Render deployment is active
- Update `WS_URL` in `index.html` if using custom backend

### Haptic not working
- Test with **"Test Haptic (5s)"** button first
- Make sure you calibrated before starting run mode
- Check ESP32 haptic device is powered on

### Charts not updating
- Refresh the page
- Disconnect and reconnect IMU
- Check browser console for errors (F12)

## Tips

- **Better Calibration**: Calibrate while walking normally, not standing still
- **Adjust Sensitivity**: Change Moving Average window (default 200)
- **Reset Everything**: Click "Reset All" to start fresh
- **Save Data**: Always start CSV logging before important sessions

## What's Next?

- Analyze CSV data in Excel/Python/MATLAB
- Adjust calibration parameters for your gait
- Experiment with different moving average windows
- Use HeadGait metrics to track progress over time

---

Need help? Check the full [README.md](README.md) for detailed documentation.
