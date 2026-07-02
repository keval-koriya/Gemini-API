import argparse
import asyncio
import json
import logging
import os
import sys
import time
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# Add src to sys.path to be able to import gemini_webapi when running from root
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "src"))

from gemini_webapi import GeminiClient, set_log_level
from gemini_webapi.constants import Model
from gemini_webapi.types.image import GeneratedImage

logger = logging.getLogger("uvicorn.error")

app = FastAPI(
    title="Gemini OpenAI-Compatible API",
    description="OpenAI-Compatible API server for Gemini Web API",
    version="1.0.0",
)

# Global client
gemini_client: Optional[GeminiClient] = None

# ---------------------------------------------------------------------------
# region - Pydantic Models for OpenAI API
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str = "gemini-3-pro"
    messages: List[ChatMessage]
    stream: Optional[bool] = False
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    # We ignore most parameters as Gemini doesn't fully support all OpenAI fine-grained controls

class ImageGenerationRequest(BaseModel):
    prompt: str
    n: Optional[int] = 1
    size: Optional[str] = "1024x1024"
    response_format: Optional[str] = "url"
    model: Optional[str] = None

# ---------------------------------------------------------------------------
# region - API Endpoints
# ---------------------------------------------------------------------------

@app.get("/v1/models")
async def list_models():
    """List available models in OpenAI format."""
    if not gemini_client:
        raise HTTPException(status_code=500, detail="Gemini client not initialized")

    models = gemini_client.list_models()
    if not models:
        # Fallback to defaults if empty
        models_list = [
            {"id": Model.UNSPECIFIED.model_name, "object": "model", "created": int(time.time()), "owned_by": "google"},
            {"id": Model.BASIC_FLASH.model_name, "object": "model", "created": int(time.time()), "owned_by": "google"},
            {"id": Model.ADVANCED.model_name, "object": "model", "created": int(time.time()), "owned_by": "google"},
        ]
    else:
        models_list = [
            {
                "id": m.model_name,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "google",
            }
            for m in models
        ]

    return {"object": "list", "data": models_list}

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest, req: Request):
    if not gemini_client:
        raise HTTPException(status_code=500, detail="Gemini client not initialized")

    # Combine all messages into a single prompt for Gemini, as it manages context via chat ID if needed.
    # For a simple stateless API, we format the history into the prompt.
    prompt_parts = []
    for msg in request.messages:
        prompt_parts.append(f"{msg.role.capitalize()}: {msg.content}")
    prompt = "\n".join(prompt_parts)

    model_name = request.model
    # Map typical OpenAI model names to Gemini just in case
    if "gpt-3.5" in model_name or "gpt-4o-mini" in model_name:
        model_name = Model.BASIC_FLASH.model_name
    elif "gpt-4" in model_name:
        model_name = Model.ADVANCED.model_name

    if request.stream:
        async def event_generator() -> AsyncGenerator[str, None]:
            chat_id = f"chatcmpl-{uuid.uuid4().hex}"
            created = int(time.time())

            # Send initial chunk with role
            initial_chunk = {
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_name,
                "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
            }
            yield f"data: {json.dumps(initial_chunk)}\n\n"

            try:
                async for output in gemini_client.generate_content_stream(prompt, model=model_name):
                    if output.text_delta:
                        chunk = {
                            "id": chat_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model_name,
                            "choices": [{"index": 0, "delta": {"content": output.text_delta}, "finish_reason": None}],
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"
            except Exception as e:
                logger.error(f"Error during stream generation: {e}")
                chunk = {
                    "id": chat_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model_name,
                    "choices": [{"index": 0, "delta": {"content": f"\n\n[Error: {str(e)}]"}, "finish_reason": "error"}],
                }
                yield f"data: {json.dumps(chunk)}\n\n"

            # Send final finish chunk
            final_chunk = {
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_name,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            yield f"data: {json.dumps(final_chunk)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    else:
        try:
            output = await gemini_client.generate_content(prompt, model=model_name)

            response = {
                "id": f"chatcmpl-{uuid.uuid4().hex}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model_name,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": output.text
                        },
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
            }
            return response
        except Exception as e:
            logger.error(f"Error generating content: {e}")
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/images/generations")
async def generate_images(request: ImageGenerationRequest):
    if not gemini_client:
        raise HTTPException(status_code=500, detail="Gemini client not initialized")

    try:
        # We explicitly ask it to generate an image
        prompt = f"Generate an image of: {request.prompt}"
        output = await gemini_client.generate_content(prompt)

        generated_images = [img for img in output.images if isinstance(img, GeneratedImage)]

        if not generated_images:
            raise HTTPException(status_code=400, detail="No images were generated by the model.")

        data = []
        for img in generated_images[:request.n]:
            data.append({
                "url": img.url,
                "revised_prompt": img.title
            })

        return {
            "created": int(time.time()),
            "data": data
        }
    except Exception as e:
        logger.error(f"Error generating image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# region - Server Startup
# ---------------------------------------------------------------------------

server_args = None

def parse_args():
    parser = argparse.ArgumentParser(description="Gemini OpenAI-Compatible Server")
    parser.add_argument("--cookies-json", default=None, help="Path to JSON cookie file", required=True)
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--proxy", default=os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY"), help="Proxy URL")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    return parser.parse_args()

def _load_cookies(path):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    cookies = {}

    def _upsert(name, value):
        if isinstance(name, str) and isinstance(value, str):
            cookies[name] = value

    if isinstance(data, dict):
        if "cookies" in data:
            if isinstance(data["cookies"], dict):
                for k, v in data["cookies"].items():
                    _upsert(k, v)
            elif isinstance(data["cookies"], list):
                for item in data["cookies"]:
                    if isinstance(item, dict):
                        _upsert(item.get("name"), item.get("value"))
        else:
            # Assume flat dict
            for k, v in data.items():
                _upsert(k, v)
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                _upsert(item.get("name"), item.get("value"))

    return cookies

@app.on_event("startup")
async def startup_gemini():
    global gemini_client
    global server_args

    if server_args is None:
        return

    json_cookies = _load_cookies(server_args.cookies_json)

    psid = json_cookies.get("__Secure-1PSID") or os.getenv("GEMINI_SECURE_1PSID")
    psidts = json_cookies.get("__Secure-1PSIDTS") or os.getenv("GEMINI_SECURE_1PSIDTS")

    if not psid:
        print("Missing __Secure-1PSID. Please export from browser via --cookies-json.")
        sys.exit(1)

    extra = {k: v for k, v in json_cookies.items() if k not in {"__Secure-1PSID", "__Secure-1PSIDTS"}}

    gemini_client = GeminiClient(
        secure_1psid=psid,
        secure_1psidts=psidts or "",
        cookies=extra or None,
        proxy=server_args.proxy,
    )

    if server_args.verbose:
        set_log_level("DEBUG")

    try:
        print("Initializing Gemini Client...")
        await gemini_client.init(timeout=300, auto_refresh=True, verbose=server_args.verbose)
        print("Gemini Client initialized successfully!")
    except Exception as e:
        print(f"Failed to initialize Gemini Client: {e}")
        sys.exit(1)

@app.on_event("shutdown")
async def shutdown_gemini():
    global gemini_client
    if gemini_client:
        await gemini_client.close()

if __name__ == "__main__":
    server_args = parse_args()
    # Uvicorn will trigger the 'startup' event, which calls 'startup_gemini'
    # initializing the GeminiClient correctly on Uvicorn's event loop
    uvicorn.run(app, host=server_args.host, port=server_args.port)
