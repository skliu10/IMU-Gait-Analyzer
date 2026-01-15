# Changelog

## 2026-01-14 - Major Simplification & Reset

### ✨ New Structure
Reset entire codebase to use simpler architecture based on `imu-project.html` while preserving HeadGait integration.

### 🗑️ Removed
- **Deleted**: `app.js` (753 lines of complex code)
- **Deleted**: `styles.css` (399 lines)
- **Simplified**: Frontend now single-file `index.html` (self-contained)

### ➕ Added
- **New**: `index.html` - Single-file frontend with inline CSS and JavaScript
- **New**: `render.yaml` - Render deployment configuration
- **New**: `DEPLOYMENT.md` - Complete deployment guide
- **New**: `CHANGELOG.md` - This file

### ✅ Preserved
- **Backend**: `server.py` with HeadGait integration (unchanged)
- **Backend**: `headgait_integration.py` (unchanged)
- **Backend**: HeadGait submodule at `backend/headgait/`
- **Hardware**: `esp32_example.ino` (unchanged)
- **Docs**: `HEADGAIT_INTEGRATION.md` (unchanged)

### 🔧 Features in New Frontend

#### Core Features
- ✅ IMU BLE connection (`a_XIAO_IMU_DATA`)
- ✅ Haptic BLE connection (`ESP32-C3_Haptic`)
- ✅ **NEW**: Test Haptic (5-second pulse)
- ✅ HeadGait WebSocket integration
- ✅ Real-time charts (Yaw, Pitch, Roll, Filtered Pitch, MA Pitch)
- ✅ 10-second calibration with ±2σ visualization
- ✅ Run mode with haptic feedback on deviation
- ✅ CSV data logging
- ✅ Reset All function
- ✅ Configurable moving average window

#### HeadGait Metrics Display
- ✅ Gait Speed (m/s)
- ✅ Cadence (steps/min)
- ✅ Stride Count (buffer)
- ✅ Total Strides (cumulative)

#### Improvements
- ✅ Cleaner, more maintainable code
- ✅ Single-file deployment (no build step)
- ✅ Better error handling
- ✅ Auto-connect to HeadGait on IMU connect
- ✅ Simplified status indicators

### 📝 Configuration Files

#### Vercel (Frontend)
```json
{
  "version": 2,
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "Permissions-Policy", "value": "bluetooth=*" },
      { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
    ]}
  ]
}
```

#### Render (Backend)
```yaml
services:
  - type: web
    name: imu-gait-analyzer
    env: python
    buildCommand: "cd backend && pip install -r requirements.txt"
    startCommand: "cd backend && python server.py"
```

### 🚀 Deployment

**Frontend**: Vercel
- Deploy: `vercel deploy`
- URL: `https://your-project.vercel.app`

**Backend**: Render
- Deploy: Push to GitHub → Auto-deploy via `render.yaml`
- URL: `https://imu-gait-analyzer.onrender.com`

### 📊 File Size Comparison

| File | Before | After | Change |
|------|--------|-------|--------|
| HTML | 195 lines | 582 lines | +387 (self-contained) |
| JavaScript | 753 lines | 0 (inline) | -753 |
| CSS | 399 lines | 0 (inline) | -399 |
| **Total** | 1,347 lines | 582 lines | **-765 lines (57% reduction)** |

### 🎯 Why This Change?

1. **Simplicity**: Single HTML file is easier to understand and maintain
2. **No Build Step**: No need for bundlers or build tools
3. **Fast Deployment**: One file to deploy, no dependencies
4. **Easy Debugging**: All code in one place
5. **Better for Learning**: Students can see entire app structure
6. **Preserved Power**: HeadGait ML models still fully integrated

### 🔄 Migration Guide

If you were using the old version:

1. **Frontend**: Just use new `index.html` - all features preserved
2. **Backend**: No changes needed - same API
3. **ESP32**: No changes needed - same firmware
4. **Config**: Update WebSocket URL in `index.html` line 144

### ⚙️ Environment Setup

**Frontend**: None required (pure HTML/CSS/JS)

**Backend**:
```bash
cd backend
pip install -r requirements.txt
python server.py
```

### 📚 Documentation

- **README.md**: Main project documentation
- **QUICK_START.md**: 5-minute setup guide
- **DEPLOYMENT.md**: Vercel + Render deployment
- **HEADGAIT_INTEGRATION.md**: ML model technical details
- **CHANGELOG.md**: This file

### 🐛 Bug Fixes

- ✅ Fixed: Test Haptic button now works (5-second pulse)
- ✅ Fixed: Reset button now visible and functional
- ✅ Fixed: HeadGait status indicator shows connection state
- ✅ Fixed: Auto-reconnect to HeadGait after IMU connects

### 🔮 Future Plans

- [ ] Add real-time gait symmetry analysis
- [ ] Add stride length estimation
- [ ] Add step-by-step navigation guidance
- [ ] Add offline data replay mode
- [ ] Add multi-device support (compare multiple IMUs)

---

**Breaking Changes**: None (backend API unchanged)

**Migration Required**: Yes (replace frontend files)

**Backward Compatible**: Yes (old ESP32 firmware works)
