# 🚀 Quick Start Guide

Get gait analysis running in 3 minutes.

## Prerequisites

- Python 3.8+ (`python3 --version`)
- Git (`git --version`)
- Chrome or Edge browser
- ESP32 XIAO powered on

## Step 1: Setup Backend (One-time, ~3 min)

```bash
cd backend
./setup.sh
```

This installs TensorFlow, scipy, websockets, and clones HeadGait models (~500MB).

## Step 2: Start Backend

```bash
cd backend
source venv/bin/activate
python server.py
```

✅ **Success:** You'll see `HeadGait models: ENABLED`

**Keep this terminal open!**

## Step 3: Start Frontend

Open a **new** terminal:

```bash
python3 -m http.server 8080
```

Then open: **http://localhost:8080**

## Step 4: Use the App

1. Click **"Connect to ESP32"** → Select "a_XIAO_IMU_DATA"
2. Click **"Start Real-time Analysis"** (button turns purple)
3. Walk/run for 15 seconds
4. Watch metrics update!

## Expected Metrics

- **Gait Speed**: 1.0-1.5 m/s (walking), 2.0-3.5 m/s (running)
- **Cadence**: 100-120 steps/min (walking), 150-180 (running)
- **Strides**: Counts complete gait cycles

## Troubleshooting

### Backend won't start

```bash
cd backend
ls venv/  # Should exist
source venv/bin/activate
python server.py
```

If `venv/` missing, run `./setup.sh` again.

### "Error connecting to analysis server"

1. Is backend running? Check terminal
2. Is port 8000 free? Run: `lsof -i :8000`
3. Both terminals must be open

### Gait speed shows 0.00

- Wait 10-15 seconds for buffer to fill
- Ensure ESP32 is sending data (check IMU metrics cards)
- Start walking (don't stand still)

### "Using fallback algorithm"

HeadGait models not loaded. Fix:

```bash
cd backend
ls headgait/Trained\ initial\ contacts\ model/
```

If empty, run `./setup.sh` again.

### Apple Silicon Mac (M1/M2/M3)

If TensorFlow fails during setup:

```bash
source venv/bin/activate
pip uninstall tensorflow
pip install tensorflow-macos tensorflow-metal
```

## Virtual Environment Notes

**Activate every time:**
```bash
cd backend
source venv/bin/activate  # You'll see (venv) in prompt
python server.py
```

**Deactivate when done:**
```bash
deactivate
```

## Next Steps

- **Technical details**: See [HEADGAIT_INTEGRATION.md](HEADGAIT_INTEGRATION.md)
- **Backend configuration**: See [backend/README.md](backend/README.md)
- **Research paper**: https://doi.org/10.1109/TNSRE.2025.3542568

---

**That's it!** Start walking and see real-time gait metrics. 🎉
