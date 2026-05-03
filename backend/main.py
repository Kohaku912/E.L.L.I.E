
from __future__ import annotations

import asyncio
import base64
import mimetypes
import os
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
import json
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from threading import Lock
load_dotenv()

API_BASE = os.getenv("API_BASE", "http://localhost:8080/")
LIGHT_API_BASE = os.getenv("LIGHT_API_BASE", "http://192.168.50.186/")
LIGHT_ADDR = os.getenv("LIGHT_ADDR", "0xD001")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite-preview")
MAX_AI_TURNS = int(os.getenv("MAX_AI_TURNS", "5"))
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "8.0"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.2"))
REFERENCE_REGISTRY_PATH = Path(os.getenv("REFERENCE_REGISTRY_PATH", "reference_registry.json"))
REFERENCE_LOCK = Lock()
SYSTEM_PROMPT = """
あなたはPC状態と Discord RPC を取得、操作して回答するAIです。

# 絶対ルール
- ユーザーの質問に答えるために必要な情報は、必ず関数を使って取得してください
- 推測・質問返しは禁止です
- 情報が足りない場合でも、最も関連性の高い関数を選んで取得してください
- 同じ情報を二度取得しないでください

# 判断ルール（重要）
ユーザーの質問から、最も適切な情報源を自動で選択してください。

- 「起動しているか」「動いているか」→ system / get_system_summary
- 「CPU」→ hardware / get_cpu_info
- 「メモリ」→ hardware / get_memory_info
- 「ストレージ」→ hardware / get_disks_info
- 「ネットワーク」→ hardware / get_network_info
- 「バッテリー」→ system / get_battery
- 「プロセス」→ processes / get_processes
- 「温度」→ hardware / get_cpu_info
- 「マウス」「キーボード」「メディアキー」→ input
- 「ファイル」→ files
- 「通知」「クリップボード」「スクリーンショット」→ utils
- 「Discord」→ discord / discord_command

# Discord
- Discord の標準操作は専用関数を使う
- 専用関数が足りない場合は discord_command で raw command を送る
- 例: SET_CERTIFIED_DEVICES などの未個別対応コマンドも送信できる

# 照明操作
- 明るく → 4（全灯）
- 少し暗く → 3（エコ）
- 夜用 → 2（常夜灯）
- 消して → 1（消灯）

# 推論ルール
- まず必要な情報を関数で取得する
- 取得した結果を使って最終回答を生成する
- 最大8回まで繰り返せる

# 参照解決
- ユーザーが「あのチャンネル」「いつものゲーム」「作業フォルダ」などの曖昧な名前を使ったら、対応する実行ツールに渡す前に必ず resolve_reference を使う
- resolve_reference の データ を、Discord チャンネルID、実行ファイルのパス、ファイルパスとして使う
- 候補の追加・更新・削除は add_reference_alias / delete_reference_alias を使う
- 解決結果が複数ある場合は candidates の先頭を優先する
- resolve_reference の resolved.value はオブジェクトで返る
- 必要なキー（channel_id, path など）を取り出してツールに渡す

# 禁止
- 「どの情報が必要ですか？」のような質問返し
- 情報取得せずに回答すること

# 出力
- 最終回答は簡潔に答える
""".strip()

LIGHT_MODE_TO_CMD = {
    4: "0x20",  # 全灯
    3: "0x21",  # エコ（仮、必要に応じて修正）
    2: "0x22",  # 常夜灯（仮）
    1: "0x23",  # 消灯
}

app = FastAPI(title="AI Message Server", version="1.0.0")


class MessageRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str | None = None


class MessageResponse(BaseModel):
    answer: str
    trace: list[dict[str, Any]] = Field(default_factory=list)


@dataclass
class RequestContext:
    trace: list[dict[str, Any]] = field(default_factory=list)


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    call_id: str | None = None


class AIResult(BaseModel):
    final: bool = False
    answer: str | None = None
    tool_calls: list[ToolCall] = Field(default_factory=list)


_gemini_client: genai.Client | None = None

def normalize_text(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text).casefold())

