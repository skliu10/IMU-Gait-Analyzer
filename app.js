// BLE Configuration
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Alternate ESP32 service (e.g., Nordic UART-style) — lowercase per Web Bluetooth requirements
const ALT_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
// Nordic UART characteristics (notify = TX, write = RX)
const ALT_NOTIFY_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const ALT_WRITE_CHAR_UUID  = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

// Haptic control service/characteristic
const CONTROL_SERVICE_UUID = 'a7b3c8d2-4e5f-4a1b-9c8d-7e6f5a4b3c2d';
const CONTROL_CHAR_UUID = 'f9e8d7c6-b5a4-4938-8271-6a5b4c3d2e1f';

// Global variables
let bleDevice = null;
let bleCharacteristic = null;
let bleServer = null;
let isConnected = false;

// Recording variables
let isRecording = false;
let recordedData = [];
let recordingStartTime = null;

// Chart data
const maxDataPoints = 50;
const chartData = {
    pitch: [],
    yaw: [],
    roll: [],
    accelX: [],
    accelY: [],
    accelZ: [],
    tilt: [],
    tiltStdDev: [], // Standard deviation deviation from calibration baseline
    timestamps: []
};

// Current orientation values
let currentOrientation = {
    pitch: 0,
    yaw: 0,
    roll: 0
};

// Previous orientation values for calculating acceleration
let previousOrientation = {
    pitch: 0,
    yaw: 0,
    roll: 0,
    timestamp: Date.now()
};

// Current acceleration values
let currentAcceleration = {
    x: 0,
    y: 0,
    z: 0
};

// Calibration baseline (for zeroing)
let calibrationBaseline = {
    pitch: 0,
    yaw: 0,
    roll: 0,
    isCalibrated: false
};
let calibrationTiltStd = 0;

// Calibration flow
let isCalibrating = false;
let isZeroingOut = false;
let zeroOutSamples = [];
let calibrationSamples = [];
let calibrationTimer = null;
let calibrationCountdown = 10;

// Tilt (filtered yaw) state
class LiveLowPass {
    constructor(alpha = 0.1) {
        this.alpha = alpha; // Closer to 0 is smoother, closer to 1 is raw
        this.smoothedValue = null;
    }

    update(newValue) {
        if (this.smoothedValue === null) {
            this.smoothedValue = newValue;
            return newValue;
        }
        // Formula: y[n] = y[n-1] + alpha * (x[n] - y[n-1])
        this.smoothedValue = this.smoothedValue + this.alpha * (newValue - this.smoothedValue);
        return this.smoothedValue;
    }
}

class LivePeakMidline {
    constructor(maLength = 30) {
        this.buffer = []; // Window of 3 samples to detect peaks
        this.midpoints = []; // Stores the last 30 midpoints
        this.maLength = maLength;
        this.lastExtreme = null;
    }

    update(newPoint) {
        this.buffer.push(newPoint);
        if (this.buffer.length > 3) this.buffer.shift();
        if (this.buffer.length < 3) return null;

        const [prevPrev, prev, current] = this.buffer;

        // Peak detection logic: Is the middle point the highest or lowest?
        const isPeak = (prev > prevPrev && prev > current);
        const isTrough = (prev < prevPrev && prev < current);

        if (isPeak || isTrough) {
            const currentExtreme = prev;

            if (this.lastExtreme !== null) {
                const midpoint = (currentExtreme + this.lastExtreme) / 2;
                this.midpoints.push(midpoint);
                
                if (this.midpoints.length > this.maLength) {
                    this.midpoints.shift();
                }
            }
            this.lastExtreme = currentExtreme;
        }

        // Return the Trailing Moving Average of the midpoints
        if (this.midpoints.length === 0) return null;
        const sum = this.midpoints.reduce((a, b) => a + b, 0);
        return sum / this.midpoints.length;
    }
}

const tiltLowPassFilter = new LiveLowPass(0.1); // Adjust alpha for desired smoothing (0.1 = smooth, 0.5 = moderate, 1.0 = raw)
const tiltPeakMidline = new LivePeakMidline(30); // Moving average of 30 midpoints
const tiltBuffer = [];
const tiltWindow = 20; // samples (~1s if ~20Hz; adjust if needed)
let lastTiltUpdate = 0;
let currentTiltFiltered = 0;
let currentTiltAvg = 0;

// Haptic control state
let hapticConnected = false;
let hapticChar = null;
let hapticAlertActive = false;
let hapticAlertTimer = null;

// Unwrap state for Euler angles to prevent ±180/360 jumps
let lastUnwrappedAngles = { pitch: null, yaw: null, roll: null };

// Helper to unwrap a single angle using the previous unwrapped value
function unwrapAngle(current, prevUnwrapped) {
    if (prevUnwrapped === null || Number.isNaN(prevUnwrapped) || Number.isNaN(current)) {
        return current;
    }
    // Compute delta relative to the last unwrapped angle modulo 360
    let delta = current - (prevUnwrapped % 360);
    // Wrap delta into [-180, 180] to pick the shortest path
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return prevUnwrapped + delta;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    initializeCharts();
    initializeOrientationCanvas();
    checkBluetoothSupport();
    
    // Initial status
    showStatus('Disconnected', 'disconnected');
});

// Check if Web Bluetooth is supported
function checkBluetoothSupport() {
    if (!navigator.bluetooth) {
        showError('Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera.');
        document.getElementById('connectBtn').disabled = true;
    }
}

// Initialize UI event listeners
function initializeUI() {
    document.getElementById('connectBtn').addEventListener('click', handleConnect);
    document.getElementById('closeError').addEventListener('click', hideError);
    document.getElementById('startRecordBtn').addEventListener('click', startRecording);
    document.getElementById('stopRecordBtn').addEventListener('click', stopRecording);
    document.getElementById('zeroOutBtn').addEventListener('click', zeroOutIMU);
    document.getElementById('calibrateBtn').addEventListener('click', startCalibration);
    document.getElementById('controlSwitchBtn').addEventListener('click', connectHapticService);
    const tabRawBtn = document.getElementById('tabRaw');
    const tabDerivedBtn = document.getElementById('tabDerived');
    tabRawBtn.addEventListener('click', () => switchTab('raw'));
    tabDerivedBtn.addEventListener('click', () => switchTab('derived'));
    // Default to Derived tab
    switchTab('derived');
    
    // Initially disable recording buttons
    updateRecordingUI();
    // Ensure haptic control is enabled on load
    updateControlUI();
}

// Handle connect/disconnect button
async function handleConnect() {
    if (isConnected) {
        await disconnect();
    } else {
        // Use connectScanAll() to see all devices for debugging
        // Use connect() for normal operation
        await connect();
    }
}

