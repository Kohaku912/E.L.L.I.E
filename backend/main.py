from __future__ import annotations

import json
import uuid
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import asyncio

import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response
from pydantic import BaseModel, Field
import numpy as np


from room_3d import (
    StereoParams,
    CameraDevices,
    RoomBounds,
    reconstruct_room_point_cloud,
)

# -----------------------------
# Utilities
# -----------------------------

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex[:8]


DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATA_FILE = DATA_DIR / "room_state.json"
# -----------------------------
# Camera streaming
# -----------------------------

CAMERA_DEVICE_MAP: dict[str, str] = {
    "video0": "/dev/video0",
    "video2": "/dev/video2",
}


def open_camera(camera_name: str) -> cv2.VideoCapture:
    if camera_name not in CAMERA_DEVICE_MAP:
        raise HTTPException(status_code=404, detail="camera not found")

    device_path = CAMERA_DEVICE_MAP[camera_name]

    # まず /dev/videoX を開く。失敗したら index でも試す。
    cap = cv2.VideoCapture(device_path)
    if cap.isOpened():
        return cap

    cap.release()

    index = int(camera_name.replace("video", ""))
    cap = cv2.VideoCapture(index)
    if cap.isOpened():
        return cap

    cap.release()
    raise HTTPException(status_code=500, detail=f"failed to open camera: {camera_name}")


def mjpeg_generator(camera_name: str, fps: float = 15.0):
    cap = open_camera(camera_name)

    try:
        delay = 1.0 / fps
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.1)
                continue

            ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ok:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
            )
            time.sleep(delay)
    finally:
        cap.release()


def snapshot_jpeg(camera_name: str) -> bytes:
    cap = open_camera(camera_name)
    try:
        ok, frame = cap.read()
        if not ok:
            raise HTTPException(status_code=500, detail=f"failed to read frame: {camera_name}")

        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if not ok:
            raise HTTPException(status_code=500, detail=f"failed to encode frame: {camera_name}")

        return buf.tobytes()
    finally:
        cap.release()

# -----------------------------
# Models
# -----------------------------

StatusValue = bool | int | float | str
LogLevel = Literal["info", "success", "warning", "error"]


class StatusCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    value: StatusValue
    unit: str | None = Field(default=None, max_length=32)
    source: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class StatusItem(StatusCreate):
    id: str
    updatedAt: str


class ActionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="未分類", max_length=100)
    target: str = Field(default="system", max_length=100)
    command: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=500)


class ActionItem(ActionCreate):
    id: str


class LogItem(BaseModel):
    id: str
    time: str
    level: LogLevel
    message: str


class ActionExecuteRequest(BaseModel):
    # React側から送る想定。将来は任意のパラメータも足しやすい。
    action_id: str | None = None
    name: str | None = None
    command: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)


class StateSnapshot(BaseModel):
    statuses: list[StatusItem] = Field(default_factory=list)
    actions: list[ActionItem] = Field(default_factory=list)
    logs: list[LogItem] = Field(default_factory=list)


class BroadcastMessage(BaseModel):
    type: str
    payload: dict[str, Any]


# -----------------------------
# Persistent store
# -----------------------------

@dataclass
class Store:
    statuses: list[StatusItem] = field(default_factory=list)
    actions: list[ActionItem] = field(default_factory=list)
    logs: list[LogItem] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "statuses": [s.model_dump() for s in self.statuses],
            "actions": [a.model_dump() for a in self.actions],
            "logs": [l.model_dump() for l in self.logs],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Store":
        statuses = [StatusItem(**item) for item in data.get("statuses", [])]
        actions = [ActionItem(**item) for item in data.get("actions", [])]
        logs = [LogItem(**item) for item in data.get("logs", [])]
        return cls(statuses=statuses, actions=actions, logs=logs)


store = Store()
store_lock = asyncio.Lock()
ws_clients: set[WebSocket] = set()


def load_store() -> None:
    global store
    if not DATA_FILE.exists():
        store = Store()
        return

    try:
        store = Store.from_dict(json.loads(DATA_FILE.read_text(encoding="utf-8")))
    except Exception:
        store = Store()


