// BLE Configuration
const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Global variables
let bleDevice = null;
let bleCharacteristic = null;
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
    acceleration: [],
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

// Current acceleration value
let currentAcceleration = 0;

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
        
        // Request device - show devices with "XIAO" or specific name in name OR with matching service
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'a_XIAO' },
                { namePrefix: 'XIAO' },
                { services: [SERVICE_UUID] }
            ],
            optionalServices: [SERVICE_UUID]
        });
        
        console.log('Device selected:', bleDevice.name);

        // Connect to GATT server
        console.log('Connecting to GATT server...');
        const server = await bleDevice.gatt.connect();
        console.log('Connected to GATT server');
        
        // Get service
        console.log('Getting primary service...');
        const service = await server.getPrimaryService(SERVICE_UUID);
        console.log('Service obtained');
        
        // Get characteristic
        console.log('Getting characteristic...');
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
        
        // Check if we have at least 6 values (yaw, pitch, roll, accelX, accelY, accelZ)
        if (values.length >= 6) {
            const yaw = parseFloat(values[0]);
            const pitch = parseFloat(values[1]);
            const roll = parseFloat(values[2]);
            const accelX = parseFloat(values[3]);
            const accelY = parseFloat(values[4]);
            const accelZ = parseFloat(values[5]);
            
            if (!isNaN(pitch) && !isNaN(yaw) && !isNaN(roll)) {
                // Store raw acceleration data for HeadGait-compatible export
                rawSensorData = { accelX, accelY, accelZ };
                
                // Auto-calibrate on first data received
                if (!calibrationBaseline.isCalibrated) {
                    calibrateZero(pitch, yaw, roll);
                }
                
                // Update with orientation data
                updateIMUData(pitch, yaw, roll);
            }
        }
    } catch (error) {
        console.error('Error parsing IMU data:', error);
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
function updateIMUData(rawPitch, rawYaw, rawRoll) {
    // Apply calibration to get relative values
    const { pitch, yaw, roll } = applyCalibration(rawPitch, rawYaw, rawRoll);
    
    // Calculate acceleration from orientation change
    const acceleration = calculateAcceleration(pitch, yaw, roll);
    
    // Update current orientation
    currentOrientation = { pitch, yaw, roll };
    currentAcceleration = acceleration;
    
    // Record data if recording is active
    if (isRecording) {
        recordDataPoint(pitch, yaw, roll, acceleration);
    }
    
    // Update angle displays
    document.getElementById('pitchValue').textContent = `${pitch.toFixed(1)}°`;
    document.getElementById('yawValue').textContent = `${yaw.toFixed(1)}°`;
    document.getElementById('rollValue').textContent = `${roll.toFixed(1)}°`;
    
    // Update acceleration display
    if (document.getElementById('accelValue')) {
        document.getElementById('accelValue').textContent = `${acceleration.toFixed(2)} °/s`;
    }
    
    // Update chart data
    const timestamp = new Date().toLocaleTimeString();
    chartData.timestamps.push(timestamp);
    chartData.pitch.push(pitch);
    chartData.yaw.push(yaw);
    chartData.roll.push(roll);
    chartData.acceleration.push(acceleration);
    
    // Keep only last maxDataPoints
    if (chartData.timestamps.length > maxDataPoints) {
        chartData.timestamps.shift();
        chartData.pitch.shift();
        chartData.yaw.shift();
        chartData.roll.shift();
        chartData.acceleration.shift();
    }
    
    // Update visualizations
    updateCharts();
    updateOrientationCanvas();
}

// Initialize charts
let pitchChart, yawChart, rollChart, accelerationChart;

function initializeCharts() {
    const chartConfig = (label, color, data) => ({
        type: 'line',
        data: {
            labels: chartData.timestamps,
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: color + '15',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: {
                duration: 0
            },
            scales: {
                y: {
                    beginAtZero: false,
                    suggestedMin: -180,
                    suggestedMax: 180,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            size: 11,
                            family: 'Inter'
                        },
                        callback: function(value) {
                            return value + '°';
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            size: 10,
                            family: 'Inter'
                        },
                        maxRotation: 0,
                        minRotation: 0,
                        maxTicksLimit: 6
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            }
        }
    });
    
    pitchChart = new Chart(document.getElementById('pitchChart'), chartConfig('Pitch', '#ff3b5c', chartData.pitch));
    yawChart = new Chart(document.getElementById('yawChart'), chartConfig('Yaw', '#60efff', chartData.yaw));
    rollChart = new Chart(document.getElementById('rollChart'), chartConfig('Roll', '#ffd60a', chartData.roll));
    
    // Acceleration chart (motion intensity)
    if (document.getElementById('accelerationChart')) {
        accelerationChart = new Chart(document.getElementById('accelerationChart'), {
            type: 'line',
            data: {
                labels: chartData.timestamps,
                datasets: [{
                    label: 'Motion Intensity',
                    data: chartData.acceleration,
                    borderColor: '#00ff87',
                    backgroundColor: '#00ff8715',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: {
                    duration: 0
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#666',
                            font: {
                                size: 11,
                                family: 'Inter'
                            },
                            callback: function(value) {
                                return value.toFixed(0);
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#666',
                            font: {
                                size: 10,
                                family: 'Inter'
                            },
                            maxRotation: 0,
                            minRotation: 0,
                            maxTicksLimit: 6
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
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
    if (accelerationChart) {
        accelerationChart.update('none');
    }
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

function recordDataPoint(pitch, yaw, roll, acceleration) {
    const timestamp = Date.now() - recordingStartTime;
    const dataPoint = {
        timestamp: timestamp,
        pitch: pitch,
        yaw: yaw,
        roll: roll,
        acceleration: acceleration,
        // Include raw sensor data for HeadGait processing
        accelX: rawSensorData.accelX,
        accelY: rawSensorData.accelY,
        accelZ: rawSensorData.accelZ
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
    let csv = 'Timestamp(ms),Pitch(degrees),Yaw(degrees),Roll(degrees),Acceleration(deg/s),AccelX(m/s²),AccelY(m/s²),AccelZ(m/s²)\n';
    
    // Add data rows
    recordedData.forEach(point => {
        csv += `${point.timestamp},${point.pitch.toFixed(3)},${point.yaw.toFixed(3)},${point.roll.toFixed(3)},${point.acceleration.toFixed(3)},${point.accelX.toFixed(3)},${point.accelY.toFixed(3)},${point.accelZ.toFixed(3)}\n`;
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