// Connect to BLE device
async function connect() {
    try {
        showStatus('Connecting...', 'connecting');
        console.log('Attempting to connect with UUIDs:', SERVICE_UUID, CHARACTERISTIC_UUID);
        
        // Request device - match by service UUIDs only (no name prefix)
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [SERVICE_UUID] },
                { services: [ALT_SERVICE_UUID] }
            ],
            optionalServices: [SERVICE_UUID, ALT_SERVICE_UUID, CONTROL_SERVICE_UUID]
        });
        
        console.log('Device selected:', bleDevice.name);

        // Connect to GATT server
        console.log('Connecting to GATT server...');
        bleServer = await bleDevice.gatt.connect();
        console.log('Connected to GATT server');
        
        // Get service (try primary, then alternate)
        console.log('Getting primary service...');
        let service = null;
        try {
            service = await bleServer.getPrimaryService(SERVICE_UUID);
            console.log('Service obtained (primary)');
        } catch (e) {
            console.warn('Primary service not found, trying alternate...');
            service = await bleServer.getPrimaryService(ALT_SERVICE_UUID);
            console.log('Service obtained (alternate)');
        }
        
        // Get characteristic (try primary ID, then alternate notify char if using ALT service)
        console.log('Getting characteristic...');
        try {
            bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
            console.log('Characteristic obtained (primary)');
        } catch (e) {
            if (service.uuid.toLowerCase() === ALT_SERVICE_UUID) {
                console.warn('Primary characteristic not found; trying ALT notify characteristic...');
                bleCharacteristic = await service.getCharacteristic(ALT_NOTIFY_CHAR_UUID);
                console.log('Characteristic obtained (ALT notify)');
            } else {
                throw e;
            }
        }
        
        // Start notifications
        console.log('Starting notifications...');
        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
        console.log('✅ Notifications started - waiting for data...');
        console.log('⚠️ If no data appears:');
        console.log('  1. Check ESP32 is powered on and running');
        console.log('  2. Open ESP32 serial monitor (115200 baud)');
        console.log('  3. Look for "Sent: ..." messages');
        console.log('  4. Try power cycling the ESP32');
        
        // Handle disconnection
        bleDevice.addEventListener('gattserverdisconnected', handleDisconnection);
        
        // Reset calibration state on new connection
        calibrationBaseline.isCalibrated = false;
        isCalibrating = false;
        isZeroingOut = false;
        calibrationSamples = [];
        zeroOutSamples = [];
        calibrationCountdown = 10;
        // Reset low-pass filter state for fresh start
        tiltLowPassFilter.smoothedValue = null;
        // Reset peak/trough midline state
        tiltPeakMidline.buffer = [];
        tiltPeakMidline.midpoints = [];
        tiltPeakMidline.lastExtreme = null;
        if (calibrationTimer) {
            clearInterval(calibrationTimer);
            calibrationTimer = null;
        }
        updateCalibrationUI();
        
        isConnected = true;
        updateConnectionUI();
        showStatus('Connected - Please calibrate before analyzing', 'connected');
        hideError();
        
    } catch (error) {
        console.error('Connection error:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        showError(`Failed to connect: ${error.message}`);
        showStatus('Disconnected', 'disconnected');
    }
}

// Alternative connect function - scans all devices (for debugging)
// To use this, temporarily replace the connect() call in handleConnect()
async function connectScanAll() {
    try {
        showStatus('Connecting...', 'connecting');
        console.log('Scanning for ALL BLE devices...');
        
        // Request device - accept all devices to see what's available
        bleDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        });
        
        console.log('Device selected:', bleDevice.name, 'ID:', bleDevice.id);

        // Connect to GATT server
        console.log('Connecting to GATT server...');
        const server = await bleDevice.gatt.connect();
        console.log('Connected to GATT server');
        
        // List all services
        console.log('Getting all services...');
        const services = await server.getPrimaryServices();
        console.log('Available services:');
        services.forEach(service => {
            console.log('  - Service UUID:', service.uuid);
        });
        
        // Get service
        console.log('Getting primary service:', SERVICE_UUID);
        const service = await server.getPrimaryService(SERVICE_UUID);
        console.log('Service obtained');
        
        // Get characteristic
        console.log('Getting characteristic:', CHARACTERISTIC_UUID);
        bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
        console.log('Characteristic obtained');
        
        // Start notifications
        console.log('Starting notifications...');
        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
        console.log('Notifications started');
        
        // Handle disconnection
        bleDevice.addEventListener('gattserverdisconnected', handleDisconnection);
        
        isConnected = true;
        updateConnectionUI();
        showStatus('Connected', 'connected');
        hideError();
        
    } catch (error) {
        console.error('Connection error:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        showError(`Failed to connect: ${error.message}`);
        showStatus('Disconnected', 'disconnected');
    }
}

// Disconnect from BLE device
async function disconnect() {
    try {
        if (bleCharacteristic) {
            await bleCharacteristic.stopNotifications();
            bleCharacteristic.removeEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
        }
        
        if (bleDevice && bleDevice.gatt.connected) {
            await bleDevice.gatt.disconnect();
        }
        bleServer = null;
        isCalibrating = false;
        isZeroingOut = false;
        calibrationSamples = [];
        zeroOutSamples = [];
        calibrationCountdown = 10;
        if (window.zeroOutTimer) {
            clearTimeout(window.zeroOutTimer);
            window.zeroOutTimer = null;
        }
        // Reset low-pass filter state on disconnect
        tiltLowPassFilter.smoothedValue = null;
        // Reset peak/trough midline state
        tiltPeakMidline.buffer = [];
        tiltPeakMidline.midpoints = [];
        tiltPeakMidline.lastExtreme = null;
        if (calibrationTimer) {
            clearInterval(calibrationTimer);
            calibrationTimer = null;
        }
        hapticConnected = false;
        hapticChar = null;
        if (hapticAlertTimer) {
            clearTimeout(hapticAlertTimer);
            hapticAlertTimer = null;
        }
        hapticAlertActive = false;
        
        isConnected = false;
        updateConnectionUI();
        updateCalibrationUI();
        showStatus('Disconnected', 'disconnected');
        
    } catch (error) {
        console.error('Disconnection error:', error);
    }
}

// Handle disconnection event
function handleDisconnection() {
    isConnected = false;
    bleServer = null;
    updateConnectionUI();
    showStatus('Disconnected', 'disconnected');
}

// Show status
function showStatus(text, type) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    statusDot.className = `status-dot ${type}`;
    statusText.textContent = text;
}

// Show error message
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
}

// Hide error message
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// Handle characteristic value changed
function handleCharacteristicValueChanged(event) {
    const value = new TextDecoder().decode(event.target.value);
    console.log('📡 Raw BLE data received:', value);
    parseIMUData(value);
}