def save_store() -> None:
    tmp = DATA_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(store.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DATA_FILE)


async def broadcast(msg_type: str, payload: dict[str, Any]) -> None:
    if not ws_clients:
        return

    message = json.dumps({"type": msg_type, "payload": payload}, ensure_ascii=False)
    stale: list[WebSocket] = []
    for ws in list(ws_clients):
        try:
            await ws.send_text(message)
        except Exception:
            stale.append(ws)
    for ws in stale:
        ws_clients.discard(ws)


async def add_log(level: LogLevel, message: str) -> LogItem:
    async with store_lock:
        item = LogItem(id=new_id(), time=utc_now_iso(), level=level, message=message)
        store.logs.insert(0, item)
        store.logs = store.logs[:500]
        save_store()
    await broadcast("log_added", item.model_dump())
    return item


# -----------------------------
# FastAPI app
# -----------------------------

app = FastAPI(title="Room Control Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    load_store()
    if not store.logs:
        await add_log("success", "バックエンドを起動しました")

@app.get("/video0")
async def video0() -> StreamingResponse:
    return StreamingResponse(
        mjpeg_generator("video0"),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/video2")
async def video2() -> StreamingResponse:
    return StreamingResponse(
        mjpeg_generator("video2"),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/api/cameras/{camera_name}/snapshot")
async def camera_snapshot(camera_name: str) -> Response:
    if camera_name not in CAMERA_DEVICE_MAP:
        raise HTTPException(status_code=404, detail="camera not found")

    jpg = snapshot_jpeg(camera_name)
    return Response(content=jpg, media_type="image/jpeg")

@app.get("/api/room/reconstruct")
async def reconstruct_room():
    params = StereoParams(
        K1=np.array([[700.0, 0.0, 320.0], [0.0, 700.0, 240.0], [0.0, 0.0, 1.0]], dtype=np.float32),
        D1=np.zeros(5, dtype=np.float32),
        K2=np.array([[700.0, 0.0, 320.0], [0.0, 700.0, 240.0], [0.0, 0.0, 1.0]], dtype=np.float32),
        D2=np.zeros(5, dtype=np.float32),
        R=np.eye(3, dtype=np.float32),
        T=np.array([0.25, 0.0, 0.0], dtype=np.float32),  # 2台の間隔(例)
        image_size=(640, 480),
    )

    result = reconstruct_room_point_cloud(
        params=params,
        devices=CameraDevices(left="/dev/video0", right="/dev/video2"),
        bounds=RoomBounds(min_x=-3, max_x=3, min_y=-2, max_y=2, min_z=0, max_z=6),
    )
    return result

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/state", response_model=StateSnapshot)
async def get_state() -> StateSnapshot:
    async with store_lock:
        return StateSnapshot(statuses=store.statuses, actions=store.actions, logs=store.logs)


@app.get("/api/statuses", response_model=list[StatusItem])
async def get_statuses() -> list[StatusItem]:
    async with store_lock:
        return store.statuses


@app.post("/api/statuses", response_model=StatusItem)
async def create_status(req: StatusCreate) -> StatusItem:
    async with store_lock:
        item = StatusItem(
            id=new_id(),
            name=req.name,
            value=req.value,
            unit=req.unit,
            source=req.source,
            description=req.description,
            updatedAt=utc_now_iso(),
        )
        store.statuses.insert(0, item)
        save_store()
    await add_log("success", f"状態を追加しました: {item.name}")
    await broadcast("status_added", item.model_dump())
    return item


@app.put("/api/statuses/{status_id}", response_model=StatusItem)
async def update_status(status_id: str, req: StatusCreate) -> StatusItem:
    async with store_lock:
        for i, item in enumerate(store.statuses):
            if item.id == status_id:
                updated = StatusItem(
                    id=item.id,
                    name=req.name,
                    value=req.value,
                    unit=req.unit,
                    source=req.source,
                    description=req.description,
                    updatedAt=utc_now_iso(),
                )
                store.statuses[i] = updated
                save_store()
                break
        else:
            raise HTTPException(status_code=404, detail="status not found")

    await add_log("info", f"状態を更新しました: {updated.name}")
    await broadcast("status_updated", updated.model_dump())
    return updated


@app.delete("/api/statuses/{status_id}")
async def delete_status(status_id: str) -> JSONResponse:
    async with store_lock:
        before = len(store.statuses)
        store.statuses = [s for s in store.statuses if s.id != status_id]
        if len(store.statuses) == before:
            raise HTTPException(status_code=404, detail="status not found")
        save_store()
    await add_log("warning", f"状態を削除しました: {status_id}")
    await broadcast("status_deleted", {"id": status_id})
    return JSONResponse({"ok": True})


@app.get("/api/actions", response_model=list[ActionItem])
async def get_actions() -> list[ActionItem]:
    async with store_lock:
        return store.actions


@app.post("/api/actions", response_model=ActionItem)
async def create_action(req: ActionCreate) -> ActionItem:
    async with store_lock:
        item = ActionItem(id=new_id(), **req.model_dump())
        store.actions.insert(0, item)
        save_store()
    await add_log("success", f"関数を追加しました: {item.name}")
    await broadcast("action_added", item.model_dump())
    return item


@app.delete("/api/actions/{action_id}")
async def delete_action(action_id: str) -> JSONResponse:
    async with store_lock:
        before = len(store.actions)
        store.actions = [a for a in store.actions if a.id != action_id]
        if len(store.actions) == before:
            raise HTTPException(status_code=404, detail="action not found")
        save_store()
    await add_log("warning", f"関数を削除しました: {action_id}")
    await broadcast("action_deleted", {"id": action_id})
    return JSONResponse({"ok": True})


@app.get("/api/logs", response_model=list[LogItem])
async def get_logs(limit: int = 200) -> list[LogItem]:
    async with store_lock:
        return store.logs[: max(1, min(limit, 500))]


@app.post("/api/logs", response_model=LogItem)
async def create_log(req: LogItem) -> LogItem:
    async with store_lock:
        store.logs.insert(0, req)
        store.logs = store.logs[:500]
        save_store()
    await broadcast("log_added", req.model_dump())
    return req


@app.post("/api/actions/execute")
async def execute_action(req: ActionExecuteRequest) -> dict[str, Any]:
    async with store_lock:
        action: ActionItem | None = None
        if req.action_id:
            action = next((a for a in store.actions if a.id == req.action_id), None)
        elif req.command:
            action = next((a for a in store.actions if a.command == req.command), None)
        elif req.name:
            action = next((a for a in store.actions if a.name == req.name), None)

    if action is None:
        raise HTTPException(status_code=404, detail="action not found")

    # ここに実際の実行処理を入れます。
    # 例:
    # - PC制御: ローカルエージェントへのHTTP/WS送信
    # - スマホ制御: Android companion app への送信
    # - 赤外線: シリアル / USB / GPIO / 専用機器
    # - 外部API: requests/httpx で呼び出し
    # 今は安全のため、ログ出力のみのスタブにしています。
    result = {
        "ok": True,
        "action": action.model_dump(),
        "params": req.params,
        "message": f"実行スタブ: {action.command}",
        "executedAt": utc_now_iso(),
    }

    await add_log("info", f"実行要求を受け付けました: {action.name} / {action.command}")
    await broadcast("action_executed", result)
    return result


@app.post("/api/reset")
async def reset_all() -> dict[str, bool]:
    async with store_lock:
        store.statuses.clear()
        store.actions.clear()
        store.logs.clear()
        save_store()
    await add_log("warning", "すべてのデータをリセットしました")
    return {"ok": True}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    ws_clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "payload": {"time": utc_now_iso()}}, ensure_ascii=False))
        while True:
            # クライアントからは ping 的なメッセージを受けてもよいが、
            # ここでは受信内容を使わず、接続維持のみ行う。
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_clients.discard(ws)
    except Exception:
        ws_clients.discard(ws)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "Room Control Backend",
        "message": "FastAPI backend is running",
        "docs": "/docs",
        "websocket": "/ws",
    }


# -----------------------------
# Optional local runner
# -----------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
