// BLE Configuration
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Alternate ESP32 service (e.g., Nordic UART-style) — lowercase per Web Bluetooth requirements
const ALT_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
// Nordic UART characteristics (notify = TX, write = RX)
const ALT_NOTIFY_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const ALT_WRITE_CHAR_UUID  = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

// Placeholder control service/characteristic for ON/OFF messaging
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    initializeCharts();
    initializeOrientationCanvas();
    checkBluetoothSupport();
    
    // Display calibration message
    showStatus('Ready - will calibrate on first data', 'disconnected');
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
    
    // Initially disable recording buttons
    updateRecordingUI();
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
        
        isConnected = true;
        updateConnectionUI();
        showStatus('Connected - Waiting for data...', 'connected');
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
        
        isConnected = false;
        updateConnectionUI();
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
    showError('Device disconnected unexpectedly');
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
                
                // Auto-calibrate on first data received
                if (!calibrationBaseline.isCalibrated) {
                    calibrateZero(pitch, yaw, roll);
                }
                
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
    showStatus('Calibrated - Metrics zeroed', 'connected');
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
    // Apply calibration to get relative values
    const { pitch, yaw, roll } = applyCalibration(rawPitch, rawYaw, rawRoll);
    
    // Update current orientation and acceleration
    currentOrientation = { pitch, yaw, roll };
    currentAcceleration = { x: accelX, y: accelY, z: accelZ };
    
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
    }
    
    // Update visualizations
    updateCharts();
    updateOrientationCanvas();
}

// Initialize charts
let pitchChart, yawChart, rollChart, accelXChart, accelYChart, accelZChart;

function initializeCharts() {
    const chartConfig = (label, color, data) => {
        const isAccel = label.toLowerCase().includes('accel');
        const unit = isAccel ? ' m/s²' : '°';
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
                        grace: '10%',
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
}

// Update charts
function updateCharts() {
    pitchChart.update('none');
    yawChart.update('none');
    rollChart.update('none');
    if (accelXChart) accelXChart.update('none');
    if (accelYChart) accelYChart.update('none');
    if (accelZChart) accelZChart.update('none');
}

// Recording Functions
function startRecording() {
    if (!isConnected) {
        showError('Please connect to ESP32 before recording');
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
    const timestamp = Date.now() - recordingStartTime;
    const dataPoint = {
        timestamp: timestamp,
        pitch: pitch,
        yaw: yaw,
        roll: roll,
        accelX: accelX,
        accelY: accelY,
        accelZ: accelZ
    };
    
    recordedData.push(dataPoint);
    
    // Update recording info
    if (document.getElementById('recordingInfo')) {
        const duration = (timestamp / 1000).toFixed(1);
        document.getElementById('recordingInfo').textContent = 
            `Recording: ${recordedData.length} samples (${duration}s)`;
    }
}

function downloadCSV() {
    // Create CSV header - HeadGait compatible format
    let csv = 'Timestamp(ms),Pitch(deg),Yaw(deg),Roll(deg),AccelX(m/s²),AccelY(m/s²),AccelZ(m/s²)\n';
    
    // Add data rows
    recordedData.forEach(point => {
        csv += `${point.timestamp},${point.pitch.toFixed(3)},${point.yaw.toFixed(3)},${point.roll.toFixed(3)},${point.accelX.toFixed(3)},${point.accelY.toFixed(3)},${point.accelZ.toFixed(3)}\n`;
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
    
    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        startBtn.classList.add('btn-disabled');
        stopBtn.classList.remove('btn-disabled');
        recordingInfo.style.display = 'block';
        recordingInfo.textContent = 'Recording: 0 samples (0.0s)';
    } else {
        startBtn.disabled = !isConnected;
        stopBtn.disabled = true;
        startBtn.classList.toggle('btn-disabled', !isConnected);
        stopBtn.classList.add('btn-disabled');
        recordingInfo.style.display = 'none';
    }
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
}

// Update analysis UI based on connection status
function updateAnalysisUI() {
    if (isConnected) {
        toggleAnalysisBtn.disabled = false;
        toggleAnalysisBtn.classList.remove('btn-disabled');
    } else {
        toggleAnalysisBtn.disabled = true;
        toggleAnalysisBtn.classList.add('btn-disabled');
        
        // Stop analysis if running
        if (isAnalyzing) {
            stopRealtimeAnalysis();
        }
    }
}

// Initialize orientation canvas
let orientationCanvas, orientationCtx;

function initializeOrientationCanvas() {
    orientationCanvas = document.getElementById('orientationCanvas');
    orientationCtx = orientationCanvas.getContext('2d');
    
    // Set canvas size
    const container = orientationCanvas.parentElement;
    orientationCanvas.width = container.clientWidth;
    orientationCanvas.height = 300;
    
    // Handle window resize
    window.addEventListener('resize', () => {
        orientationCanvas.width = container.clientWidth;
        orientationCanvas.height = 300;
        updateOrientationCanvas();
    });
    
    // Initial draw
    updateOrientationCanvas();
}

// Update orientation canvas
function updateOrientationCanvas() {
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
const toggleAnalysisBtn = document.getElementById('toggleAnalysisBtn');
const analysisStatus = document.getElementById('analysisStatus');
const analysisStatusText = document.getElementById('analysisStatusText');
const gaitMetricsGrid = document.getElementById('gaitMetricsGrid');
const gaitSpeedValue = document.getElementById('gaitSpeedValue');
const cadenceValue = document.getElementById('cadenceValue');
const totalStridesValue = document.getElementById('totalStridesValue');
const bufferStridesValue = document.getElementById('bufferStridesValue');

// Event listeners
toggleAnalysisBtn.addEventListener('click', toggleRealtimeAnalysis);

// Toggle real-time analysis
function toggleRealtimeAnalysis() {
    if (isAnalyzing) {
        stopRealtimeAnalysis();
    } else {
        startRealtimeAnalysis();
    }
}

// Start real-time analysis
function startRealtimeAnalysis() {
    if (!isConnected) {
        showError('Please connect to ESP32 first');
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
            toggleAnalysisBtn.textContent = 'Stop Analysis';
            toggleAnalysisBtn.classList.add('active');
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
    toggleAnalysisBtn.textContent = 'Start Real-time Analysis';
    toggleAnalysisBtn.classList.remove('active');
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