// Store raw sensor data for HeadGait processing
let rawSensorData = {
    accelX: 0,
    accelY: 0,
    accelZ: 0
};

// Parse IMU data
function parseIMUData(data) {
    try {
        // Expected format: "yaw,pitch,roll,accelX,accelY,accelZ\n"
        const values = data.trim().split(',');
        console.log('📊 Parsed values:', values, 'Length:', values.length);
        
        // Check if we have at least 6 values (yaw, pitch, roll, accelX, accelY, accelZ)
        if (values.length >= 6) {
            const yaw = parseFloat(values[0]);
            const pitch = parseFloat(values[1]);
            const roll = parseFloat(values[2]);
            const accelX = parseFloat(values[3]);
            const accelY = parseFloat(values[4]);
            const accelZ = parseFloat(values[5]);
            
            console.log('🔢 Values:', { yaw, pitch, roll, accelX, accelY, accelZ });
            
            if (!isNaN(pitch) && !isNaN(yaw) && !isNaN(roll) && !isNaN(accelX) && !isNaN(accelY) && !isNaN(accelZ)) {
                console.log('✅ Valid IMU data, updating display');
                
                // Store raw acceleration data for HeadGait-compatible export
                rawSensorData = { accelX, accelY, accelZ };
                
                // Update with orientation and acceleration data
                updateIMUData(pitch, yaw, roll, accelX, accelY, accelZ);
            } else {
                console.warn('⚠️ Invalid data - contains NaN values');
            }
        } else {
            console.warn('⚠️ Insufficient data - expected 6 values, got', values.length);
        }
    } catch (error) {
        console.error('❌ Error parsing IMU data:', error);
    }
}

// Calculate linear acceleration from orientation change
function calculateAcceleration(pitch, yaw, roll) {
    const now = Date.now();
    const deltaTime = (now - previousOrientation.timestamp) / 1000; // Convert to seconds
    
    if (deltaTime > 0) {
        // Calculate rate of change for each angle (degrees per second)
        const pitchRate = Math.abs(pitch - previousOrientation.pitch) / deltaTime;
        const yawRate = Math.abs(yaw - previousOrientation.yaw) / deltaTime;
        const rollRate = Math.abs(roll - previousOrientation.roll) / deltaTime;
        
        // Combine into a single acceleration metric (motion intensity)
        // Using root mean square for a smooth combined value
        const acceleration = Math.sqrt((pitchRate * pitchRate + yawRate * yawRate + rollRate * rollRate) / 3);
        
        // Update previous values
        previousOrientation = { pitch, yaw, roll, timestamp: now };
        
        return acceleration;
    }
    
    return 0;
}

// Butterworth filter coefficients for calibration data filtering
const CALIB_BW_B = [0.0028981946, 0.0086945839, 0.0086945839, 0.0028981946];
const CALIB_BW_A = [1.0, -2.3740947437, 1.9293556691, -0.5320753683];

// Apply 3rd-order Butterworth low-pass filter to an array of values
function applyButterworthToArray(values) {
    if (values.length === 0) return [];
    
    const filtered = [];
    let prevInputs = [0, 0, 0];
    let prevOutputs = [0, 0, 0];
    
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        // Shift history: x[n-1..3], y[n-1..3]
        prevInputs = [val, prevInputs[0], prevInputs[1]];
        const x0 = prevInputs[0], x1 = prevInputs[1], x2 = prevInputs[2], x3 = prevInputs[3] || 0;
        const y1 = prevOutputs[0], y2 = prevOutputs[1], y3 = prevOutputs[2];
        
        const y0 = CALIB_BW_B[0]*x0 + CALIB_BW_B[1]*x1 + CALIB_BW_B[2]*x2 + CALIB_BW_B[3]*x3
                  - CALIB_BW_A[1]*y1 - CALIB_BW_A[2]*y2 - CALIB_BW_A[3]*y3;
        
        // Update output history
        prevOutputs = [y0, y1, y2];
        filtered.push(y0);
    }
    
    return filtered;
}

// Calibrate/Zero the sensors
function calibrateZero(rawPitch, rawYaw, rawRoll) {
    calibrationBaseline = {
        pitch: rawPitch,
        yaw: rawYaw,
        roll: rawRoll,
        isCalibrated: true
    };
    
    // Reset acceleration calculation
    previousOrientation = {
        pitch: 0,
        yaw: 0,
        roll: 0,
        timestamp: Date.now()
    };
    
    console.log('Calibrated to zero:', calibrationBaseline);
}

// Apply calibration (subtract baseline)
function applyCalibration(rawPitch, rawYaw, rawRoll) {
    if (!calibrationBaseline.isCalibrated) {
        return { pitch: rawPitch, yaw: rawYaw, roll: rawRoll };
    }
    
    return {
        pitch: rawPitch - calibrationBaseline.pitch,
        yaw: rawYaw - calibrationBaseline.yaw,
        roll: rawRoll - calibrationBaseline.roll
    };
}

