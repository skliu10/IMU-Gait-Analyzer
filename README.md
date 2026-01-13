# IMU BLE Visualizer

A web application that receives IMU orientation data (pitch, yaw, roll) via Bluetooth Low Energy from an ESP32-C3 microcontroller connected to an Adafruit IMU sensor.

## Features

- 🔵 **Bluetooth Low Energy Connection** - Connect directly from your web browser
- 📊 **Real-time Charts** - Live plotting of pitch, yaw, and roll angles
- 🎯 **3D Orientation Visualization** - Visual representation of device orientation
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🎨 **Modern UI** - Clean, intuitive interface

## Requirements

### Hardware
- ESP32-C3 microcontroller
- Adafruit IMU sensor (e.g., BNO055, MPU6050, LSM9DS1)
- USB cable for programming ESP32

### Software
- Modern web browser with Web Bluetooth API support:
  - Chrome/Edge (v56+)
  - Opera (v43+)
  - Chrome Android (v56+)
  - **Note:** Firefox and Safari have limited/no Web Bluetooth support

## Setup Instructions

### 1. ESP32-C3 Setup

Your ESP32-C3 should be programmed to:
1. Read orientation data from the IMU sensor
2. Create a BLE service with a characteristic that sends pitch, yaw, roll data
3. Format data as comma-separated values: `pitch,yaw,roll\n`

**Example BLE Service Configuration:**
- Service UUID: `4fafc201-1fb5-459e-8fcc-c5c9c331914b` (or use standard)
- Characteristic UUID: `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- Properties: Notify

**Example Arduino Code Structure:**
```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Adafruit_Sensor.h>
// Include your IMU library here

// Service and Characteristic UUIDs (must match web app)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLECharacteristic *pCharacteristic;

void setup() {
  // Initialize IMU
  // Initialize BLE
  BLEDevice::init("ESP32-IMU");
  BLEServer *pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();
  BLEDevice::startAdvertising();
}

void loop() {
  // Read IMU data
  float pitch = ...; // Get from IMU
  float yaw = ...;   // Get from IMU
  float roll = ...;  // Get from IMU
  
  // Format and send data
  String data = String(pitch) + "," + String(yaw) + "," + String(roll);
  pCharacteristic->setValue(data.c_str());
  pCharacteristic->notify();
  
  delay(50); // 20Hz update rate
}
```

### 2. Web App Setup

1. **Clone/Download this repository**

2. **Serve the web app** - The Web Bluetooth API requires HTTPS or localhost:
   ```bash
   # Option 1: Python 3
   python3 -m http.server 8080
   
   # Option 2: Node.js (if you have http-server installed)
   npx http-server -p 8080
   
   # Option 3: PHP
   php -S localhost:8080
   ```

3. **Open in browser:**
   - Navigate to `http://localhost:8080`
   - Or simply open `index.html` directly (localhost is acceptable for Web Bluetooth)

4. **Connect to ESP32:**
   - Click "Connect to ESP32" button
   - Select your ESP32 device from the browser's BLE device list
   - View real-time orientation data!

## Usage

1. Power on your ESP32-C3 with the IMU sensor
2. Open the web app in a supported browser
3. Click the "Connect to ESP32" button
4. Select "ESP32-IMU" (or your device name) from the popup
5. Watch the real-time visualization of your IMU data!

## Troubleshooting

### Web Bluetooth not available
- Ensure you're using a supported browser (Chrome/Edge recommended)
- Make sure you're accessing via HTTPS or localhost
- On Linux, may need to enable experimental features: `chrome://flags/#enable-web-bluetooth`

### Cannot find ESP32 device
- Verify ESP32 is powered on and BLE is advertising
- Check that the device name in ESP32 code matches what you're looking for
- Try restarting the ESP32

### No data received
- Verify the Service and Characteristic UUIDs match between ESP32 and web app
- Check that notifications are enabled on the characteristic
- Use a BLE scanner app to verify ESP32 is transmitting data
- Check browser console for error messages

### Data appears incorrect
- Verify the data format is `pitch,yaw,roll` with comma separators
- Check IMU sensor calibration
- Ensure IMU library is correctly installed and configured

## Customization

### Change BLE UUIDs
Edit the UUIDs in `app.js`:
```javascript
const SERVICE_UUID = 'your-service-uuid';
const CHARACTERISTIC_UUID = 'your-characteristic-uuid';
```

### Adjust Chart Settings
Modify chart configuration in `app.js` to change colors, ranges, update rates, etc.

### Modify Data Format
If your ESP32 sends data in a different format, update the parsing logic in the `handleIMUData()` function.

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full support (v56+) |
| Edge | ✅ Full support (v79+) |
| Opera | ✅ Full support (v43+) |
| Firefox | ❌ Not supported |
| Safari | ❌ Not supported |
| Chrome Android | ✅ Full support (v56+) |

## License

MIT License - feel free to use and modify as needed!

## Resources

- [Web Bluetooth API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [ESP32 BLE Arduino Library](https://github.com/espressif/arduino-esp32)
- [Adafruit IMU Libraries](https://github.com/adafruit)

