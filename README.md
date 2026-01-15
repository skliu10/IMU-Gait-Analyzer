# IMU Gait Tracker with HeadGait Analysis

Real-time gait analysis system using ESP32 IMU sensors with haptic feedback and HeadGait ML models.

## 🚀 Quick Start

### Frontend (Vercel)
The frontend is a single HTML file that runs in the browser.

**Local Development:**
```bash
# Simply open index.html in a browser
open index.html
```

**Deploy to Vercel:**
```bash
vercel deploy
```

### Backend (Render)
The backend runs a Python WebSocket server with HeadGait integration.

**Local Development:**
```bash
cd backend
pip install -r requirements.txt
python server.py
```

**Deploy to Render:**
1. Push to GitHub
2. Connect Render to your repo
3. Render will auto-deploy using `render.yaml`

## 📋 Features

### IMU Tracking
- Real-time orientation data (pitch, yaw, roll)
- Real-time acceleration data (X, Y, Z)
- Bluetooth Low Energy (BLE) connection to ESP32
- Butterworth filter + Moving Average smoothing
- Angle unwrapping for continuous tracking

### Haptic Feedback
- BLE connection to haptic device
- Test haptic function (5-second pulse)
- Run mode with calibration-based triggers
- Automatic feedback on >2σ deviation

### HeadGait Analysis
- **Gait Speed** estimation using GPR model
- **Cadence** detection (steps/min)
- **Stride Count** in current buffer
- **Total Strides** cumulative counter
- Real-time WebSocket streaming

### Data Logging
- CSV export with timestamps
- All raw and processed data
- HeadGait metrics included

## 🔧 Hardware Setup

### ESP32 IMU Device
- **Name**: `a_XIAO_IMU_DATA`
- **Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Characteristic UUID**: `beb5483e-36e1-4688-b7f5-ea07361b26a8`

### ESP32 Haptic Device
- **Name**: `ESP32-C3_Haptic`
- **Service UUID**: `a7b3c8d2-4e5f-4a1b-9c8d-7e6f5a4b3c2d`
- **Characteristic UUID**: `f9e8d7c6-b5a4-4938-8271-6a5b4c3d2e1f`

Upload `esp32_example.ino` to your ESP32 devices.

## 📖 Usage Guide

1. **Connect to IMU**: Click "Connect to IMU" and select your device
2. **Connect to Haptic**: Click "Connect to Haptic" (optional)
3. **Test Haptic**: Click "Test Haptic (5s)" to verify haptic works
4. **Calibrate**: Click "Start 10s Calibration" while walking normally
5. **Start Run**: Click "Start Run" to enable haptic feedback
6. **Reset**: Click "Reset All" to clear all data and start fresh

## 🧠 HeadGait Integration

The backend uses [HeadGait](https://github.com/HeadGait/HeadGait) models for gait analysis:
- **Initial Contacts Detection**: TCN (Temporal Convolutional Network)
- **Gait Speed Estimation**: GPR (Gaussian Process Regression)

See `backend/headgait_integration.py` for implementation details.

## 📁 Project Structure

```
├── index.html              # Single-file frontend (HTML + CSS + JS)
├── esp32_example.ino       # Arduino code for ESP32 IMU
├── vercel.json            # Vercel deployment config
├── render.yaml            # Render deployment config
└── backend/
    ├── server.py          # WebSocket server
    ├── headgait_integration.py  # HeadGait ML models
    ├── requirements.txt   # Python dependencies
    └── headgait/          # HeadGait submodule (Git)
```

## 🌐 Deployment

### Frontend → Vercel
- Deployed as static site
- Bluetooth permissions configured
- Auto-deploys on push to main

### Backend → Render
- WebSocket server on port 8000 (or $PORT)
- Auto-deploys on push to main
- Free tier available

**Update Backend URL:**
In `index.html`, update the WebSocket URL:
```javascript
const WS_URL = 'wss://your-render-app.onrender.com';
```

## 🔬 Technical Details

### Filters
- **Butterworth Filter**: 2nd order, fc=0.1 for 20Hz sampling
- **Moving Average**: Configurable window (default 200 samples)

### Calibration
- 10-second data collection
- Calculates mean and standard deviation
- Sets ±2σ boundaries for run mode

### Run Mode
- Triggers haptic when pitch exceeds ±2σ
- 200ms debounce to prevent flickering
- Automatic on/off based on calibration range

## 📝 CSV Log Format

```
Timestamp,Yaw,Pitch,Roll,AccX,AccY,AccZ,FilteredPitch,MAPitch,GaitSpeed,Cadence,StrideCount,TotalStrides
```

## 🛠️ Development

### Backend Local Setup
```bash
cd backend
pip install -r requirements.txt
python server.py
```

Server runs on `ws://localhost:8000`

### Frontend Local Setup
Just open `index.html` in a browser. For local HeadGait connection, it auto-detects `localhost`.

## 📚 References

- [HeadGait Paper](https://doi.org/10.1038/s41598-023-XXXXX-X)
- [ESP32 BLE Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/bluetooth/index.html)

## 📄 License

See individual component licenses:
- HeadGait: See `backend/headgait/LICENSE`
- This project: MIT License

---

**Made with ❤️ for gait analysis research**
