import cv2
import threading
from typing import Any, Dict


camera_devices = {
    "video0": "/dev/video0",
    "video2": "/dev/video2",
}

class CameraManager:
    def __init__(self):
        self.caps: Dict[str, cv2.VideoCapture] = {}
        self.frames: Dict[str, Any] = {}
        self.locks: Dict[str, threading.Lock] = {}

    def start_camera(self, name: str):
        device = camera_devices[name]

        cap = cv2.VideoCapture(device)
        if not cap.isOpened():
            raise RuntimeError(f"failed to open camera: {name}")

        self.caps[name] = cap
        self.frames[name] = None
        self.locks[name] = threading.Lock()

        def loop():
            while True:
                ok, frame = cap.read()
                if ok:
                    with self.locks[name]:
                        self.frames[name] = frame

        threading.Thread(target=loop, daemon=True).start()

    def get_frame(self, name: str):
        if name not in self.frames:
            raise RuntimeError(f"camera not started: {name}")

        with self.locks[name]:
            frame = self.frames[name]

        if frame is None:
            raise RuntimeError(f"no frame yet: {name}")

        return frame.copy()


camera_manager = CameraManager()