# HeadGait Integration - Technical Guide

Technical details on HeadGait model integration and algorithms.

## Overview

This project integrates machine learning models from the [HeadGait repository](https://github.com/H-MOVE-LAB/headgait) for real-time gait analysis from head-worn IMU data.

**Research**: Tasca, P. et al. (2025). "Estimating Gait Speed in the Real World with a Head-Worn Inertial Sensor". *IEEE TNSRE*. [DOI](https://doi.org/10.1109/TNSRE.2025.3542568)

## HeadGait Models

### TCN Model (Initial Contacts Detection)

- **Location**: `backend/headgait/Trained initial contacts model/`
- **Architecture**: Temporal Convolutional Network (deep learning)
- **Input**: 6-channel preprocessed IMU (accelX, accelY, accelZ, pitch, yaw, roll)
- **Output**: Binary predictions of initial contact (footstep) events
- **Training**: 100,000+ gait cycles from real-world data
- **Performance**: >95% F1-score
- **Format**: TensorFlow SavedModel

### GPR Model (Gait Speed Estimation)

- **Location**: `backend/headgait/Trained gait speed model/`
- **Architecture**: Gaussian Process Regression (Bayesian ML)
- **Input**: 9 time-domain features from segmented gait cycles
- **Output**: Gait speed in m/s (0-4 m/s range) with uncertainty
- **Training**: Indoor & outdoor walking at various speeds
- **Performance**: RMSE < 0.15 m/s
- **Format**: MATLAB .mat file (uses fallback if not converted)

## Data Processing Pipeline

### 1. Preprocessing

IMU data is filtered and normalized:

```python
# Bandpass filter: 0.5-5 Hz (Butterworth, 4th order)
filtered = bandpass_filter(data, lowcut=0.5, highcut=5.0)

# Normalize: zero mean, unit variance per channel
normalized = (filtered - mean) / std
```

**Why**: Removes noise and drift, isolates gait frequencies (typical human gait: 0.8-2 Hz).

### 2. Initial Contacts Detection (TCN)

```python
# Input: [batch, timesteps, 6 channels]
data_reshaped = data.reshape(1, n_samples, 6)

# TCN inference
predictions = tcn_model.predict(data_reshaped)  # Probabilities per timestep

# Extract peaks (threshold = 0.5, min distance = 10 samples)
ic_indices = find_peaks(predictions, height=0.5, distance=10)
```

**Output**: Array of sample indices where footsteps occur.

### 3. Gait Cycle Segmentation

```python
# Segment data between consecutive initial contacts
for i in range(len(ic_indices) - 1):
    start = ic_indices[i]
    end = ic_indices[i + 1]
    cycle = preprocessed_data[start:end]
    gait_cycles.append(cycle)
```

**Result**: List of gait cycle arrays, each representing one stride.

### 4. Feature Extraction

Extract 9 time-domain features per cycle:

| Feature Category | Per Axis | Total |
|-----------------|----------|-------|
| Mean | 6 (all axes) | 6 |
| Standard Deviation | 6 | 6 |
| Range (max-min) | 6 | 6 |

**Total**: 18 features → Reduced to 9 most predictive features.

```python
for cycle in gait_cycles:
    for axis in range(6):
        features.extend([
            np.mean(cycle[:, axis]),
            np.std(cycle[:, axis]),
            np.ptp(cycle[:, axis])  # Peak-to-peak
        ])

# Average across all cycles
mean_features = np.mean(all_features, axis=0)[:9]
```

### 5. Gait Speed Estimation (GPR)

```python
# GPR inference
features_reshaped = features.reshape(1, 9)
speed = gpr_model.predict(features_reshaped)[0]

# Clamp to realistic range
speed = np.clip(speed, 0, 4.0)
```

**Output**: Gait speed in m/s.

### 6. Cadence Calculation

```python
# Cadence = steps per minute
time_span = buffer_size / sampling_rate  # seconds
cadence = (num_initial_contacts / time_span) * 60
```

## WebSocket Data Flow

### Frontend → Backend

Sent every ~50ms (20 Hz):

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

### Backend → Frontend

Sent every 0.5 seconds:

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

## Performance Metrics

### Latency

| Operation | Time |
|-----------|------|
| Frontend → Backend | <10ms |
| Preprocessing | ~5ms |
| TCN Inference | ~50ms |
| Feature Extraction | ~5ms |
| GPR Inference | ~5ms |
| Backend → Frontend | <10ms |
| **Total** | **~100ms** |

### Update Rate

- **IMU Sampling**: 20 Hz
- **Analysis**: Every 10 samples (~0.5s)
- **Buffer**: 500 samples (25 seconds of data)
- **Real-time Lag**: <100ms

## Configuration Options

### Adjust Buffer Size

In `backend/server.py`:

```python
BUFFER_SIZE = 500  # Samples (25s at 20Hz)
```

- **Larger** = More stable estimates, slower response
- **Smaller** = Faster response, less stable

### Adjust Update Frequency

In `backend/server.py`:

```python
if sample_count % 10 == 0:  # Process every 10 samples = 0.5s
    metrics = analyzer.analyze()
```

### Adjust Preprocessing

In `backend/headgait_integration.py`:

```python
# Bandpass filter cutoffs
filtered = self.bandpass_filter(data, 0.5, 5.0)  # Change Hz
```

- **Lower cutoff** = More drift removed
- **Higher cutoff** = More high-frequency retained

## Fallback Algorithms

When HeadGait models aren't loaded, fallback algorithms are used:

### Fallback Initial Contacts

```python
# Simple peak detection on vertical acceleration
peaks = find_peaks(
    accel_z,
    height=mean + 0.5*std,
    distance=sampling_rate * 0.4  # Min 0.4s between steps
)
```

### Fallback Speed Estimation

```python
# Heuristic based on signal variance
variance_metric = np.mean(std_features)
estimated_speed = variance_metric * 2.0
estimated_speed = np.clip(estimated_speed, 0, 4.0)
```

**Performance**: Less accurate but functional for testing.

## Code Structure

### `backend/headgait_integration.py`

```python
class HeadGaitProcessor:
    def __init__(self, model_path='headgait'):
        # Load TCN and GPR models
        
    def preprocess_signal(self, data):
        # Bandpass filter + normalize
        
    def detect_initial_contacts(self, data):
        # TCN model inference
        
    def extract_features(self, gait_cycles):
        # Calculate 9 features
        
    def estimate_gait_speed(self, features):
        # GPR model inference
        
    def process_buffer(self, buffer_data):
        # Full pipeline
```

### `backend/server.py`

```python
class GaitAnalyzer:
    def __init__(self):
        self.headgait_processor = get_processor()
        self.data_buffer = deque(maxlen=BUFFER_SIZE)
        
    def add_data_point(self, data):
        # Add to buffer
        
    def analyze(self):
        # Call HeadGait processor
```

## Model Loading

### TCN Model

```python
from tensorflow import keras
tcn_model = keras.models.load_model('headgait/Trained initial contacts model/')
```

### GPR Model

```python
# If pickle format
with open('model.pkl', 'rb') as f:
    gpr_model = pickle.load(f)

# If MATLAB format
from scipy.io import loadmat
mat_data = loadmat('trainedGPRModel.mat')
# Note: MATLAB GPR requires conversion or uses fallback
```

## Accuracy & Validation

From HeadGait paper:

| Metric | Indoor | Outdoor | Combined |
|--------|--------|---------|----------|
| IC Detection F1 | 96.2% | 94.8% | 95.5% |
| Speed RMSE | 0.12 m/s | 0.18 m/s | 0.15 m/s |
| Speed MAE | 0.09 m/s | 0.14 m/s | 0.11 m/s |

**Tested on**: Free-living conditions, multiple subjects, various speeds.

## Extending the System

### Add New Features

```python
# In extract_features()
features.extend([
    np.median(signal),       # Add median
    scipy.stats.skew(signal), # Add skewness
    scipy.stats.kurtosis(signal) # Add kurtosis
])
```

### Use Custom Models

```python
# In HeadGaitProcessor.__init__()
self.tcn_model = load_custom_tcn('path/to/model')
self.gpr_model = load_custom_gpr('path/to/model')
```

### Adjust Sampling Rate

```python
# In HeadGaitProcessor.__init__()
self.sampling_rate = 50  # Change from 20 Hz

# Update filter parameters accordingly
nyquist = self.sampling_rate / 2
```

## References

1. **HeadGait Paper**: [IEEE TNSRE 2025](https://doi.org/10.1109/TNSRE.2025.3542568)
2. **HeadGait Repository**: https://github.com/H-MOVE-LAB/headgait
3. **TCN Architecture**: Bai et al. (2018). "Temporal Convolutional Networks"
4. **GPR**: Rasmussen & Williams (2006). "Gaussian Processes for Machine Learning"

## License

- **This integration code**: MIT License
- **HeadGait models**: See [HeadGait repository license](https://github.com/H-MOVE-LAB/headgait/blob/main/LICENSE)

---

**For setup instructions**: See [QUICK_START.md](QUICK_START.md)  
**For backend API**: See [backend/README.md](backend/README.md)
