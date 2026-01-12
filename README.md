# HEAD GAIT - Real-time Running Gait Analysis

Real-time gait speed estimation using head-worn IMU and research-validated HeadGait machine learning models.

![System Overview](https://img.shields.io/badge/Platform-Web%20%2B%20Python-blue)
![HeadGait](https://img.shields.io/badge/Models-HeadGait-purple)
![License](https://img.shields.io/badge/License-MIT-green)

## 🎯 What is This?

Estimate **gait speed**, **cadence**, and **stride count** in real-time as you walk or run!

- 🔵 **Web Bluetooth**: Connect ESP32 directly from browser
- 📊 **Live Visualization**: 3D IMU orientation + time-series charts
- 🧠 **AI-Powered**: Research-validated HeadGait models ([Paper](https://doi.org/10.1109/TNSRE.2025.3542568))
- 💾 **Data Recording**: Export sessions to CSV

## 🚀 Quick Start

**Get running in 3 minutes:**

```bash
# 1. Setup backend (one-time)
cd backend && ./setup.sh

# 2. Start backend
source venv/bin/activate && python server.py

# 3. Start frontend (new terminal)
python3 -m http.server 8080
```

Then open **http://localhost:8080**, connect ESP32, and start analyzing!

**📖 Detailed guide:** See [QUICK_START.md](QUICK_START.md)

## 📊 Expected Results

| Activity | Gait Speed | Cadence |
|----------|------------|---------|
| Slow Walk | 0.8-1.2 m/s | 90-110 steps/min |
| Normal Walk | 1.2-1.6 m/s | 110-130 steps/min |
| Fast Walk | 1.6-2.2 m/s | 130-150 steps/min |
| Jogging | 2.2-3.0 m/s | 150-170 steps/min |
| Running | 3.0-4.0 m/s | 170-190 steps/min |

## 🏗️ How It Works

```
ESP32 (Head) --Bluetooth--> Browser --WebSocket--> Python Backend
                                                         ↓
                                              [HeadGait ML Models]
                                               TCN + GPR Models
                                                         ↓
                                              Gait Speed, Cadence, Strides
                                                         ↓
                            Browser <--WebSocket-- Python Backend
```

**Technical details:** See [HEADGAIT_INTEGRATION.md](HEADGAIT_INTEGRATION.md)


## 🐛 Common Issues

| Problem | Solution |
|---------|----------|
| ESP32 won't connect | Enable Bluetooth, look for "a_XIAO_IMU_DATA" |
| No metrics showing | Wait 15s for buffer, check backend running |
| "Fallback algorithm" | Run `cd backend && ./setup.sh` |

**More help:** [QUICK_START.md](QUICK_START.md) troubleshooting section

## 📖 Learn More

- **[QUICK_START.md](QUICK_START.md)** - Setup in 3 minutes
- **[HEADGAIT_INTEGRATION.md](HEADGAIT_INTEGRATION.md)** - Technical details & algorithms
- **[backend/README.md](backend/README.md)** - Server API & configuration
- **[HeadGait Paper](https://doi.org/10.1109/TNSRE.2025.3542568)** - Research paper (IEEE TNSRE, 2025)
- **[HeadGait Repository](https://github.com/H-MOVE-LAB/headgait)** - Original models

## 📄 License

MIT License. HeadGait models: See [HeadGait repository](https://github.com/H-MOVE-LAB/headgait/blob/main/LICENSE).
