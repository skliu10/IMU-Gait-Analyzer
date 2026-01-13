# Backend Server Documentation

Python WebSocket server for real-time gait analysis.

## Overview

This backend:
- Receives IMU data via WebSocket (port 8000)
- Processes data using HeadGait models
- Returns gait metrics every 0.5 seconds

## Setup

### Automated (Recommended)

```bash
./setup.sh
```

Creates virtual environment, installs dependencies, clones HeadGait repository.

### Manual

```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
git clone https://github.com/H-MOVE-LAB/headgait.git
```

### Virtual Environment

**Always activate before running:**

```bash
source venv/bin/activate  # You'll see (venv) in prompt
python server.py
```

**Deactivate when done:**

```bash
deactivate
```

## Running the Server

```bash
python server.py
```

Expected output:

```
============================================================
🚀 HEAD GAIT - Real-time Gait Analysis Server
============================================================
📡 WebSocket server: ws://localhost:8000
📊 Buffer size: 500 samples (25.0s)
🎯 Sampling rate: 20 Hz
✅ HeadGait models: ENABLED
   Initial contacts: TCN model
   Gait speed: GPR model
============================================================
Waiting for connections...
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:8000');
```

### Send IMU Data (Frontend → Backend)

**Rate**: ~20 Hz (every 50ms)

```json
{
  "pitch": 1.23,
  "yaw": 45.67,
  "roll": -2.34,
  "accelX": 0.12,
  "accelY": -0.45,
  "accelZ": 9.81,
  "timestamp": 1234567890
}
```

### Receive Metrics (Backend → Frontend)

**Rate**: Every 0.5s

```json
{
  "gait_speed": 1.35,
  "cadence": 115.2,
  "stride_count": 12,
  "initial_contacts": 24,
  "status": "analyzing",
  "using_headgait": true,
  "buffer_size": 500
}
```

**Status values:**
- `"waiting_for_data"` - Needs more samples
- `"insufficient_data"` - Buffer < 100 samples
- `"analyzing"` - HeadGait models active
- `"analyzing_simple"` - Fallback algorithms active

## Configuration

Edit `server.py`:

```python
# Server settings
PORT = 8000              # WebSocket port
BUFFER_SIZE = 500        # Samples to buffer (25s at 20Hz)
SAMPLING_RATE = 20       # Expected IMU sample rate (Hz)
UPDATE_INTERVAL = 0.5    # Not used (hardcoded to 10 samples)

# WebSocket settings
ping_interval = 20       # Ping every 20s
ping_timeout = 10        # Timeout after 10s
```

### Change Port

```python
PORT = 8001  # Use different port

# Also update frontend (app.js):
# const ws = new WebSocket('ws://localhost:8001');
```

### Adjust Buffer

```python
BUFFER_SIZE = 1000  # 50 seconds at 20Hz
```

- Larger = More stable, slower response
- Smaller = Faster response, less stable
- Minimum = 100 samples

### Analysis Frequency

In `websocket_handler()`:

```python
if sample_count % 10 == 0:  # Every 0.5s
    metrics = analyzer.analyze()
```

Change `% 10` to:
- `% 5` = 0.25s (faster)
- `% 20` = 1.0s (slower)

## File Structure

```
backend/
├── server.py                    # WebSocket server (THIS FILE)
├── headgait_integration.py      # HeadGait model wrapper
├── requirements.txt             # Python dependencies
├── setup.sh                     # Setup script
├── README.md                    # This file
├── venv/                        # Virtual environment
└── headgait/                    # Cloned HeadGait repository
    ├── Trained initial contacts model/
    ├── Trained gait speed model/
    └── ...
```

## Dependencies

From `requirements.txt`:

```
websockets==12.0       # WebSocket server
numpy==1.26.4          # Numerical computing
scipy==1.12.0          # Signal processing
tensorflow==2.15.0     # TCN model inference
scikit-learn==1.4.0    # GPR model (if converted)
```

## Testing

### Test Model Loading

```python
from headgait_integration import get_processor

processor = get_processor()
# Should print:
# ✅ Loaded TCN model: ...
# ✅ Loaded GPR model: ...
```

### Test with Dummy Data

```python
import numpy as np
from headgait_integration import get_processor

processor = get_processor()

# Generate 200 samples
dummy_data = []
for i in range(200):
    dummy_data.append({
        'pitch': np.sin(i/10) * 5,
        'yaw': np.cos(i/10) * 5,
        'roll': 0,
        'accelX': np.sin(i/8) * 2,
        'accelY': np.cos(i/8) * 2,
        'accelZ': 9.81 + np.sin(i/5) * 3
    })

# Process
metrics = processor.process_buffer(dummy_data)
print(metrics)
```

Expected output:

```python
{
    'gait_speed': 1.23,
    'stride_count': 8,
    'cadence': 96.0,
    'initial_contacts': 16,
    'status': 'analyzing'
}
```

## Troubleshooting

### Port Already in Use

```bash
# Find process
lsof -i :8000

# Kill it
kill -9 <PID>

# Or change port in server.py
PORT = 8001
```

### TensorFlow Not Found

```bash
source venv/bin/activate
pip install tensorflow==2.15.0

# For Apple Silicon:
pip install tensorflow-macos tensorflow-metal
```

### Models Not Loading

```bash
# Check HeadGait directory exists
ls headgait/

# Check model directories
ls headgait/Trained\ initial\ contacts\ model/
ls headgait/Trained\ gait\ speed\ model/

# If missing, clone
git clone https://github.com/H-MOVE-LAB/headgait.git
```

### WebSocket Connection Refused

1. Is server running? Check terminal
2. Is port correct? Should be 8000
3. Frontend must connect to same port
4. Firewall blocking? Allow localhost connections

## Logging

Server logs to stdout:

```python
print(f"✅ Speed: {metrics['gait_speed']} m/s | "
      f"Cadence: {metrics['cadence']} steps/min | "
      f"Strides: {metrics['stride_count']}")
```

To save logs:

```bash
python server.py > server.log 2>&1
```

## Performance

### Resource Usage

- **CPU**: ~10-20% (with TensorFlow)
- **RAM**: ~500MB (models loaded)
- **Network**: ~1-2 KB/s

### Optimization

1. Use TensorFlow Lite for faster inference
2. Batch process multiple samples
3. Use threading for concurrent connections
4. Cache preprocessing results

## Adding Custom Models

Edit `headgait_integration.py`:

```python
def load_models(self):
    # Load your custom TCN
    self.tcn_model = load_my_tcn('path/to/model')
    
    # Load your custom GPR
    self.gpr_model = load_my_gpr('path/to/model')
```

Ensure input/output shapes match:
- **TCN input**: `[batch, timesteps, 6]`
- **TCN output**: `[batch, timesteps, 1]` (probabilities)
- **GPR input**: `[batch, 9]`
- **GPR output**: `[batch, 1]` (speed in m/s)

## References

- **HeadGait Paper**: https://doi.org/10.1109/TNSRE.2025.3542568
- **HeadGait Repository**: https://github.com/H-MOVE-LAB/headgait
- **Technical Details**: See [../HEADGAIT_INTEGRATION.md](../HEADGAIT_INTEGRATION.md)

---

**For general setup**: See [../QUICK_START.md](../QUICK_START.md)  
**For technical details**: See [../HEADGAIT_INTEGRATION.md](../HEADGAIT_INTEGRATION.md)
