import cv2
from ultralytics import YOLO
from collections import Counter
import firebase_admin
from firebase_admin import credentials, db

cred = credentials.Certificate("src/medicine_type/psc-m1-firebase-adminsdk-fbsvc-1cc8d5591e.json")
firebase_admin.initialize_app(cred,{
    'databaseURL': "https://psc-m1-default-rtdb.firebaseio.com/"
})

model = YOLO("runs/detect/Defect_Dataset-1/weights/best.pt")

def update_firebase(class_counts):
    try:
        # Reference to product counts
        db_ref = db.reference ("defective")
                            
        # Update Firebase with detected classes
        for class_name, count in class_counts.items() :
            db_ref.child (class_name). set({'count': count})
            print (f"Defectness: {class_name}, count: {count}") 
    except Exception as e:
        print(f"[Firebase Error] {e}")

#Initialise phone camera from DroidCam application
cap = cv2.VideoCapture("http://192.168.100.78:4747/video")
if  not cap.isOpened():
    print("Could not open webcam.")
    exit ()

print ("YOLOv8n real-time inference started. Press 'q' or ESC to quit.")

prev_counts = Counter()
total_counts = Counter()

while True:
    ret, frame = cap.read()
    if not ret:
        print ("Failed to read frame.")
        break
    
    #Run YOLO inference
    results = model(frame, conf=0.5, imgsz=640, verbose=False)[0]

    #Draw results
    current_counts = Counter ()

    #Ensure boxes exist
    if results.boxes is not None and results.boxes.shape[0] >0:
        for box in results.boxes:
            cls_id = int(box.cls.item())
            class_name = model.names[cls_id] if model.names else f"class {cls_id}"
            conf = float(box.conf.item())

            #Get bounding box coordinates
            x1,y1,x2,y2 = map(int, box.xyxy[0].tolist())

            #Draw box and label
            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,225,0), 2)
            label = f"{class_name} {conf:.2f}"
            cv2.putText(frame, label, (x1, max(20,y1 - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 225, 0),2
            )

            #Update counters
            current_counts[class_name] += 1
            total_counts[class_name] += 1

    #Show frame
    cv2.imshow ("YOLOv8n Real-Time Detection", frame)
    
    #If detection changed
    if current_counts != prev_counts:
        update_firebase(current_counts)
    
    #Exit on 'q' or ESC
    key = cv2.waitKey(1)
    if key == ord('q') or key == 27:
        break

# Cleanup
cap.release()
cv2.destroyAllWindows()