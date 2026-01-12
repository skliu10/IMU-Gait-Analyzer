"""
HeadGait Model Integration
Integrates trained TCN and GPR models from H-MOVE-LAB/headgait repository
"""

import numpy as np
from scipy import signal
from scipy.signal import butter, filtfilt
import pickle
from pathlib import Path
from typing import List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

class HeadGaitProcessor:
    """
    Process head-worn IMU data using HeadGait models
    Based on: https://github.com/H-MOVE-LAB/headgait
    """
    
    def __init__(self, model_path: str = 'headgait'):
        """
        Initialize HeadGait processor with trained models
        
        Args:
            model_path: Path to headgait repository
        """
        self.model_path = Path(model_path)
        self.sampling_rate = 20  # Hz
        
        # Model placeholders
        self.tcn_model = None
        self.gpr_model = None
        
        # Load models
        self.load_models()
    
    def load_models(self):
        """Load trained TCN and GPR models from HeadGait repository"""
        try:
            # Load TCN model for initial contacts detection
            tcn_path = self.model_path / 'Trained initial contacts model'
            if tcn_path.exists():
                try:
                    from tensorflow import keras
                    model_file = list(tcn_path.glob('*.h5')) or list(tcn_path.glob('*.keras'))
                    if model_file:
                        self.tcn_model = keras.models.load_model(str(model_file[0]))
                        print(f"✅ Loaded TCN model: {model_file[0].name}")
                    else:
                        print("⚠️  TCN model file not found")
                except Exception as e:
                    print(f"⚠️  Could not load TCN model: {e}")
            
            # Load GPR model for gait speed estimation
            gpr_path = self.model_path / 'Trained gait speed model'
            if gpr_path.exists():
                try:
                    model_file = list(gpr_path.glob('*.pkl')) or list(gpr_path.glob('*.mat'))
                    if model_file:
                        with open(str(model_file[0]), 'rb') as f:
                            self.gpr_model = pickle.load(f)
                        print(f"✅ Loaded GPR model: {model_file[0].name}")
                    else:
                        print("⚠️  GPR model file not found")
                except Exception as e:
                    print(f"⚠️  Could not load GPR model: {e}")
            
            if self.tcn_model is None or self.gpr_model is None:
                print("⚠️  Using placeholder algorithms")
                print("   Run './setup.sh' to download HeadGait models")
                
        except Exception as e:
            print(f"⚠️  Error loading models: {e}")
    
    def preprocess_signal(self, data: np.ndarray) -> np.ndarray:
        """
        Preprocess IMU signal as per HeadGait methodology
        Based on preprocessing_initial_contacts_detection.m
        
        Args:
            data: Raw IMU data [n_samples x 6] (accelX, accelY, accelZ, pitch, yaw, roll)
            
        Returns:
            Preprocessed data
        """
        # 1. Bandpass filter (0.5-5 Hz) - typical gait frequency range
        filtered_data = self.bandpass_filter(data, 0.5, 5.0)
        
        # 2. Normalize each channel
        normalized_data = self.normalize_signal(filtered_data)
        
        return normalized_data
    
    def bandpass_filter(self, data: np.ndarray, lowcut: float, highcut: float) -> np.ndarray:
        """
        Apply bandpass Butterworth filter
        
        Args:
            data: Input signal
            lowcut: Low cutoff frequency (Hz)
            highcut: High cutoff frequency (Hz)
            
        Returns:
            Filtered signal
        """
        nyquist = self.sampling_rate / 2
        low = lowcut / nyquist
        high = highcut / nyquist
        
        # 4th order Butterworth filter
        b, a = butter(4, [low, high], btype='band')
        
        # Apply filter to each column
        filtered = np.zeros_like(data)
        for i in range(data.shape[1]):
            filtered[:, i] = filtfilt(b, a, data[:, i])
        
        return filtered
    
    def normalize_signal(self, data: np.ndarray) -> np.ndarray:
        """
        Normalize signal to zero mean and unit variance
        
        Args:
            data: Input signal
            
        Returns:
            Normalized signal
        """
        normalized = np.zeros_like(data)
        for i in range(data.shape[1]):
            mean = np.mean(data[:, i])
            std = np.std(data[:, i])
            if std > 0:
                normalized[:, i] = (data[:, i] - mean) / std
            else:
                normalized[:, i] = data[:, i] - mean
        
        return normalized
    
    def detect_initial_contacts(self, data: np.ndarray) -> np.ndarray:
        """
        Detect initial contacts using TCN model
        
        Args:
            data: Preprocessed IMU data [n_samples x 6]
            
        Returns:
            Array of initial contact indices
        """
        if self.tcn_model is not None:
            try:
                # Reshape for TCN model (batch, timesteps, features)
                data_reshaped = data.reshape(1, data.shape[0], data.shape[1])
                
                # Predict initial contacts
                predictions = self.tcn_model.predict(data_reshaped, verbose=0)
                predictions = predictions.flatten()
                
                # Find peaks in predictions (threshold = 0.5)
                from scipy.signal import find_peaks
                peaks, _ = find_peaks(predictions, height=0.5, distance=10)
                
                return peaks
                
            except Exception as e:
                print(f"Error in TCN prediction: {e}")
                return self._fallback_ic_detection(data)
        else:
            return self._fallback_ic_detection(data)
    
    def _fallback_ic_detection(self, data: np.ndarray) -> np.ndarray:
        """
        Fallback initial contacts detection using peak detection
        Used when TCN model is not available
        """
        # Use vertical acceleration (Z-axis)
        accel_z = data[:, 2]
        
        # Find peaks
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(
            accel_z,
            height=np.mean(accel_z) + 0.5 * np.std(accel_z),
            distance=int(self.sampling_rate * 0.4)
        )
        
        return peaks
    
    def extract_features(self, gait_cycles: List[np.ndarray]) -> np.ndarray:
        """
        Extract 9 time-domain features from gait cycles
        As per HeadGait methodology
        
        Features per axis (6 axes x features = varies, reduced to 9):
        1. Mean
        2. Standard deviation
        3. Range (max - min)
        4. Root mean square (RMS)
        5. Peak-to-peak amplitude
        
        Args:
            gait_cycles: List of gait cycle arrays
            
        Returns:
            Feature vector [9 features]
        """
        if not gait_cycles:
            return np.zeros(9)
        
        # Average features across all cycles
        all_features = []
        
        for cycle in gait_cycles:
            cycle_features = []
            
            # Extract features from each sensor axis
            for axis in range(min(6, cycle.shape[1])):
                signal = cycle[:, axis]
                
                # Time-domain features
                cycle_features.extend([
                    np.mean(signal),           # Mean
                    np.std(signal),            # Std
                    np.ptp(signal),            # Range
                ])
            
            all_features.append(cycle_features)
        
        # Average across cycles
        mean_features = np.mean(all_features, axis=0)
        
        # Return first 9 features (as per HeadGait paper)
        return mean_features[:9]
    
    def estimate_gait_speed(self, features: np.ndarray) -> float:
        """
        Estimate gait speed using GPR model
        
        Args:
            features: Feature vector [9 features]
            
        Returns:
            Estimated gait speed (m/s)
        """
        if self.gpr_model is not None and len(features) == 9:
            try:
                # Predict speed using GPR model
                features_reshaped = features.reshape(1, -1)
                speed = self.gpr_model.predict(features_reshaped)[0]
                
                # Ensure reasonable bounds (0-4 m/s)
                speed = np.clip(speed, 0, 4.0)
                
                return float(speed)
                
            except Exception as e:
                print(f"Error in GPR prediction: {e}")
                return self._fallback_speed_estimation(features)
        else:
            return self._fallback_speed_estimation(features)
    
    def _fallback_speed_estimation(self, features: np.ndarray) -> float:
        """
        Fallback speed estimation using heuristics
        Used when GPR model is not available
        """
        # Simple heuristic based on signal variance
        # Higher variance usually means faster movement
        variance_metric = np.mean(features[1::3])  # Average of std features
        
        # Map variance to speed (rough approximation)
        estimated_speed = variance_metric * 2.0
        estimated_speed = np.clip(estimated_speed, 0, 4.0)
        
        return float(estimated_speed)
    
    def process_buffer(self, buffer_data: List[dict]) -> dict:
        """
        Process buffered IMU data and extract gait metrics
        
        Args:
            buffer_data: List of IMU samples with keys:
                        pitch, yaw, roll, accelX, accelY, accelZ
        
        Returns:
            Dictionary with gait metrics
        """
        if len(buffer_data) < 100:
            return {
                'gait_speed': 0.0,
                'stride_count': 0,
                'cadence': 0.0,
                'initial_contacts': 0,
                'status': 'insufficient_data'
            }
        
        # Convert to numpy array
        data = np.array([
            [s['accelX'], s['accelY'], s['accelZ'],
             s['pitch'], s['yaw'], s['roll']]
            for s in buffer_data
        ])
        
        # 1. Preprocess
        preprocessed = self.preprocess_signal(data)
        
        # 2. Detect initial contacts
        ic_indices = self.detect_initial_contacts(preprocessed)
        
        # 3. Extract gait cycles
        gait_cycles = []
        for i in range(len(ic_indices) - 1):
            start = ic_indices[i]
            end = ic_indices[i + 1]
            
            if end - start > 5:  # Valid cycle (>0.25s)
                cycle = preprocessed[start:end]
                gait_cycles.append(cycle)
        
        # 4. Extract features
        features = self.extract_features(gait_cycles)
        
        # 5. Estimate gait speed
        gait_speed = self.estimate_gait_speed(features)
        
        # 6. Calculate cadence
        if len(ic_indices) > 1:
            time_span = len(buffer_data) / self.sampling_rate
            cadence = (len(ic_indices) / time_span) * 60
        else:
            cadence = 0.0
        
        return {
            'gait_speed': round(gait_speed, 2),
            'stride_count': len(gait_cycles),
            'cadence': round(cadence, 1),
            'initial_contacts': len(ic_indices),
            'status': 'analyzing'
        }

# Singleton instance
_processor = None

def get_processor(model_path: str = 'headgait') -> HeadGaitProcessor:
    """Get or create HeadGait processor instance"""
    global _processor
    if _processor is None:
        _processor = HeadGaitProcessor(model_path)
    return _processor
