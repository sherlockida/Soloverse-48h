"""SoloVerse (EchoWorld) -- FastAPI entry point.

Run via:  uvicorn app.main:app --reload --port 8000
"""

from app.api.app import create_app

app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