def normalize_value(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        return {"value": value}
    return {"value": str(value)}

def load_reference_registry() -> dict[str, list[dict[str, Any]]]:
    if not REFERENCE_REGISTRY_PATH.exists():
        return {}
    try:
        data = json.loads(REFERENCE_REGISTRY_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            result: dict[str, list[dict[str, Any]]] = {}
            for k, v in data.items():
                if isinstance(v, list):
                    result[str(k)] = [item for item in v if isinstance(item, dict)]
            return result
    except Exception:
        pass
    return {}


def save_reference_registry(data: dict[str, list[dict[str, Any]]]) -> None:
    REFERENCE_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REFERENCE_REGISTRY_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def score_reference(query: str, alias: str, value: str) -> float:
    q = normalize_text(query)
    a = normalize_text(alias)
    v = normalize_text(value)

    if not q:
        return 0.0
    if q == a or q == v:
        return 1.0
    if q in a or a in q:
        return 0.92
    if q in v or v in q:
        return 0.88

    alias_score = SequenceMatcher(None, q, a).ratio()
    value_score = SequenceMatcher(None, q, v).ratio()
    return max(alias_score, value_score)


def S(type_: Any, **kwargs: Any) -> types.Schema:
    return types.Schema(type=type_, **kwargs)


def O(properties: dict[str, types.Schema], required: list[str] | None = None, description: str | None = None) -> types.Schema:
    kwargs: dict[str, Any] = {"type": types.Type.OBJECT, "properties": properties}
    if required:
        kwargs["required"] = required
    if description:
        kwargs["description"] = description
    return types.Schema(**kwargs)


def A(items: types.Schema, description: str | None = None) -> types.Schema:
    kwargs: dict[str, Any] = {"type": types.Type.ARRAY, "items": items}
    if description:
        kwargs["description"] = description
    return types.Schema(**kwargs)


def FN(name: str, description: str, parameters: types.Schema | None = None) -> types.FunctionDeclaration:
    if parameters is None:
        return types.FunctionDeclaration(name=name, description=description)
    return types.FunctionDeclaration(name=name, description=description, parameters=parameters)


async def api_request(
    method: str,
    path: str,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    files: Any | None = None,
    expect: str = "json",
) -> Any:
    url = f"{API_BASE.rstrip('/')}/{path.lstrip('/')}"
    timeout = httpx.Timeout(HTTP_TIMEOUT)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.request(
                method,
                url,
                params=params,
                json=json_body,
                files=files,
            )
            resp.raise_for_status()

            if expect == "bytes":
                content = resp.content
                disposition = resp.headers.get("content-disposition", "")
                filename = None
                m = re.search(r'filename="?([^";]+)"?', disposition)
                if m:
                    filename = m.group(1)

                return {
                    "content_base64": base64.b64encode(content).decode("ascii"),
                    "content_type": resp.headers.get("content-type"),
                    "content_length": len(content),
                    "filename": filename,
                }

            if expect == "text":
                return {"text": resp.text}

            if not resp.content:
                return {}

            ctype = resp.headers.get("content-type", "")
            if "application/json" in ctype:
                return resp.json()

            return {"text": resp.text, "content_type": ctype}
    except httpx.HTTPStatusError as e:
        resp = e.response
        detail: Any
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text

        if isinstance(detail, dict) and "error" in detail:
            err = detail["error"]
        else:
            err = detail

        return {
            "error": err if isinstance(err, str) else str(err),
            "status_code": resp.status_code if resp is not None else None,
        }
    except Exception as e:
        return {"error": str(e)}


async def upload_files(args: dict[str, Any]) -> Any:
    path = args.get("path")
    if not path:
        return {"error": "path is required"}

    files_arg = args.get("files")
    if files_arg is None and "file_base64" in args:
        files_arg = [args]

    if isinstance(files_arg, dict):
        files_arg = [files_arg]

    multipart: list[tuple[str, tuple[str, bytes, str]]] = []
    for idx, file_obj in enumerate(files_arg or []):
        content_b64 = file_obj.get("content_base64")
        if not content_b64:
            continue
        raw = base64.b64decode(content_b64)
        filename = file_obj.get("filename") or file_obj.get("name") or f"upload_{idx}"
        content_type = file_obj.get("content_type") or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        multipart.append(("file", (filename, raw, content_type)))

    if not multipart:
        return {"error": "files or file_base64 is required"}

    return await api_request("POST", "files/upload", params={"path": path}, files=multipart)


async def download_file(args: dict[str, Any]) -> Any:
    path = args.get("path")
    if not path:
        return {"error": "path is required"}
    return await api_request("GET", "files/download", params={"path": path}, expect="bytes")


async def discord_command(args: dict[str, Any]) -> Any:
    return await api_request("POST", "discord/command", json_body=args)


async def call_discord_endpoint(path: str, args: dict[str, Any]) -> Any:
    return await api_request("POST" if args.get("_method") == "POST" else "GET", path, json_body=args if args.get("_method") == "POST" else None)


async def resolve_reference(args: dict[str, Any]) -> Any:
    query = str(args.get("query") or "").strip()
    kind = str(args.get("kind") or "").strip()
    limit = int(args.get("limit") or 5)

    if not query:
        return {"error": "query is required"}

    registry = load_reference_registry()
    kinds = [kind] if kind and kind not in {"any", "*"} else list(registry.keys())

    candidates: list[dict[str, Any]] = []

    for k in kinds:
        for entry in registry.get(k, []):
            alias = str(entry.get("alias") or "")
            raw_value = entry.get("value")
            value_dict = normalize_value(raw_value)

            # スコア用テキスト
            value_text = " ".join(str(v) for v in value_dict.values())

            score = score_reference(query, alias, value_text)

            candidates.append(
                {
                    "kind": k,
                    "alias": alias,
                    "value": value_dict,
                    "score": round(score, 4),
                    "metadata": entry.get("metadata") or {},
                }
            )

    candidates.sort(key=lambda x: (x["score"], len(x["alias"])), reverse=True)
    resolved = candidates[0] if candidates and candidates[0]["score"] >= 0.55 else None

    return {
        "query": query,
        "kind": kind or None,
        "resolved": resolved,
        "candidates": candidates[:limit],
    }

async def list_reference_aliases(args: dict[str, Any]) -> Any:
    kind = str(args.get("kind") or "").strip()
    registry = load_reference_registry()

    if kind and kind not in {"any", "*"}:
        return {
            "kind": kind,
            "items": registry.get(kind, []),
            "registry_path": str(REFERENCE_REGISTRY_PATH),
        }

    return {
        "items": registry,
        "registry_path": str(REFERENCE_REGISTRY_PATH),
    }


async def add_reference_alias(args: dict[str, Any]) -> Any:
    kind = str(args.get("kind") or "").strip()
    alias = str(args.get("alias") or "").strip()
    value = args.get("value")  # ← 文字列じゃなくそのまま受ける
    metadata = args.get("metadata") if isinstance(args.get("metadata"), dict) else {}
    overwrite = bool(args.get("overwrite", True))

    if not kind:
        return {"error": "kind is required"}
    if not alias:
        return {"error": "alias is required"}
    if value is None:
        return {"error": "value is required"}

    value_dict = normalize_value(value)

    with REFERENCE_LOCK:
        registry = load_reference_registry()
        items = registry.setdefault(kind, [])

        existing_index = next((i for i, item in enumerate(items) if str(item.get("alias") or "") == alias), None)

        entry = {
            "alias": alias,
            "value": value_dict,
            "metadata": metadata,
        }

        if existing_index is not None:
            if not overwrite:
                return {"error": "alias already exists"}
            items[existing_index] = entry
        else:
            items.append(entry)

        save_reference_registry(registry)

    return {
        "ok": True,
        "kind": kind,
        "alias": alias,
        "value": value_dict,
    }

async def delete_reference_alias(args: dict[str, Any]) -> Any:
    kind = str(args.get("kind") or "").strip()
    alias = str(args.get("alias") or "").strip()

    if not kind:
        return {"error": "kind is required"}
    if not alias:
        return {"error": "alias is required"}

    with REFERENCE_LOCK:
        registry = load_reference_registry()
        items = registry.get(kind, [])
        before = len(items)
        items = [item for item in items if str(item.get("alias") or "") != alias]
        registry[kind] = items
        save_reference_registry(registry)

    return {
        "ok": True,
        "removed": before - len(items),
        "kind": kind,
        "alias": alias,
        "registry_path": str(REFERENCE_REGISTRY_PATH),
    }

async def control_light(args: dict[str, Any]) -> Any:
    mode = args.get("mode")

    if mode not in LIGHT_MODE_TO_CMD:
        return {"error": "invalid mode. use 1-4"}

    cmd = LIGHT_MODE_TO_CMD[mode]

    url = f"{LIGHT_API_BASE.rstrip('/')}/"

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(
                url,
                params={
                    "addr": LIGHT_ADDR,
                    "cmd": cmd,
                },
            )
            resp.raise_for_status()

            return {
                "ok": True,
                "mode": mode,
                "cmd": cmd,
                "status_code": resp.status_code,
                "response": resp.text,
            }

    except Exception as e:
        return {"error": str(e)}


TOOL_DEFINITIONS: list[types.Tool] = [
    types.Tool(
        function_declarations=[
            FN("get_system_summary", "OS情報、稼働時間、ユーザー、バッテリーを一括取得します。"),
            FN("get_os_info", "OS名、バージョン、ホスト名などの情報を取得します。"),
            FN("get_uptime", "システムの稼働時間を取得します。"),
            FN("get_users", "現在ログインしているユーザー一覧を取得します。"),
            FN("get_battery", "バッテリー残量と充電状態を取得します。"),

            FN("get_cpu_info", "CPUのモデル、使用率、温度、コア情報を取得します。"),
            FN("get_memory_info", "メモリ（RAM）とスワップの使用状況を取得します。"),
            FN("get_disks_info", "ディスクドライブの一覧と使用状況を取得します。"),
            FN("get_network_info", "ネットワークインターフェースの状態と速度を取得します。"),

            FN("get_processes", "実行中のプロセス一覧を取得します。"),
            FN(
                "kill_process",
                "PIDまたはプロセス名でプロセスを強制終了します。",
                O(
                    {
                        "pid": S(types.Type.INTEGER, description="終了対象のプロセスID"),
                        "name": S(types.Type.STRING, description="終了対象のプロセス名"),
                    }
                ),
            ),
            FN("get_startup_programs", "自動起動登録されているプログラム一覧を取得します。"),
            FN("get_active_window", "現在最前面にあるウィンドウのタイトルを取得します。"),

            FN("shutdown_pc", "PCをシャットダウンします。"),
            FN("reboot_pc", "PCを再起動します。"),
            FN("sleep_pc", "PCをスリープ状態にします。"),
            FN("lock_pc", "画面をロックします。"),
            FN("logout_pc", "現在のセッションをログアウトします。"),
            FN(
                "execute_command",
                "シェルコマンドを実行します。",
                O({"command": S(types.Type.STRING, description="実行するコマンド")}, required=["command"]),
            ),
            FN(
                "launch_app",
                "指定したパスのアプリを起動します。",
                O({"path": S(types.Type.STRING, description="実行ファイルのパス")}, required=["path"]),
            ),

            FN(
                "mouse_move",
                "マウスを移動します。",
                O(
                    {
                        "x": S(types.Type.INTEGER),
                        "y": S(types.Type.INTEGER),
                        "absolute": S(types.Type.BOOLEAN, description="絶対座標かどうか。デフォルトTrue"),
                    },
                    required=["x", "y"],
                ),
            ),
            FN(
                "mouse_click",
                "マウスクリックを実行します。",
                O(
                    {
                        "button": S(types.Type.STRING, description="left, right, middle"),
                        "x": S(types.Type.INTEGER),
                        "y": S(types.Type.INTEGER),
                        "double": S(types.Type.BOOLEAN),
                    },
                    required=["button"],
                ),
            ),
            FN(
                "mouse_scroll",
                "マウスホイールスクロールを実行します。",
                O(
                    {
                        "x": S(types.Type.INTEGER),
                        "y": S(types.Type.INTEGER),
                        "axis": S(types.Type.STRING, description="vertical または horizontal"),
                    },
                    required=["x", "y"],
                ),
            ),
            FN(
                "keyboard_type",
                "テキストを入力します。",
                O({"text": S(types.Type.STRING)}, required=["text"]),
            ),
            FN(
                "keyboard_shortcut",
                "ショートカットキーを実行します。",
                O(
                    {"keys": A(S(types.Type.STRING), description="例: ['ctrl', 's']")},
                    required=["keys"],
                ),
            ),
            FN(
                "input_media",
                "メディアキー操作を実行します。",
                O(
                    {
                        "action": S(
                            types.Type.STRING,
                            description="volume_up, volume_down, mute, play_pause, next, prev",
                        )
                    },
                    required=["action"],
                ),
            ),

            FN(
                "list_files",
                "指定パスのディレクトリ内容を表示します。",
                O({"path": S(types.Type.STRING)}, required=["path"]),
            ),
            FN(
                "move_file",
                "ファイルまたはディレクトリを移動します。",
                O({"src": S(types.Type.STRING), "dst": S(types.Type.STRING)}, required=["src", "dst"]),
            ),
            FN(
                "copy_file",
                "ファイルをコピーします。",
                O({"src": S(types.Type.STRING), "dst": S(types.Type.STRING)}, required=["src", "dst"]),
            ),
            FN(
                "delete_file",
                "ファイルまたはディレクトリを削除します。",
                O({"path": S(types.Type.STRING)}, required=["path"]),
            ),
            FN(
                "rename_file",
                "ファイルまたはディレクトリの名前を変更します。",
                O({"src": S(types.Type.STRING), "new_name": S(types.Type.STRING)}, required=["src", "new_name"]),
            ),
            FN(
                "upload_files",
                "ファイルをアップロードします。content_base64 を使って送信します。",
                O(
                    {
                        "path": S(types.Type.STRING),
                        "files": A(
                            O(
                                {
                                    "filename": S(types.Type.STRING),
                                    "content_base64": S(types.Type.STRING),
                                    "content_type": S(types.Type.STRING),
                                }
                            )
                        ),
                    },
                    required=["path"],
                ),
            ),
            FN(
                "download_file",
                "ファイルをダウンロードして Base64 で返します。",
                O({"path": S(types.Type.STRING)}, required=["path"]),
            ),

            FN("get_screenshot", "スクリーンショットをBase64形式で取得します。"),
            FN("get_clipboard", "クリップボードのテキストを読み取ります。"),
            FN(
                "set_clipboard",
                "クリップボードにテキストを書き込みます。",
                O({"text": S(types.Type.STRING)}, required=["text"]),
            ),
            FN(
                "notify",
                "デスクトップ通知を表示します。",
                O(
                    {
                        "title": S(types.Type.STRING),
                        "body": S(types.Type.STRING),
                        "icon": S(types.Type.STRING),
                    },
                    required=["title", "body"],
                ),
            ),

            FN("get_discord_status", "Discord RPCの接続状態を確認します。"),
            FN("get_discord_guilds", "参加しているDiscordサーバー一覧を取得します。"),
            FN(
                "get_discord_guild",
                "Discordサーバーの詳細情報を取得します。",
                O(
                    {
                        "guild_id": S(types.Type.STRING),
                        "timeout": S(types.Type.INTEGER),
                    },
                    required=["guild_id"],
                ),
            ),
            FN(
                "get_discord_channels",
                "サーバー内のチャンネル一覧を取得します。",
                O({"guild_id": S(types.Type.STRING)}, required=["guild_id"]),
            ),
            FN(
                "get_discord_channel",
                "チャンネル詳細を取得します。",
                O({"channel_id": S(types.Type.STRING)}, required=["channel_id"]),
            ),
            FN("get_discord_voice_settings", "Discordのボイス設定を取得します。"),
            FN(
                "set_discord_voice_settings",
                "Discordのボイス設定を変更します。",
                O(
                    {
                        "input": O(
                            {
                                "device_id": S(types.Type.STRING),
                                "volume": S(types.Type.NUMBER),
                                "available_devices": A(O({"id": S(types.Type.STRING), "name": S(types.Type.STRING)})),
                            }
                        ),
                        "output": O(
                            {
                                "device_id": S(types.Type.STRING),
                                "volume": S(types.Type.NUMBER),
                                "available_devices": A(O({"id": S(types.Type.STRING), "name": S(types.Type.STRING)})),
                            }
                        ),
                        "mode": O(
                            {
                                "type": S(types.Type.STRING),
                                "auto_threshold": S(types.Type.BOOLEAN),
                                "threshold": S(types.Type.NUMBER),
                                "shortcut": A(
                                    O(
                                        {
                                            "type": S(types.Type.INTEGER),
                                            "code": S(types.Type.INTEGER),
                                            "name": S(types.Type.STRING),
                                        }
                                    )
                                ),
                                "delay": S(types.Type.NUMBER),
                            }
                        ),
                        "automatic_gain_control": S(types.Type.BOOLEAN),
                        "echo_cancellation": S(types.Type.BOOLEAN),
                        "noise_suppression": S(types.Type.BOOLEAN),
                        "qos": S(types.Type.BOOLEAN),
                        "silence_warning": S(types.Type.BOOLEAN),
                        "deaf": S(types.Type.BOOLEAN),
                        "mute": S(types.Type.BOOLEAN),
                    }
                ),
            ),
            FN(
                "get_discord_voice_channel",
                "現在のボイスチャンネルを取得します。",
            ),
            FN(
                "select_discord_voice_channel",
                "Discordのボイスチャンネルに参加または退出します。",
                O(
                    {
                        "channel_id": S(types.Type.STRING),
                        "timeout": S(types.Type.INTEGER),
                        "force": S(types.Type.BOOLEAN),
                        "navigate": S(types.Type.BOOLEAN),
                    }
                ),
            ),
            FN(
                "select_discord_text_channel",
                "Discordのテキストチャンネルを表示します。",
                O({"channel_id": S(types.Type.STRING), "timeout": S(types.Type.INTEGER)}, required=["channel_id"]),
            ),
            FN(
                "set_discord_user_voice_settings",
                "ユーザーごとのボイス設定を変更します。",
                O(
                    {
                        "user_id": S(types.Type.STRING),
                        "volume": S(types.Type.INTEGER),
                        "mute": S(types.Type.BOOLEAN),
                        "pan": O({"left": S(types.Type.NUMBER), "right": S(types.Type.NUMBER)}),
                    },
                    required=["user_id"],
                ),
            ),
            FN(
                "set_discord_activity",
                "Discord Rich Presence を更新します。",
                O(
                    {
                        "pid": S(types.Type.INTEGER),
                        "activity": O(
                            {
                                "state": S(types.Type.STRING),
                                "state_url": S(types.Type.STRING),
                                "details": S(types.Type.STRING),
                                "details_url": S(types.Type.STRING),
                                "timestamps": O(
                                    {
                                        "start": S(types.Type.INTEGER),
                                        "end": S(types.Type.INTEGER),
                                    }
                                ),
                                "assets": O(
                                    {
                                        "large_image": S(types.Type.STRING),
                                        "large_text": S(types.Type.STRING),
                                        "large_url": S(types.Type.STRING),
                                        "small_image": S(types.Type.STRING),
                                        "small_text": S(types.Type.STRING),
                                        "small_url": S(types.Type.STRING),
                                    }
                                ),
                                "party": O(
                                    {
                                        "id": S(types.Type.STRING),
                                        "size": A(S(types.Type.INTEGER)),
                                    }
                                ),
                                "secrets": O(
                                    {
                                        "join": S(types.Type.STRING),
                                        "spectate": S(types.Type.STRING),
                                        "match": S(types.Type.STRING),
                                    }
                                ),
                                "instance": S(types.Type.BOOLEAN),
                                "type": S(types.Type.INTEGER),
                                "application_id": S(types.Type.STRING),
                                "name": S(types.Type.STRING),
                            },
                        ),
                    }
                ),
            ),
            FN(
                "discord_activity_join_invite",
                "Activity Join 招待を承諾します。",
                O({"user_id": S(types.Type.STRING)}, required=["user_id"]),
            ),
            FN(
                "discord_activity_close_request",
                "Activity Join リクエストを拒否します。",
                O({"user_id": S(types.Type.STRING)}, required=["user_id"]),
            ),
            FN(
                "subscribe_discord_event",
                "Discordイベントの購読を開始します。",
                O(
                    {
                        "evt": S(types.Type.STRING),
                        "args": types.Schema(type=types.Type.OBJECT),
                    },
                    required=["evt"],
                ),
            ),
            FN(
                "unsubscribe_discord_event",
                "Discordイベントの購読を解除します。",
                O(
                    {
                        "evt": S(types.Type.STRING),
                        "args": types.Schema(type=types.Type.OBJECT),
                    },
                    required=["evt"],
                ),
            ),
            FN(
                "discord_command",
                "任意の Discord RPC コマンドを送信します。SET_CERTIFIED_DEVICES なども送れます。",
                O(
                    {
                        "cmd": S(types.Type.STRING),
                        "args": types.Schema(type=types.Type.OBJECT),
                        "evt": S(types.Type.STRING),
                    },
                    required=["cmd"],
                ),
            ),
            FN(
                "resolve_reference",
                "曖昧な名前をIDやパスに解決します。あのチャンネル、いつものゲーム、作業フォルダなどに使います。",
                O(
                    {
                        "query": S(types.Type.STRING, description="解決したい曖昧な名前"),
                        "kind": S(types.Type.STRING, description="discord_channel, app_path, file_path, any など"),
                        "limit": S(types.Type.INTEGER, description="返す候補数"),
                    },
                    required=["query"],
                ),
            ),
            FN(
                "list_reference_aliases",
                "登録済みの別名一覧を取得します。",
                O(
                    {
                        "kind": S(types.Type.STRING, description="対象の種類。未指定なら全件"),
                    }
                ),
            ),
            FN(
                "add_reference_alias",
                "曖昧な名前と実体(IDやパス)の対応を追加または更新します。",
                O(
                    {
                        "kind": S(types.Type.STRING, description="discord_channel, app_path, file_path など"),
                        "alias": S(types.Type.STRING, description="別名。例: あのチャンネル"),
                        "value": S(types.Type.STRING, description="実体。例: 1234567890 や C:\\Games\\Game.exe"),
                        "metadata": types.Schema(type=types.Type.OBJECT, description="任意メタデータ"),
                        "overwrite": S(types.Type.BOOLEAN, description="同名があれば上書きするか"),
                    },
                    required=["kind", "alias", "value"],
                ),
            ),
            FN(
                "delete_reference_alias",
                "登録済みの別名を削除します。",
                O(
                    {
                        "kind": S(types.Type.STRING, description="種類"),
                        "alias": S(types.Type.STRING, description="削除する別名"),
                    },
                    required=["kind", "alias"],
                ),
            ),
            FN(
                "control_light",
                "部屋の照明を操作します。4=全灯, 3=エコ, 2=常夜灯, 1=消灯",
                O(
                    {
                        "mode": S(types.Type.INTEGER, description="1=消灯, 2=常夜灯, 3=エコ, 4=全灯"),
                    },
                    required=["mode"],
                ),
            ),
        ]
    )
]


def get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not set")
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


TOOL_REGISTRY: dict[str, Callable[[RequestContext, dict[str, Any]], Awaitable[Any]]] = {
    "get_system_summary": lambda ctx, args: api_request("GET", "system"),
    "get_os_info": lambda ctx, args: api_request("GET", "system/os"),
    "get_uptime": lambda ctx, args: api_request("GET", "system/uptime"),
    "get_users": lambda ctx, args: api_request("GET", "system/users"),
    "get_battery": lambda ctx, args: api_request("GET", "system/battery"),

    "get_cpu_info": lambda ctx, args: api_request("GET", "hardware/cpu"),
    "get_memory_info": lambda ctx, args: api_request("GET", "hardware/memory"),
    "get_disks_info": lambda ctx, args: api_request("GET", "hardware/disks"),
    "get_network_info": lambda ctx, args: api_request("GET", "hardware/network"),

    "get_processes": lambda ctx, args: api_request("GET", "processes"),
    "kill_process": lambda ctx, args: api_request("DELETE", "processes", params=args),
    "get_startup_programs": lambda ctx, args: api_request("GET", "processes/startup"),
    "get_active_window": lambda ctx, args: api_request("GET", "processes/active-window"),

    "shutdown_pc": lambda ctx, args: api_request("POST", "control/shutdown"),
    "reboot_pc": lambda ctx, args: api_request("POST", "control/reboot"),
    "sleep_pc": lambda ctx, args: api_request("POST", "control/sleep"),
    "lock_pc": lambda ctx, args: api_request("POST", "control/lock"),
    "logout_pc": lambda ctx, args: api_request("POST", "control/logout"),
    "execute_command": lambda ctx, args: api_request("POST", "control/execute", json_body=args),
    "launch_app": lambda ctx, args: api_request("POST", "control/launch", json_body=args),

    "mouse_move": lambda ctx, args: api_request("POST", "input/mouse/move", json_body=args),
    "mouse_click": lambda ctx, args: api_request("POST", "input/mouse/click", json_body=args),
    "mouse_scroll": lambda ctx, args: api_request("POST", "input/mouse/scroll", json_body=args),
    "keyboard_type": lambda ctx, args: api_request("POST", "input/keyboard/type", json_body=args),
    "keyboard_shortcut": lambda ctx, args: api_request("POST", "input/keyboard/shortcut", json_body=args),
    "input_media": lambda ctx, args: api_request("POST", "input/media", json_body=args),

    "list_files": lambda ctx, args: api_request("GET", "files/list", params=args),
    "move_file": lambda ctx, args: api_request("POST", "files/move", json_body=args),
    "copy_file": lambda ctx, args: api_request("POST", "files/copy", json_body=args),
    "delete_file": lambda ctx, args: api_request("DELETE", "files", params=args),
    "rename_file": lambda ctx, args: api_request("POST", "files/rename", json_body=args),
    "upload_files": lambda ctx, args: upload_files(args),
    "download_file": lambda ctx, args: download_file(args),

    "get_screenshot": lambda ctx, args: api_request("GET", "utils/screenshot"),
    "get_clipboard": lambda ctx, args: api_request("GET", "utils/clipboard"),
    "set_clipboard": lambda ctx, args: api_request("POST", "utils/clipboard", json_body=args),
    "notify": lambda ctx, args: api_request("POST", "utils/notify", json_body=args),

    "get_discord_status": lambda ctx, args: api_request("GET", "discord/status"),
    "get_discord_guilds": lambda ctx, args: api_request("GET", "discord/guilds"),
    "get_discord_guild": lambda ctx, args: api_request(
        "GET",
        f"discord/guilds/{args.get('guild_id')}",
        params={"timeout": args["timeout"]} if args.get("timeout") is not None else None,
    ),
    "get_discord_channels": lambda ctx, args: api_request("GET", f"discord/guilds/{args.get('guild_id')}/channels"),
    "get_discord_channel": lambda ctx, args: api_request("GET", f"discord/channels/{args.get('channel_id')}"),
    "get_discord_voice_settings": lambda ctx, args: api_request("GET", "discord/voice/settings"),
    "set_discord_voice_settings": lambda ctx, args: api_request("POST", "discord/voice/settings", json_body=args),

    "get_discord_voice_channel": lambda ctx, args: api_request("GET", "discord/voice/channel"),
    "select_discord_voice_channel": lambda ctx, args: api_request("POST", "discord/voice/channel", json_body=args),
    "select_discord_text_channel": lambda ctx, args: api_request("POST", "discord/text/channel", json_body=args),
    "set_discord_user_voice_settings": lambda ctx, args: api_request("POST", "discord/voice/user-settings", json_body=args),

    "set_discord_activity": lambda ctx, args: api_request("POST", "discord/activity", json_body=args),
    "discord_activity_join_invite": lambda ctx, args: api_request("POST", "discord/activity/join-invite", json_body=args),
    "discord_activity_close_request": lambda ctx, args: api_request("POST", "discord/activity/close-request", json_body=args),
    "subscribe_discord_event": lambda ctx, args: api_request("POST", "discord/subscribe", json_body=args),
    "unsubscribe_discord_event": lambda ctx, args: api_request("POST", "discord/unsubscribe", json_body=args),
    "discord_command": lambda ctx, args: discord_command(args),

    "resolve_reference": lambda ctx, args: resolve_reference(args),
    "list_reference_aliases": lambda ctx, args: list_reference_aliases(args),
    "add_reference_alias": lambda ctx, args: add_reference_alias(args),
    "delete_reference_alias": lambda ctx, args: delete_reference_alias(args),

    "control_light": lambda ctx, args: control_light(args),
}


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [to_jsonable(v) for v in value]
    if isinstance(value, set):
        return [to_jsonable(v) for v in value]
    if isinstance(value, BaseModel):
        return to_jsonable(value.model_dump())
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def build_generation_config() -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=TOOL_DEFINITIONS,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=TEMPERATURE,
    )


async def call_ai(contents: list[Any]) -> tuple[AIResult, Any]:
    def _sync_generate() -> Any:
        client = get_gemini_client()
        return client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=build_generation_config(),
        )

    response = await asyncio.to_thread(_sync_generate)

    function_calls = list(getattr(response, "function_calls", []) or [])
    tool_calls: list[ToolCall] = []

    for fc in function_calls:
        args = getattr(fc, "args", {}) or {}
        tool_calls.append(
            ToolCall(
                name=getattr(fc, "name", ""),
                arguments=dict(args),
                call_id=getattr(fc, "id", None),
            )
        )

    if tool_calls:
        return AIResult(final=False, tool_calls=tool_calls), response

    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return AIResult(final=True, answer=text.strip()), response

    raise HTTPException(status_code=500, detail="Gemini response did not contain text or function calls")


