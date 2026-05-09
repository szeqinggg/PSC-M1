import cv2
from ultralytics import YOLO
from collections import Counter
import firebase_admin
from firebase_admin import credentials, db
import serial
import time

# =========================
# FIREBASE INITIALIZATION
# =========================
cred = credentials.Certificate(
    "src/medicine_type/psc-m1-firebase-adminsdk-fbsvc-1cc8d5591e.json"
)

firebase_admin.initialize_app(cred, {
    'databaseURL': "https://psc-m1-default-rtdb.firebaseio.com/"
})

# =========================
# LOAD YOLO MODEL
# =========================
model = YOLO("src/medicine_type/best.pt")

# =========================
# ARDUINO SERIAL CONNECTION
# =========================
# Check your port using:
# ls /dev/tty.*
arduino = serial.Serial('/dev/tty.usbmodem1101', 9600)

time.sleep(2)

# =========================
# FIREBASE UPDATE FUNCTION
# =========================
def update_firebase(class_counts):
    try:
        db_ref = db.reference("product_counts")

        for class_name, count in class_counts.items():

            db_ref.child(class_name).set({
                'count': count
            })

            print(f"[Firebase] {class_name}: {count}")

    except Exception as e:
        print(f"[Firebase Error] {e}")

# =========================
# INITIALIZE CAMERA
# =========================
cap = cv2.VideoCapture("http://192.168.100.78:4747/video")

if not cap.isOpened():
    print("Could not open webcam.")
    exit()

print("YOLOv8 Real-Time Detection Started")
print("Press 'q' or ESC to quit.")

# =========================
# COUNTERS
# =========================
total_counts = Counter()

# Prevent multiple counts
medicine_detected = False

# =========================
# MAIN LOOP
# =========================
while True:

    ret, frame = cap.read()

    if not ret:
        print("Failed to read frame.")
        break

    # =========================
    # READ IR SENSOR SIGNAL
    # =========================
    if arduino.in_waiting:

        signal = arduino.readline().decode().strip()

        print(f"Sensor Signal: {signal}")

        # =========================
        # OBJECT DETECTED
        # =========================
        if signal == "DETECTED" and not medicine_detected:

            print("Medicine detected by IR sensor")

            # Run YOLO inference
            results = model(
                frame,
                conf=0.20,
                imgsz=640,
                verbose=False
            )[0]

            # Ensure boxes exist
            if results.boxes is not None and len(results.boxes) > 0:

                # Get highest confidence detection
                best_box = max(
                    results.boxes,
                    key=lambda b: float(b.conf.item())
                )

                cls_id = int(best_box.cls.item())
                class_name = model.names[cls_id]
                conf = float(best_box.conf.item())

                print(f"Detected: {class_name} ({conf:.2f})")

                # Increment ONCE
                total_counts[class_name] += 1

                print(f"Updated Count: {class_name} = {total_counts[class_name]}")

                # Update Firebase
                update_firebase(total_counts)

                # Bounding box
                x1, y1, x2, y2 = map(
                    int,
                    best_box.xyxy[0].tolist()
                )

                # Draw rectangle
                cv2.rectangle(
                    frame,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2
                )

                # Draw label
                label = f"{class_name} {conf:.2f}"

                cv2.putText(
                    frame,
                    label,
                    (x1, max(20, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2
                )

                # Prevent duplicate counting
                medicine_detected = True

        # =========================
        # RESET DETECTION FLAG
        # =========================
        elif signal != "DETECTED":

            medicine_detected = False

    # =========================
    # DISPLAY FRAME
    # =========================
    cv2.imshow(
        "YOLOv8 Medicine Detection",
        frame
    )

    # =========================
    # EXIT
    # =========================
    key = cv2.waitKey(1)

    if key == ord('q') or key == 27:
        break

# =========================
# CLEANUP
# =========================
cap.release()
cv2.destroyAllWindows()
arduino.close()