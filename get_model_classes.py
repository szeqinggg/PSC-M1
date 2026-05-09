from ultralytics import YOLO

#Load your YOLO model
#Replace 'path/to/your/model.pt' with the actual oath to your model file
model = YOLO("src/medicine_type/best.pt")

#Access and print the class names
#The 'names' attribute is a dcitionary where keys are class IDs and values are class names
class_names = model.names

print("YOLO Model Class Labels:")
for class_id, class_name in class_names.items():
    print(f"{class_id}:\"{class_name}\"")