import cv2
import os
from camera_manager import camera_manager

os.makedirs("calib/left", exist_ok=True)
os.makedirs("calib/right", exist_ok=True)

camera_manager.start_camera("video0")
camera_manager.start_camera("video2")

count = 0

while True:
    left = camera_manager.get_frame("video0")
    right = camera_manager.get_frame("video2")

    cv2.imshow("left", left)
    cv2.imshow("right", right)

    key = cv2.waitKey(1)

    if key == ord("s"):
        cv2.imwrite(f"calib/left/{count:03d}.png", left)
        cv2.imwrite(f"calib/right/{count:03d}.png", right)
        print("saved", count)
        count += 1

    elif key == 27:
        break

cv2.destroyAllWindows()