// Update IMU data
function updateIMUData(rawPitch, rawYaw, rawRoll, accelX, accelY, accelZ) {
    // Unwrap Euler angles to avoid ±180/360 discontinuities
    const unwrappedPitch = unwrapAngle(rawPitch, lastUnwrappedAngles.pitch);
    const unwrappedYaw = unwrapAngle(rawYaw, lastUnwrappedAngles.yaw);
    const unwrappedRoll = unwrapAngle(rawRoll, lastUnwrappedAngles.roll);
    lastUnwrappedAngles = {
        pitch: unwrappedPitch,
        yaw: unwrappedYaw,
        roll: unwrappedRoll
    };

    // Apply calibration to get relative values
    const { pitch, yaw, roll } = applyCalibration(unwrappedPitch, unwrappedYaw, unwrappedRoll);
    
    // Update current orientation and acceleration
    currentOrientation = { pitch, yaw, roll };
    currentAcceleration = { x: accelX, y: accelY, z: accelZ };

    // Capture samples during zero-out window
    if (isZeroingOut) {
        zeroOutSamples.push({ pitch: unwrappedPitch, yaw: unwrappedYaw, roll: unwrappedRoll });
    }
    
    // Capture samples during calibration window (for standard deviation only)
    if (isCalibrating) {
        calibrationSamples.push({ pitch: unwrappedPitch, yaw: unwrappedYaw, roll: unwrappedRoll });
    }

    // Compute filtered pitch -> tilt using recursive low-pass filter (tilt now based on pitch)
    const tiltFiltered = tiltLowPassFilter.update(pitch);
    currentTiltFiltered = tiltFiltered;
    tiltBuffer.push(tiltFiltered);
    if (tiltBuffer.length > maxDataPoints) tiltBuffer.shift();
    chartData.tilt.push(tiltFiltered);
    if (chartData.tilt.length > maxDataPoints) chartData.tilt.shift();

    // Calculate tilt metric using peak/trough midpoint moving average
    const tiltMidlineAvg = tiltPeakMidline.update(tiltFiltered);
    
    // Use midpoint-based average if available, otherwise fall back to filtered value
    if (tiltMidlineAvg !== null) {
        currentTiltAvg = tiltMidlineAvg;
    } else {
        // Fallback: use simple moving average until enough midpoints are collected
        const recent = tiltBuffer.slice(-tiltWindow);
        currentTiltAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : tiltFiltered;
    }
    
    // Calculate standard deviation deviation from calibration baseline
    let tiltStdDevValue = 0;
    if (calibrationBaseline.isCalibrated && calibrationTiltStd > 0) {
        const sigma = Math.max(calibrationTiltStd, 0.5); // guard against tiny std
        // yaw is already baseline-zeroed via applyCalibration, so deviation is from 0
        const deviation = currentTiltAvg;
        tiltStdDevValue = deviation / sigma;
    }
    
    // Store standard deviation deviation for chart
    chartData.tiltStdDev.push(tiltStdDevValue);
    if (chartData.tiltStdDev.length > maxDataPoints) chartData.tiltStdDev.shift();
    
    const tiltEl = document.getElementById('tiltValue');
    if (tiltEl) tiltEl.innerHTML = `${currentTiltAvg.toFixed(1)} <span class="gait-metric-unit">°</span>`;
    
    // Haptic trigger: only post-calibration, when tilt exceeds 2σ from baseline
    if (calibrationBaseline.isCalibrated && calibrationTiltStd > 0) {
        const sigma = Math.max(calibrationTiltStd, 0.5); // guard against tiny std
        // yaw is already baseline-zeroed; compare to 0
        const tiltDeviation = Math.abs(currentTiltAvg);
        if (!hapticAlertActive && tiltDeviation > 2 * sigma) {
            const analysisStatusTextEl = document.getElementById('analysisStatusText');
            const prevAnalysisText = analysisStatusTextEl ? analysisStatusTextEl.textContent : '';
            sendHapticValue(1);
            hapticAlertActive = true;
            showStatus('Sent haptic a message (tilt alert)', 'connected');
            if (analysisStatusTextEl) {
                analysisStatusTextEl.textContent = 'Sent haptic a message';
            }
            hapticAlertTimer = setTimeout(() => {
                sendHapticValue(0);
                hapticAlertActive = false;
                showStatus('Calibrated - metrics zeroed', 'connected');
                if (analysisStatusTextEl) {
                    analysisStatusTextEl.textContent = prevAnalysisText || 'Analyzing...';
                }
            }, 5000);
        }
    }
    
    // Record data if recording is active
    if (isRecording) {
        recordDataPoint(pitch, yaw, roll, accelX, accelY, accelZ);
    }
    
    // Send data to analysis server if connected
    if (isAnalyzing) {
        sendToAnalysisServer(pitch, yaw, roll, accelX, accelY, accelZ);
    }
    
    // Update angle displays
    document.getElementById('pitchValue').textContent = `${pitch.toFixed(1)}°`;
    document.getElementById('yawValue').textContent = `${yaw.toFixed(1)}°`;
    document.getElementById('rollValue').textContent = `${roll.toFixed(1)}°`;
    
    // Update acceleration displays
    if (document.getElementById('accelXValue')) {
        document.getElementById('accelXValue').textContent = `${accelX.toFixed(2)} m/s²`;
    }
    if (document.getElementById('accelYValue')) {
        document.getElementById('accelYValue').textContent = `${accelY.toFixed(2)} m/s²`;
    }
    if (document.getElementById('accelZValue')) {
        document.getElementById('accelZValue').textContent = `${accelZ.toFixed(2)} m/s²`;
    }
    
    // Update chart data
    const timestamp = new Date().toLocaleTimeString();
    chartData.timestamps.push(timestamp);
    chartData.pitch.push(pitch);
    chartData.yaw.push(yaw);
    chartData.roll.push(roll);
    chartData.accelX.push(accelX);
    chartData.accelY.push(accelY);
    chartData.accelZ.push(accelZ);
    
    // Keep only last maxDataPoints
    if (chartData.timestamps.length > maxDataPoints) {
        chartData.timestamps.shift();
        chartData.pitch.shift();
        chartData.yaw.shift();
        chartData.roll.shift();
        chartData.accelX.shift();
        chartData.accelY.shift();
        chartData.accelZ.shift();
        chartData.tilt.shift();
        chartData.tiltStdDev.shift();
    }
    
    // Update visualizations
    updateCharts();
    if (orientationAvailable) {
        updateOrientationCanvas();
    }
}

// Initialize charts
let pitchChart, yawChart, rollChart, accelXChart, accelYChart, accelZChart, tiltChart, tiltStdDevChart;