async def run_ai_loop(user_message: str, ctx: RequestContext) -> str:
    contents: list[Any] = [
        types.Content(
            role="user",
            parts=[types.Part(text=user_message)],
        )
    ]

    for turn in range(1, MAX_AI_TURNS + 1):
        ai_out, response = await call_ai(contents)

        if ai_out.final:
            if not ai_out.answer:
                raise HTTPException(status_code=500, detail="AI returned final=true but answer was empty")
            ctx.trace.append({"turn": turn, "type": "final"})
            return ai_out.answer

        if not ai_out.tool_calls:
            raise HTTPException(status_code=500, detail="AI did not return tool calls")

        model_content = response.candidates[0].content if getattr(response, "candidates", None) else None
        if model_content is not None:
            contents.append(model_content)

        for tool_call in ai_out.tool_calls:
            if tool_call.name not in TOOL_REGISTRY:
                raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_call.name}")

            result = await TOOL_REGISTRY[tool_call.name](ctx, tool_call.arguments)
            res_keys = list(result.keys()) if isinstance(result, dict) else []
            ctx.trace.append({"turn": turn, "tool": tool_call.name, "result_keys": res_keys})

            function_response_part = types.Part.from_function_response(
                name=tool_call.name,
                response={"result": to_jsonable(result)},
            )
            contents.append(
                types.Content(
                    role="user",
                    parts=[function_response_part],
                )
            )

    raise HTTPException(status_code=409, detail="AI loop exceeded max turns")


@app.post("/message", response_model=MessageResponse)
async def message(req: MessageRequest) -> MessageResponse:
    ctx = RequestContext()
    answer = await run_ai_loop(req.message, ctx)
    return MessageResponse(answer=answer, trace=ctx.trace)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
