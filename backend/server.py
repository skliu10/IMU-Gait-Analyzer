"""
Real-time Gait Analysis WebSocket Server
Integrates with HeadGait models for gait speed estimation
"""

import os
import asyncio
import websockets
import json
import sys
from collections import deque
from pathlib import Path
from typing import Dict, List

# Import HeadGait integration
try:
    from headgait_integration import get_processor
    HEADGAIT_AVAILABLE = True
    print("✅ HeadGait integration module loaded")
except ImportError as e:
    print(f"⚠️  HeadGait integration module not found: {e}")
    print("   Using fallback algorithms")
    HEADGAIT_AVAILABLE = False

# Configuration
# Render/Heroku-style dynamic port; default to 8000 for local dev
PORT = int(os.getenv("PORT", 8000))
BUFFER_SIZE = 500  # Number of samples (25 seconds at 20Hz)
SAMPLING_RATE = 20  # Hz
UPDATE_INTERVAL = 0.5  # Process every 0.5 seconds

class GaitAnalyzer:
    """Real-time gait analysis using HeadGait models"""
    
    def __init__(self):
        self.data_buffer = deque(maxlen=BUFFER_SIZE)
        self.sampling_rate = SAMPLING_RATE
        
        # Cumulative counters (never decrease)
        self.total_strides = 0
        self.session_start_time = None
        self.last_ic_count = 0
        
        # Initialize HeadGait processor
        self.use_headgait = HEADGAIT_AVAILABLE
        if self.use_headgait:
            try:
                self.headgait_processor = get_processor()
                print("✅ HeadGait processor initialized")
            except Exception as e:
                print(f"⚠️  Could not initialize HeadGait processor: {e}")
                print("   Falling back to simple algorithms")
                self.use_headgait = False
        
        # Metrics
        self.last_metrics = {
            'gait_speed': 0.0,
            'stride_count': 0,
            'cadence': 0.0,
            'initial_contacts': 0,
            'status': 'waiting_for_data'
        }
    
    def add_data_point(self, data: dict):
        """Add IMU data point to buffer"""
        # Ensure all required fields exist
        required_fields = ['pitch', 'yaw', 'roll', 'accelX', 'accelY', 'accelZ']
        if all(field in data for field in required_fields):
            self.data_buffer.append(data)
    
    def analyze(self) -> Dict:
        """
        Analyze buffered data using HeadGait models
        
        Returns:
            Dictionary with gait metrics
        """
        if len(self.data_buffer) < 100:
            return {
                'gait_speed': 0.0,
                'stride_count': 0,
                'total_strides': self.total_strides,
                'cadence': 0.0,
                'initial_contacts': 0,
                'status': 'insufficient_data',
                'buffer_size': len(self.data_buffer),
                'using_headgait': self.use_headgait
            }
        
        # Check if there's actual movement (not just noise)
        import numpy as np
        recent_data = list(self.data_buffer)[-100:]  # Last 100 samples (5 seconds)
        accel_z = np.array([d['accelZ'] for d in recent_data])
        accel_variance = np.var(accel_z)
        
        # If variance is too low, person is probably stationary
        MOTION_THRESHOLD = 0.1  # Adjust this value (higher = less sensitive)
        if accel_variance < MOTION_THRESHOLD:
            return {
                'gait_speed': 0.0,
                'stride_count': 0,
                'total_strides': self.total_strides,
                'cadence': 0.0,
                'initial_contacts': 0,
                'status': 'stationary',
                'buffer_size': len(self.data_buffer),
                'using_headgait': self.use_headgait
            }
        
        # Use HeadGait processor if available
        if self.use_headgait:
            try:
                metrics = self.headgait_processor.process_buffer(list(self.data_buffer))
                metrics['buffer_size'] = len(self.data_buffer)
                metrics['using_headgait'] = True
                
                # Track cumulative strides based on initial contacts (more reliable)
                current_ic_count = metrics['initial_contacts']
                if current_ic_count > self.last_ic_count:
                    # New initial contacts detected - add them to total
                    new_ics = current_ic_count - self.last_ic_count
                    self.total_strides += (new_ics // 2)  # 2 ICs = 1 stride
                    self.last_ic_count = current_ic_count
                elif current_ic_count < self.last_ic_count:
                    # Buffer rolled over, reset tracking
                    self.last_ic_count = current_ic_count
                
                metrics['total_strides'] = self.total_strides
                
                self.last_metrics = metrics
                return metrics
            except Exception as e:
                print(f"❌ Error in HeadGait processing: {e}")
                import traceback
                traceback.print_exc()
                # Continue to fallback
        
        # Fallback: Simple heuristic algorithm
        return self._simple_analysis()
    
    def _simple_analysis(self) -> Dict:
        """Simple fallback analysis when HeadGait is not available"""
        import numpy as np
        from scipy.signal import find_peaks
        
        # Extract acceleration Z
        accel_z = np.array([d['accelZ'] for d in self.data_buffer])
        
        # Simple peak detection for initial contacts
        # Increased threshold to reduce false positives from noise
        peaks, _ = find_peaks(
            accel_z,
            height=np.mean(accel_z) + 1.0 * np.std(accel_z),  # Increased from 0.5 to 1.0
            distance=int(self.sampling_rate * 0.5),  # Min 0.5s between steps (was 0.4s)
            prominence=0.2  # Added: peak must be prominent enough
        )
        
        # Calculate cadence
        if len(peaks) > 1:
            time_span = len(self.data_buffer) / self.sampling_rate
            cadence = (len(peaks) / time_span) * 60
            stride_count = len(peaks) // 2
        else:
            cadence = 0.0
            stride_count = 0
        
        # Estimate speed from movement variance (rough approximation)
        movement_variance = np.std([d['accelZ'] for d in self.data_buffer])
        estimated_speed = min(movement_variance * 0.5, 4.0)
        
        # If very little movement detected, set speed to 0
        if len(peaks) < 2 or movement_variance < 0.3:
            estimated_speed = 0.0
        
        # Track cumulative strides based on initial contacts
        ic_count = len(peaks)
        if ic_count > self.last_ic_count:
            # New initial contacts detected
            new_ics = ic_count - self.last_ic_count
            self.total_strides += (new_ics // 2)  # 2 ICs = 1 stride
            self.last_ic_count = ic_count
        elif ic_count < self.last_ic_count:
            # Buffer rolled over
            self.last_ic_count = ic_count
        
        metrics = {
            'gait_speed': round(estimated_speed, 2),
            'stride_count': stride_count,
            'total_strides': self.total_strides,
            'cadence': round(cadence, 1),
            'initial_contacts': len(peaks),
            'status': 'analyzing_simple',
            'buffer_size': len(self.data_buffer),
            'using_headgait': False
        }
        
        self.last_metrics = metrics
        return metrics

# Global analyzer instance
analyzer = GaitAnalyzer()

async def websocket_handler(websocket):
    """Handle WebSocket connections"""
    client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    print(f"🔗 Client connected: {client_id}")
    
    # Reset cumulative counters for new session
    analyzer.total_strides = 0
    analyzer.last_ic_count = 0
    analyzer.session_start_time = None
    analyzer.data_buffer.clear()
    print(f"🔄 Reset counters for new session")
    
    try:
        sample_count = 0
        
        async for message in websocket:
            try:
                # Parse incoming IMU data
                data = json.loads(message)
                
                # Add to buffer
                analyzer.add_data_point(data)
                sample_count += 1
                
                # Process periodically (every 10 samples = ~0.5s at 20Hz)
                if sample_count % 10 == 0:
                    metrics = analyzer.analyze()
                    await websocket.send(json.dumps(metrics))
                    
                    # Log status
                    if metrics['status'] == 'analyzing' or metrics['status'] == 'analyzing_simple':
                        status_icon = "✅" if metrics.get('using_headgait') else "⚡"
                        print(f"{status_icon} Speed: {metrics['gait_speed']} m/s | "
                              f"Cadence: {metrics['cadence']} steps/min | "
                              f"Strides: {metrics['stride_count']} | "
                              f"Buffer: {metrics['buffer_size']}")
                
            except json.JSONDecodeError as e:
                print(f"❌ Invalid JSON from {client_id}: {e}")
            except Exception as e:
                print(f"❌ Error processing message: {e}")
                import traceback
                traceback.print_exc()
    
    except websockets.exceptions.ConnectionClosedOK:
        print(f"👋 Client disconnected gracefully: {client_id}")
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"⚠️  Client disconnected with error: {client_id} - {e}")
    except Exception as e:
        print(f"❌ Unexpected error with {client_id}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print(f"🔌 Handler closed for {client_id}")

async def main():
    """Start WebSocket server"""
    print("=" * 60)
    print("🚀 HEAD GAIT - Real-time Gait Analysis Server")
    print("=" * 60)
    print(f"📡 WebSocket server: ws://localhost:{PORT}")
    print(f"📊 Buffer size: {BUFFER_SIZE} samples ({BUFFER_SIZE/SAMPLING_RATE:.1f}s)")
    print(f"🎯 Sampling rate: {SAMPLING_RATE} Hz")
    
    if HEADGAIT_AVAILABLE:
        print("✅ HeadGait models: ENABLED")
        print("   Initial contacts: TCN model")
        print("   Gait speed: GPR model")
    else:
        print("⚠️  HeadGait models: DISABLED (using fallback)")
        print("   Run './setup.sh' to enable HeadGait")
    
    print("=" * 60)
    print("Waiting for connections...")
    print()
    
    async with websockets.serve(
        websocket_handler,
        "localhost",
        PORT,
        ping_interval=20,
        ping_timeout=10
    ):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        import traceback
        traceback.print_exc()