function initializeCharts() {
    const chartConfig = (label, color, data) => {
        const isAccel = label.toLowerCase().includes('accel');
        const unit = isAccel ? ' m/s²' : '°';
        const yMin = isAccel ? -20 : -180;
        const yMax = isAccel ? 20 : 180;
        return {
            type: 'line',
            data: {
                labels: chartData.timestamps,
                datasets: [{
                    label: label,
                    data: data,
                    borderColor: color,
                    backgroundColor: color + '15',
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 0 },
                scales: {
                    y: {
                        beginAtZero: false,
                        suggestedMin: yMin,
                        suggestedMax: yMax,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#6b635c',
                            font: { size: 11, family: 'Inter' },
                            callback: function(value) {
                                return `${value}${unit}`;
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#6b635c',
                            font: { size: 10, family: 'Inter' },
                            maxRotation: 0,
                            minRotation: 0,
                            maxTicksLimit: 6
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                elements: {
                    point: { radius: 0 }
                }
            }
        };
    };
    
    pitchChart = new Chart(document.getElementById('pitchChart'), chartConfig('Pitch', '#ff3b5c', chartData.pitch));
    yawChart = new Chart(document.getElementById('yawChart'), chartConfig('Yaw', '#60efff', chartData.yaw));
    rollChart = new Chart(document.getElementById('rollChart'), chartConfig('Roll', '#ffd60a', chartData.roll));
    
    // Acceleration charts
    if (document.getElementById('accelXChart')) {
        accelXChart = new Chart(document.getElementById('accelXChart'), chartConfig('Accel X', '#ff3b5c', chartData.accelX));
    }
    if (document.getElementById('accelYChart')) {
        accelYChart = new Chart(document.getElementById('accelYChart'), chartConfig('Accel Y', '#60efff', chartData.accelY));
    }
    if (document.getElementById('accelZChart')) {
        accelZChart = new Chart(document.getElementById('accelZChart'), chartConfig('Accel Z', '#00ff87', chartData.accelZ));
    }
    if (document.getElementById('tiltChart')) {
        tiltChart = new Chart(document.getElementById('tiltChart'), chartConfig('Tilt (Yaw Filtered)', '#c27a43', chartData.tilt));
    }
    
    // Standard deviation deviation chart (special config with ±3σ range)
    if (document.getElementById('tiltStdDevChart')) {
        tiltStdDevChart = new Chart(document.getElementById('tiltStdDevChart'), {
            type: 'line',
            data: {
                labels: chartData.timestamps,
                datasets: [{
                    label: 'Tilt Std Dev',
                    data: chartData.tiltStdDev,
                    borderColor: '#ff6b6b',
                    backgroundColor: '#ff6b6b15',
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 0 },
                scales: {
                    y: {
                        beginAtZero: true,
                        suggestedMin: -3,
                        suggestedMax: 3,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#6b635c',
                            font: { size: 11, family: 'Inter' },
                            callback: function(value) {
                                return `${value}σ`;
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#6b635c',
                            font: { size: 10, family: 'Inter' },
                            maxRotation: 0,
                            minRotation: 0,
                            maxTicksLimit: 6
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                elements: {
                    point: { radius: 0 }
                }
            }
        });
    }
}

// Update charts
function updateCharts() {
    pitchChart.update('none');
    yawChart.update('none');
    rollChart.update('none');
    if (accelXChart) accelXChart.update('none');
    if (accelYChart) accelYChart.update('none');
    if (accelZChart) accelZChart.update('none');
    if (tiltChart) tiltChart.update('none');
    if (tiltStdDevChart) tiltStdDevChart.update('none');
}

// Recording Functions
function startRecording() {
    if (!isConnected) {
        showError('Please connect to ESP32 before recording');
        return;
    }
    if (isCalibrating || !calibrationBaseline.isCalibrated) {
        showError('Please complete calibration before recording');
        return;
    }
    if (isCalibrating) {
        showError('Finish calibration before recording');
        return;
    }
    
    // Reset calibration to zero from current position
    calibrationBaseline.isCalibrated = false;
    
    // Wait for next data packet to recalibrate
    // The next parseIMUData will auto-calibrate
    
    isRecording = true;
    recordedData = [];
    recordingStartTime = Date.now();
    
    updateRecordingUI();
    showStatus('Recording started - Recalibrating...', 'connecting');
    console.log('Recording started - will recalibrate on next data');
}

function stopRecording() {
    if (!isRecording) {
        return;
    }
    
    isRecording = false;
    updateRecordingUI();
    
    if (recordedData.length === 0) {
        showError('No data recorded');
        return;
    }
    
    // Generate and download CSV
    downloadCSV();
    console.log('Recording stopped. Data points:', recordedData.length);
}

function recordDataPoint(pitch, yaw, roll, accelX, accelY, accelZ) {
    const timestamp = new Date().toISOString(); // includes date, time, and milliseconds
    const dataPoint = {
        timestamp: timestamp,
        pitch: pitch,
        yaw: yaw,
        roll: roll,
        accelX: accelX,
        accelY: accelY,
        accelZ: accelZ,
        tilt: currentTiltAvg || currentTiltFiltered || 0,
        gait_speed: gaitMetrics.gait_speed || 0,
        cadence: gaitMetrics.cadence || 0,
        stride_count: gaitMetrics.stride_count || 0,
        total_strides: gaitMetrics.total_strides || 0
    };
    
    recordedData.push(dataPoint);
    
    // Update recording info
    if (document.getElementById('recordingInfo') && recordingStartTime) {
        const duration = ((Date.now() - recordingStartTime) / 1000).toFixed(1);
        document.getElementById('recordingInfo').textContent = 
            `Recording: ${recordedData.length} samples (${duration}s)`;
    }
}

function downloadCSV() {
    // Create CSV header - extended to include tilt and gait metrics
    let csv = 'Timestamp(ISO_ms),Pitch(deg),Yaw(deg),Roll(deg),AccelX(m/s²),AccelY(m/s²),AccelZ(m/s²),Tilt(deg),GaitSpeed(m/s),Cadence(steps/min),StrideCount,TotalStrides\n';
    
    // Add data rows
    recordedData.forEach(point => {
        csv += `${point.timestamp},${point.pitch.toFixed(3)},${point.yaw.toFixed(3)},${point.roll.toFixed(3)},${point.accelX.toFixed(3)},${point.accelY.toFixed(3)},${point.accelZ.toFixed(3)},${(point.tilt || 0).toFixed(3)},${(point.gait_speed || 0).toFixed(3)},${(point.cadence || 0).toFixed(3)},${point.stride_count || 0},${point.total_strides || 0}\n`;
    });
    
    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename with timestamp
    const date = new Date();
    const filename = `imu_data_${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}_${date.getHours().toString().padStart(2,'0')}${date.getMinutes().toString().padStart(2,'0')}.csv`;
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    console.log(`Downloaded ${filename}`);
}

function updateRecordingUI() {
    const startBtn = document.getElementById('startRecordBtn');
    const stopBtn = document.getElementById('stopRecordBtn');
    const recordingInfo = document.getElementById('recordingInfo');
    
    const allowRecord = isConnected && !isCalibrating && !isZeroingOut && calibrationBaseline.isCalibrated;
    
    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        startBtn.classList.add('btn-disabled');
        stopBtn.classList.remove('btn-disabled');
        recordingInfo.style.display = 'block';
        recordingInfo.textContent = 'Recording: 0 samples (0.0s)';
    } else {
        startBtn.disabled = !allowRecord;
        stopBtn.disabled = true;
        startBtn.classList.toggle('btn-disabled', !allowRecord);
        stopBtn.classList.add('btn-disabled');
        recordingInfo.style.display = 'none';
    }
}

function updateCalibrationUI() {
    const zeroOutBtn = document.getElementById('zeroOutBtn');
    const calibrateBtn = document.getElementById('calibrateBtn');
    const statusEl = document.getElementById('calibrationStatus');
    
    // Zero out button: enabled when connected and not currently zeroing/calibrating
    if (zeroOutBtn) {
        zeroOutBtn.disabled = !isConnected || isZeroingOut || isCalibrating;
        zeroOutBtn.classList.toggle('btn-disabled', !isConnected || isZeroingOut || isCalibrating);
    }
    
    // Calibrate button: enabled when connected, baseline is set, and not currently calibrating/zeroing
    calibrateBtn.disabled = !isConnected || !calibrationBaseline.isCalibrated || isCalibrating || isZeroingOut;
    calibrateBtn.classList.toggle('btn-disabled', !isConnected || !calibrationBaseline.isCalibrated || isCalibrating || isZeroingOut);
    
    // Hide calibration status bar to avoid redundant messaging
    if (statusEl) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
    }
}

function updateControlUI() {
    const btn = document.getElementById('controlSwitchBtn');
    if (!btn) return;
    // Haptic connect is allowed anytime (not gated by ESP32/calibration)
    btn.disabled = false;
    btn.classList.remove('btn-disabled');
    btn.classList.add('btn-switch');
    btn.innerHTML = `<span class="btn-icon">⏻</span> Haptic service: ${hapticConnected ? 'Connected' : 'Connect'}`;
}

// Update connection UI
function updateConnectionUI() {
    const connectBtn = document.getElementById('connectBtn');
    if (isConnected) {
        connectBtn.innerHTML = '<span class="btn-icon">🔴</span> Disconnect';
        connectBtn.classList.add('btn-danger');
        connectBtn.classList.remove('btn-primary');
    } else {
        connectBtn.innerHTML = '<span class="btn-icon">🔵</span> Connect to ESP32';
        connectBtn.classList.add('btn-primary');
        connectBtn.classList.remove('btn-danger');
    }
    
    // Update recording buttons when connection changes
    updateRecordingUI();
    
    // Update analysis button when connection changes
    updateAnalysisUI();
    
    // Update calibration controls
    updateCalibrationUI();
    
    // Update control switch
    updateControlUI();
    
    // Maintain tab state visuals (no-op here unless we add more logic later)
}

// Update analysis UI based on connection status
function updateAnalysisUI() {
    const allowAnalyze = isConnected && calibrationBaseline.isCalibrated && !isCalibrating && !isZeroingOut;
    if (!allowAnalyze && isAnalyzing) {
        stopRealtimeAnalysis();
    }
}

// Initialize orientation canvas
let orientationCanvas, orientationCtx;
let orientationAvailable = false;

function initializeOrientationCanvas() {
    orientationCanvas = document.getElementById('orientationCanvas');
    if (!orientationCanvas) {
        orientationAvailable = false;
        return;
    }
    orientationCtx = orientationCanvas.getContext('2d');
    orientationAvailable = true;
    
    // Set canvas size
    const container = orientationCanvas.parentElement;
    orientationCanvas.width = container.clientWidth;
    orientationCanvas.height = 300;
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (!orientationAvailable) return;
        orientationCanvas.width = container.clientWidth;
        orientationCanvas.height = 300;
        updateOrientationCanvas();
    });
    
    // Initial draw
    updateOrientationCanvas();
}

// Update orientation canvas
function updateOrientationCanvas() {
    if (!orientationAvailable || !orientationCanvas || !orientationCtx) return;
    const ctx = orientationCtx;
    const width = orientationCanvas.width;
    const height = orientationCanvas.height;
    
    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Draw subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }
    
    // Calculate center
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Convert degrees to radians
    const pitch = currentOrientation.pitch * Math.PI / 180;
    const yaw = currentOrientation.yaw * Math.PI / 180;
    const roll = currentOrientation.roll * Math.PI / 180;
    
    // Draw 3D box representation
    drawIMUBox(ctx, centerX, centerY, pitch, yaw, roll);
}

// Draw IMU box representation
function drawIMUBox(ctx, centerX, centerY, pitch, yaw, roll) {
    const size = 80;
    
    // Define box vertices
    const vertices = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // Back face
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]      // Front face
    ];
    
    // Apply rotations and project to 2D
    const projected = vertices.map(v => {
        // Apply rotations
        let [x, y, z] = v;
        
        // Rotate around X axis (pitch)
        let y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
        let z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
        y = y1;
        z = z1;
        
        // Rotate around Y axis (yaw)
        let x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
        z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
        x = x1;
        z = z1;
        
        // Rotate around Z axis (roll)
        x1 = x * Math.cos(roll) - y * Math.sin(roll);
        y1 = x * Math.sin(roll) + y * Math.cos(roll);
        x = x1;
        y = y1;
        
        // Project to 2D
        const scale = 200 / (3 + z);
        return {
            x: centerX + x * size * scale,
            y: centerY - y * size * scale,
            z: z
        };
    });
    
    // Define edges
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0], // Back face
        [4, 5], [5, 6], [6, 7], [7, 4], // Front face
        [0, 4], [1, 5], [2, 6], [3, 7]  // Connecting edges
    ];
    
    // Draw edges
    edges.forEach(([i, j]) => {
        const p1 = projected[i];
        const p2 = projected[j];
        
        // Color based on depth
        const avgZ = (p1.z + p2.z) / 2;
        const brightness = Math.floor(128 + avgZ * 60);
        
        ctx.strokeStyle = `rgb(${brightness}, ${brightness}, ${brightness + 50})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    });
    
    // Draw vertices with glow effect
    projected.forEach((p, i) => {
        const isFront = i >= 4;
        const color = isFront ? '#00ff87' : '#ff3b5c';
        
        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.shadowBlur = 0;
    });
    
    // Draw axis indicators
    drawAxisIndicators(ctx, centerX, centerY + 120);
}

// Draw axis indicators
function drawAxisIndicators(ctx, x, y) {
    const length = 40;
    const pitch = currentOrientation.pitch * Math.PI / 180;
    const yaw = currentOrientation.yaw * Math.PI / 180;
    const roll = currentOrientation.roll * Math.PI / 180;
    
    // X axis (red) - pitch
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const xEnd = rotatePoint(length, 0, pitch, roll);
    ctx.lineTo(x + xEnd.x, y - xEnd.y);
    ctx.stroke();
    ctx.fillStyle = '#FF6B6B';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('X', x + xEnd.x + 10, y - xEnd.y);
    
    // Y axis (green) - yaw
    ctx.strokeStyle = '#4ECDC4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const yEnd = rotatePoint(0, length, yaw, roll);
    ctx.lineTo(x + yEnd.x, y - yEnd.y);
    ctx.stroke();
    ctx.fillStyle = '#4ECDC4';
    ctx.fillText('Y', x + yEnd.x + 10, y - yEnd.y);
    
    // Z axis (yellow) - roll
    ctx.strokeStyle = '#FFE66D';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const zEnd = { x: 0, y: -length };
    ctx.lineTo(x + zEnd.x, y - zEnd.y);
    ctx.stroke();
    ctx.fillStyle = '#FFE66D';
    ctx.fillText('Z', x + zEnd.x + 10, y - zEnd.y);
}

// Helper function to rotate a point
function rotatePoint(x, y, angleX, angleZ) {
    // Rotate around X
    let y1 = y * Math.cos(angleX);
    
    // Rotate around Z
    let x1 = x * Math.cos(angleZ) - y1 * Math.sin(angleZ);
    let y2 = x * Math.sin(angleZ) + y1 * Math.cos(angleZ);
    
    return { x: x1, y: y2 };
}

// ====================================================================================
// REAL-TIME GAIT ANALYSIS (WebSocket)
// ====================================================================================

// WebSocket configuration
// Dev override: use localhost when running locally, Render when deployed
const WS_URL = window.location.hostname === 'localhost'
  ? 'ws://localhost:8000'
  : 'https://imu-gait-analyzer.onrender.com';

// WebSocket state
let websocket = null;
let isAnalyzing = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Gait metrics
let gaitMetrics = {
    gait_speed: 0.0,
    cadence: 0.0,
    stride_count: 0
};

// UI Elements
const analysisStatus = document.getElementById('analysisStatus');
const analysisStatusText = document.getElementById('analysisStatusText');
const gaitMetricsGrid = document.getElementById('gaitMetricsGrid');
const gaitSpeedValue = document.getElementById('gaitSpeedValue');
const cadenceValue = document.getElementById('cadenceValue');
const totalStridesValue = document.getElementById('totalStridesValue');
const bufferStridesValue = document.getElementById('bufferStridesValue');
const tabRawBtn = document.getElementById('tabRaw');
const tabDerivedBtn = document.getElementById('tabDerived');
const tabRawContent = document.getElementById('tabRawContent');
const tabDerivedContent = document.getElementById('tabDerivedContent');

// Tab switching
function switchTab(target) {
    const isRaw = target === 'raw';
    tabRawBtn.classList.toggle('active', isRaw);
    tabDerivedBtn.classList.toggle('active', !isRaw);
    tabRawContent.classList.toggle('active', isRaw);
    tabDerivedContent.classList.toggle('active', !isRaw);
}

// Start real-time analysis (auto-run after calibration)
function startRealtimeAnalysis() {
    if (!isConnected) {
        showError('Please connect to ESP32 first');
        return;
    }
    if (isCalibrating || !calibrationBaseline.isCalibrated) {
        showError('Please complete calibration before starting analysis');
        return;
    }
    
    if (isAnalyzing) return;
    
    try {
        // Connect to WebSocket server
        websocket = new WebSocket(WS_URL);
        
        websocket.onopen = () => {
            console.log('✅ Connected to analysis server');
            isAnalyzing = true;
            reconnectAttempts = 0;
            
            // Update UI
            analysisStatus.style.display = 'flex';
            analysisStatusText.textContent = 'Analyzing gait...';
            gaitMetricsGrid.style.display = 'grid';
        };
        
        websocket.onmessage = (event) => {
            try {
                const metrics = JSON.parse(event.data);
                updateGaitMetrics(metrics);
            } catch (error) {
                console.error('Error parsing metrics:', error);
            }
        };
        
        websocket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            showError('Error connecting to analysis server. Ensure backend is running.');
        };
        
        websocket.onclose = () => {
            console.log('🔌 WebSocket closed');
            
            if (isAnalyzing && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔄 Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(() => startRealtimeAnalysis(), 2000);
            } else {
                stopRealtimeAnalysis();
            }
        };
        
    } catch (error) {
        console.error('Error starting analysis:', error);
        showError('Failed to start analysis: ' + error.message);
    }
}

// Stop real-time analysis
function stopRealtimeAnalysis() {
    if (websocket) {
        websocket.close();
        websocket = null;
    }
    
    isAnalyzing = false;
    
    // Update UI
    analysisStatus.style.display = 'none';
    gaitMetricsGrid.style.display = 'none';
    
    console.log('⏹️  Real-time analysis stopped');
}

// Update gait metrics display
function updateGaitMetrics(metrics) {
    gaitMetrics = metrics;
    
    // Update UI
    gaitSpeedValue.innerHTML = `${metrics.gait_speed.toFixed(2)} <span class="gait-metric-unit">m/s</span>`;
    cadenceValue.innerHTML = `${metrics.cadence.toFixed(1)} <span class="gait-metric-unit">steps/min</span>`;
    totalStridesValue.textContent = metrics.total_strides || 0;
    bufferStridesValue.textContent = metrics.stride_count;
    const strideCountEl = document.getElementById('strideCountValue');
    if (strideCountEl) strideCountEl.textContent = metrics.stride_count || 0;
    
    // Update status text
    const usingHeadGait = metrics.using_headgait ? '🧠 HeadGait Models' : '⚡ Fallback Algorithm';
    analysisStatusText.textContent = `${usingHeadGait} | Buffer: ${metrics.buffer_size} samples`;
    
    // Log metrics periodically
    if (metrics.status === 'analyzing' || metrics.status === 'analyzing_simple') {
        console.log(`📊 Speed: ${metrics.gait_speed} m/s | Cadence: ${metrics.cadence} steps/min | Strides: ${metrics.stride_count}`);
    }
}

// Send IMU data to analysis server
function sendToAnalysisServer(pitch, yaw, roll, accelX, accelY, accelZ) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        const data = {
            pitch: pitch,
            yaw: yaw,
            roll: roll,
            accelX: accelX,
            accelY: accelY,
            accelZ: accelZ,
            timestamp: Date.now()
        };
        
        try {
            websocket.send(JSON.stringify(data));
        } catch (error) {
            console.error('Error sending data to server:', error);
        }
    }
}

// Placeholder: send "ON" or "OFF" to ESP32-C3 control characteristic over BLE
async function sendControlCommand(state) {
    if (!isConnected || !bleServer) {
        showError('Connect to ESP32 before sending control commands');
        return;
    }
    const upper = String(state || '').toUpperCase();
    if (upper !== 'ON' && upper !== 'OFF') {
        showError('Control command must be "ON" or "OFF"');
        return;
    }
    try {
        const controlService = await bleServer.getPrimaryService(CONTROL_SERVICE_UUID);
        const controlChar = await controlService.getCharacteristic(CONTROL_CHAR_UUID);
        await controlChar.writeValue(new TextEncoder().encode(upper));
        console.log(`✅ Sent control command: ${upper}`);
    } catch (err) {
        console.error('❌ Failed to send control command:', err);
        showError('Failed to send control command');
    }
}

// Control switch: send 1/0 as binary to CONTROL characteristic
async function connectHapticService() {
    try {
        showStatus('Connecting to Haptic service...', 'connecting');
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [CONTROL_SERVICE_UUID] }],
            optionalServices: [CONTROL_SERVICE_UUID]
        });
        const server = await device.gatt.connect();
        const svc = await server.getPrimaryService(CONTROL_SERVICE_UUID);
        hapticChar = await svc.getCharacteristic(CONTROL_CHAR_UUID);
        hapticConnected = true;
        showStatus('Haptic service connected', 'connected');
        updateControlUI();
    } catch (err) {
        console.error('❌ Failed to connect haptic service:', err);
        showError('Failed to connect haptic service');
        hapticConnected = false;
        hapticChar = null;
        updateControlUI();
    }
}

async function sendHapticValue(val) {
    if (!hapticConnected || !hapticChar) return;
    try {
        const payload = new Uint8Array([val]);
        await hapticChar.writeValue(payload);
        console.log(`✅ Sent haptic value: ${val}`);
    } catch (err) {
        console.error('❌ Failed to send haptic value:', err);
        // Suppress UI error for haptic failures; just log
    }
}

// Zero Out IMU: Quick baseline calibration with low-pass filter
function zeroOutIMU() {
    if (!isConnected) {
        showError('Please connect to ESP32 before zeroing out');
        return;
    }
    if (isZeroingOut || isCalibrating) return;
    
    // Reset state
    zeroOutSamples = [];
    isZeroingOut = true;
    updateCalibrationUI();
    showStatus('Zeroing out IMU... Please hold still for 3 seconds', 'connecting');
    console.log('Zero out started: collecting 3s of baseline orientation');
    
    // Collect samples for 3 seconds
    const zeroOutTimer = setTimeout(() => {
        if (isZeroingOut) {
            finalizeZeroOut();
        }
    }, 3000);
    
    // Store timer reference for cleanup if needed
    window.zeroOutTimer = zeroOutTimer;
}

function finalizeZeroOut() {
    isZeroingOut = false;
    if (window.zeroOutTimer) {
        clearTimeout(window.zeroOutTimer);
        window.zeroOutTimer = null;
    }
    
    if (!zeroOutSamples.length) {
        showError('Zero out failed: no samples collected');
        updateCalibrationUI();
        updateRecordingUI();
        updateAnalysisUI();
        return;
    }
    
    // Apply Butterworth filter to zero-out data to remove outliers
    const pitchValues = zeroOutSamples.map(s => s.pitch);
    const yawValues = zeroOutSamples.map(s => s.yaw);
    const rollValues = zeroOutSamples.map(s => s.roll);
    
    const filteredPitch = applyButterworthToArray(pitchValues);
    const filteredYaw = applyButterworthToArray(yawValues);
    const filteredRoll = applyButterworthToArray(rollValues);
    
    // Calculate baseline from filtered data
    const avg = (arr) => arr.reduce((sum, v) => sum + v, 0) / arr.length;
    calibrationBaseline = {
        pitch: avg(filteredPitch),
        yaw: avg(filteredYaw),
        roll: avg(filteredRoll),
        isCalibrated: true
    };

    // Reset tilt std-dev and buffers when zeroing out
    calibrationTiltStd = 0;
    chartData.tiltStdDev = [];
    currentTiltFiltered = 0;
    currentTiltAvg = 0;
    tiltBuffer.length = 0;
    tiltPeakMidline.buffer = [];
    tiltPeakMidline.midpoints = [];
    tiltPeakMidline.lastExtreme = null;
    if (document.getElementById('tiltValue')) {
        document.getElementById('tiltValue').innerHTML = `0.0 <span class="gait-metric-unit">°</span>`;
    }
    
    // Reset low-pass filter state for fresh start after zero-out
    tiltLowPassFilter.smoothedValue = null;
    // Reset peak/trough midline state
    tiltPeakMidline.buffer = [];
    tiltPeakMidline.midpoints = [];
    tiltPeakMidline.lastExtreme = null;
    
    // Reset previous orientation timing
    previousOrientation = { pitch: 0, yaw: 0, roll: 0, timestamp: Date.now() };
    
    showStatus('IMU zeroed - baseline set', 'connected');
    console.log('Zero out baseline set:', calibrationBaseline);
    
    // Update UI after setting isCalibrated = true
    updateCalibrationUI();
    updateRecordingUI();
    updateAnalysisUI();
    updateControlUI();
}

// Calibration flow: 10-second data collection for standard deviation calculation
function startCalibration() {
    if (!isConnected) {
        showError('Please connect to ESP32 before calibrating');
        return;
    }
    if (!calibrationBaseline.isCalibrated) {
        showError('Please zero out IMU first before calibrating');
        return;
    }
    if (isCalibrating || isZeroingOut) return;
    
    // Reset state
    calibrationSamples = [];
    calibrationTiltStd = 0; // reset std baseline for new calibration
    calibrationCountdown = 10;
    isCalibrating = true;
    updateCalibrationUI();
    showStatus(`Calibrating... ${calibrationCountdown}s remaining`, 'connecting');
    console.log('Calibration started: collecting 10s of data for standard deviation');
    
    calibrationTimer = setInterval(() => {
        calibrationCountdown -= 1;
        updateCalibrationUI();
        if (calibrationCountdown > 0) {
            showStatus(`Calibrating... ${calibrationCountdown}s remaining. Please look straight ahead and beging running at a comforable pace.`, 'connecting');
        }
        if (calibrationCountdown <= 0) {
            finalizeCalibration();
        }
    }, 1000);
    
    // Safety timeout to ensure finalize runs
    setTimeout(() => {
        if (isCalibrating) finalizeCalibration();
    }, 10500);
}

function finalizeCalibration() {
    if (calibrationTimer) {
        clearInterval(calibrationTimer);
        calibrationTimer = null;
    }
    isCalibrating = false;
    updateCalibrationUI();
    
    if (!calibrationSamples.length) {
        showError('Calibration failed: no samples collected');
        updateRecordingUI();
        updateAnalysisUI();
        return;
    }
    
    // Apply Butterworth filter to calibration data to remove outliers
    const pitchValues = calibrationSamples.map(s => s.pitch);
    const yawValues = calibrationSamples.map(s => s.yaw);
    const rollValues = calibrationSamples.map(s => s.roll);
    
    const filteredPitch = applyButterworthToArray(pitchValues);
    const filteredYaw = applyButterworthToArray(yawValues);
    const filteredRoll = applyButterworthToArray(rollValues);
    
    // Calculate standard deviation from filtered pitch data (tilt now based on pitch)
    const avg = (arr) => arr.reduce((sum, v) => sum + v, 0) / arr.length;
    const meanPitch = avg(filteredPitch);
    
    const std = (arr, mean) => {
        const n = arr.length || 1;
        const s = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
        return Math.sqrt(s / n);
    };
    calibrationTiltStd = std(filteredPitch, meanPitch);
    
    if (hapticAlertTimer) {
        clearTimeout(hapticAlertTimer);
        hapticAlertTimer = null;
    }
    hapticAlertActive = false;
    
    showStatus('Calibration complete - standard deviation calculated', 'connected');
    console.log('Calibration standard deviation set:', calibrationTiltStd);

    // Enable recording and analysis now that calibration is done
    updateRecordingUI();
    updateAnalysisUI();
    updateControlUI();
    startRealtimeAnalysis(); // Auto-start analysis after calibration
}
