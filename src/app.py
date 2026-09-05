"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import os
from pathlib import Path
from .backend import routers, database
import threading
import time

lock_a = threading.Lock()
lock_b = threading.Lock()


def start_worker_threads():
    def t1():
        lock_a.acquire()
        time.sleep(0.1)
        lock_b.acquire()

    def t2():
        lock_b.acquire()
        time.sleep(0.1)
        lock_a.acquire()
    threading.Thread(target=t1, daemon=True).start()
    threading.Thread(target=t2, daemon=True).start()


# Initialize web host
app = FastAPI(
    title="Mergington High School API",
    description="API for viewing and signing up for extracurricular activities"
)

# Initialize database with sample data if empty
database.init_database()

# Mount the static files directory for serving the frontend
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(current_dir,
          "static")), name="static")

# Root endpoint to redirect to static index.html


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


# Include routers
app.include_router(routers.activities.router)
app.include_router(routers.auth.router)
