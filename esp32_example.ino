/*
 * ESP32-C3 BLE IMU Data Transmitter
 * 
 * This example code reads orientation data from an Adafruit IMU sensor
 * and transmits it via BLE to the web application.
 * 
 * Hardware:
 * - ESP32-C3 microcontroller
 * - Adafruit IMU sensor (e.g., BNO055, MPU6050, or LSM9DS1)
 * 
 * Libraries Required:
 * - BLE Library (included with ESP32 board package)
 * - Adafruit Sensor Library
 * - Specific IMU library (e.g., Adafruit_BNO055, Adafruit_MPU6050)
 * 
 * Install via Arduino Library Manager:
 * 1. Adafruit BNO055
 * 2. Adafruit Unified Sensor
 * 3. Adafruit BusIO
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Uncomment the IMU sensor you're using:
// #include <Adafruit_BNO055.h>
// #include <Adafruit_MPU6050.h>
// #include <Adafruit_LSM9DS1.h>

#include <Wire.h>
#include <Adafruit_Sensor.h>

// BLE UUIDs - These must match the web app!
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// BLE objects
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// IMU object - Uncomment the one you're using:
// Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28);
// Adafruit_MPU6050 mpu;
// Adafruit_LSM9DS1 lsm = Adafruit_LSM9DS1();

// Connection callbacks
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Client connected");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Client disconnected");
    }
};

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32-C3 BLE IMU Transmitter");
  
  // Initialize I2C
  Wire.begin();
  
  // Initialize IMU
  if (!initializeIMU()) {
    Serial.println("Failed to initialize IMU sensor!");
    Serial.println("Check your wiring and sensor address.");
    while (1) {
      delay(1000);
    }
  }
  
  Serial.println("IMU sensor initialized successfully");
  
  // Initialize BLE
  BLEDevice::init("a_XIAO_IMU_DATA");
  
  // Create BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  // Create BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  // Create BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );
  
  // Add BLE Descriptor for notifications
  pCharacteristic->addDescriptor(new BLE2902());
  
  // Start the service
  pService->start();
  
  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE advertising started");
  Serial.println("Waiting for client connection...");
}

void loop() {
  // Handle BLE connection state changes
  if (deviceConnected) {
    // Read IMU data
    float pitch, yaw, roll, accelX, accelY, accelZ;
    if (readIMUData(&pitch, &yaw, &roll, &accelX, &accelY, &accelZ)) {
      // Format data as CSV: "yaw,pitch,roll,accelX,accelY,accelZ"
      String dataString = String(yaw, 2) + "," + 
                         String(pitch, 2) + "," + 
                         String(roll, 2) + "," +
                         String(accelX, 2) + "," +
                         String(accelY, 2) + "," +
                         String(accelZ, 2);
      
      // Send via BLE
      pCharacteristic->setValue(dataString.c_str());
      pCharacteristic->notify();
      
      // Debug output
      Serial.print("Sent: ");
      Serial.println(dataString);
    }
    
    delay(50); // 20Hz update rate
  }
  
  // Handle disconnection
  if (!deviceConnected && oldDeviceConnected) {
    delay(500); // Give the bluetooth stack time to get ready
    pServer->startAdvertising();
    Serial.println("Start advertising again");
    oldDeviceConnected = deviceConnected;
  }
  
  // Handle connection
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}

// Initialize IMU sensor
bool initializeIMU() {
  // EXAMPLE FOR BNO055 - Uncomment if using BNO055
  /*
  if (!bno.begin()) {
    return false;
  }
  delay(1000);
  bno.setExtCrystalUse(true);
  return true;
  */
  
  // EXAMPLE FOR MPU6050 - Uncomment if using MPU6050
  /*
  if (!mpu.begin()) {
    return false;
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  return true;
  */
  
  // EXAMPLE FOR LSM9DS1 - Uncomment if using LSM9DS1
  /*
  if (!lsm.begin()) {
    return false;
  }
  lsm.setupAccel(lsm.LSM9DS1_ACCELRANGE_2G);
  lsm.setupMag(lsm.LSM9DS1_MAGGAIN_4GAUSS);
  lsm.setupGyro(lsm.LSM9DS1_GYROSCALE_245DPS);
  return true;
  */
  
  // If no IMU is configured, return false
  Serial.println("No IMU configured! Please uncomment the appropriate IMU code.");
  return false;
}

// Read IMU data and calculate orientation and acceleration
bool readIMUData(float* pitch, float* yaw, float* roll, float* accelX, float* accelY, float* accelZ) {
  // EXAMPLE FOR BNO055 - Uncomment if using BNO055
  /*
  sensors_event_t orientEvent, accelEvent;
  bno.getEvent(&orientEvent, Adafruit_BNO055::VECTOR_EULER);
  bno.getEvent(&accelEvent, Adafruit_BNO055::VECTOR_ACCELEROMETER);
  
  // BNO055 provides direct Euler angles
  *yaw = orientEvent.orientation.x;
  *pitch = orientEvent.orientation.y;
  *roll = orientEvent.orientation.z;
  
  // Get acceleration data
  *accelX = accelEvent.acceleration.x;
  *accelY = accelEvent.acceleration.y;
  *accelZ = accelEvent.acceleration.z;
  
  return true;
  */
  
  // EXAMPLE FOR MPU6050 - Uncomment if using MPU6050
  /*
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  
  // Get acceleration data (in m/s²)
  *accelX = a.acceleration.x;
  *accelY = a.acceleration.y;
  *accelZ = a.acceleration.z;
  
  // Calculate pitch and roll from accelerometer
  *pitch = atan2(a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x + 
                                         a.acceleration.z * a.acceleration.z)) * 180.0 / PI;
  *roll = atan2(-a.acceleration.x, a.acceleration.z) * 180.0 / PI;
  
  // For MPU6050, yaw requires magnetometer or integration of gyro
  // Using gyro Z for demonstration (this will drift over time)
  static float yawAngle = 0;
  yawAngle += g.gyro.z * 0.05; // Integrate gyro (dt = 50ms)
  *yaw = yawAngle;
  
  return true;
  */
  
  // EXAMPLE FOR LSM9DS1 - Uncomment if using LSM9DS1
  /*
  lsm.read();
  sensors_event_t a, m, g, temp;
  lsm.getEvent(&a, &m, &g, &temp);
  
  // Get acceleration data (in m/s²)
  *accelX = a.acceleration.x;
  *accelY = a.acceleration.y;
  *accelZ = a.acceleration.z;
  
  // Calculate pitch and roll from accelerometer
  *pitch = atan2(a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x + 
                                         a.acceleration.z * a.acceleration.z)) * 180.0 / PI;
  *roll = atan2(-a.acceleration.x, a.acceleration.z) * 180.0 / PI;
  
  // Calculate yaw from magnetometer (requires calibration)
  *yaw = atan2(m.magnetic.y, m.magnetic.x) * 180.0 / PI;
  
  return true;
  */
  
  // DEMO MODE - Generates simulated data for testing
  // Remove this when using real IMU
  static float angle = 0;
  angle += 1;
  if (angle > 360) angle = 0;
  
  *pitch = 30 * sin(angle * PI / 180);
  *yaw = angle;
  *roll = 20 * cos(angle * PI / 180);
  
  // Simulated acceleration data (in m/s²)
  *accelX = 0.5 * sin(angle * PI / 180);
  *accelY = 0.3 * cos(angle * PI / 180);
  *accelZ = 9.81 + 0.2 * sin(angle * PI / 180); // ~9.81 m/s² with small variation
  
  return true;
}

