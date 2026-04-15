from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from camera_manager import camera_manager

def capture_frame(camera_name: str):
    return camera_manager.get_frame(camera_name)

@dataclass
class RoomBounds:
    min_x: float = -5.0
    max_x: float = 5.0
    min_y: float = -3.0
    max_y: float = 3.0
    min_z: float = 0.0
    max_z: float = 8.0


@dataclass
class StereoParams:
    # 左右カメラの内部パラメータ
    K1: np.ndarray
    D1: np.ndarray
    K2: np.ndarray
    D2: np.ndarray

    # cam2 を cam1 基準で表した相対姿勢
    R: np.ndarray
    T: np.ndarray

    image_size: tuple[int, int]  # (width, height)


@dataclass
class CameraDevices:
    left: str = "/dev/video0"
    right: str = "/dev/video2"


def _open_camera(device: str) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(device)
    if cap.isOpened():
        return cap

    # 失敗時は index でも試す
    try:
        idx = int(device.replace("/dev/video", ""))
        cap = cv2.VideoCapture(idx)
        if cap.isOpened():
            return cap
    except Exception:
        pass

    raise RuntimeError(f"cannot open camera: {device}")


def _make_rectify_maps(params: StereoParams):
    w, h = params.image_size
    R1, R2, P1, P2, Q, _, _ = cv2.stereoRectify(
        params.K1,
        params.D1,
        params.K2,
        params.D2,
        (w, h),
        params.R,
        params.T,
        flags=cv2.CALIB_ZERO_DISPARITY,
        alpha=0,
    )

    map1x, map1y = cv2.initUndistortRectifyMap(
        params.K1, params.D1, R1, P1, (w, h), cv2.CV_32FC1
    )
    map2x, map2y = cv2.initUndistortRectifyMap(
        params.K2, params.D2, R2, P2, (w, h), cv2.CV_32FC1
    )
    return map1x, map1y, map2x, map2y, Q


def reconstruct_room_point_cloud(
    params: StereoParams,
    devices: CameraDevices | None = None,
    bounds: RoomBounds | None = None,
    max_points: int = 200_000,
) -> dict[str, Any]:
    """
    2台カメラのフレームから簡易点群を作る。
    APIから呼ばれた瞬間だけ実行する想定。
    """
    devices = devices or CameraDevices()
    bounds = bounds or RoomBounds()

    left = capture_frame(devices.left)
    right = capture_frame(devices.right)

    # サイズが違う場合は揃える
    w, h = params.image_size
    left = cv2.resize(left, (w, h))
    right = cv2.resize(right, (w, h))

    map1x, map1y, map2x, map2y, Q = _make_rectify_maps(params)
    left_r = cv2.remap(left, map1x, map1y, cv2.INTER_LINEAR)
    right_r = cv2.remap(right, map2x, map2y, cv2.INTER_LINEAR)

    gray_l = cv2.cvtColor(left_r, cv2.COLOR_BGR2GRAY)
    gray_r = cv2.cvtColor(right_r, cv2.COLOR_BGR2GRAY)

    stereo = cv2.StereoSGBM.create(
        minDisparity=0,
        numDisparities=16 * 8,
        blockSize=7,
        P1=8 * 3 * 7 * 7,
        P2=32 * 3 * 7 * 7,
        uniquenessRatio=10,
        speckleWindowSize=100,
        speckleRange=2,
        disp12MaxDiff=1,
        mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY,
    )

    disparity = stereo.compute(gray_l, gray_r).astype(np.float32) / 16.0

    print("disparity min/max:", float(np.min(disparity)), float(np.max(disparity)))

    points_3d = cv2.reprojectImageTo3D(disparity, Q)

    mask = disparity > 0.1
    print("mask count:", int(mask.sum()))

    pts = points_3d[mask]
    cols = left_r[mask]
    print("pts before bounds:", len(pts))
    if len(pts) > 0:
        print("pts x:", float(pts[:, 0].min()), float(pts[:, 0].max()))
        print("pts y:", float(pts[:, 1].min()), float(pts[:, 1].max()))
        print("pts z:", float(pts[:, 2].min()), float(pts[:, 2].max()))
    else:
        print("pts is empty")
    in_room = (
        (pts[:, 0] >= bounds.min_x) & (pts[:, 0] <= bounds.max_x) &
        (pts[:, 1] >= bounds.min_y) & (pts[:, 1] <= bounds.max_y) &
        (pts[:, 2] >= bounds.min_z) & (pts[:, 2] <= bounds.max_z)
    )

    print("pts after bounds:", int(in_room.sum()))

    pts = pts[in_room]
    cols = cols[in_room]

    # 点が多すぎると重いので間引き
    if len(pts) > max_points:
        idx = np.random.choice(len(pts), size=max_points, replace=False)
        pts = pts[idx]
        cols = cols[idx]

    return {
        "point_count": int(len(pts)),
        "points": pts.tolist(),
        "colors": cols[:, ::-1].tolist(),  # BGR -> RGB
    }


def save_ply(path: str | Path, points: list[list[float]], colors: list[list[int]]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    pts = np.asarray(points, dtype=np.float32)
    cols = np.asarray(colors, dtype=np.uint8)

    with path.open("w", encoding="utf-8") as f:
        f.write("ply\n")
        f.write("format ascii 1.0\n")
        f.write(f"element vertex {len(pts)}\n")
        f.write("property float x\n")
        f.write("property float y\n")
        f.write("property float z\n")
        f.write("property uchar red\n")
        f.write("property uchar green\n")
        f.write("property uchar blue\n")
        f.write("end_header\n")
        for p, c in zip(pts, cols):
            f.write(f"{p[0]} {p[1]} {p[2]} {int(c[0])} {int(c[1])} {int(c[2])}\n")