"""
Tests for src/app.py

The application module uses relative imports (`from .backend import ...`),
so it must be imported as part of the `src` package (an implicit namespace
package) rather than as a standalone top-level module.
"""

from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

# Import the database module first so its collections can be replaced with
# fakes before `src.app` triggers `database.init_database()` at import time.
import src.backend.database as database  # noqa: E402


class FakeInsertCollection:
    def __init__(self, existing_count: int = 0):
        self._existing_count = existing_count
        self.inserted = []

    def count_documents(self, query: dict):
        return self._existing_count

    def insert_one(self, document: dict):
        self.inserted.append(document)

    def find(self, query: dict):
        return []


database.activities_collection = FakeInsertCollection(existing_count=1)
database.teachers_collection = FakeInsertCollection(existing_count=1)

import src.app as app_module  # noqa: E402

# Patch the routers/collections for mocking
import src.backend.routers.activities as activities_router  # noqa: E402
import src.backend.routers.auth as auth_router  # noqa: E402

activities_router.activities_collection = database.activities_collection
activities_router.teachers_collection = database.teachers_collection
auth_router.teachers_collection = database.teachers_collection

from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(app_module.app, follow_redirects=False)


def test_root_redirects_to_static_index():
    # Description: This test verifies the root endpoint redirects to the static index page.

    # Act
    response = client.get("/")

    # Assert
    assert response.status_code in (302, 307)
    assert response.headers["location"] == "/static/index.html"


def test_static_index_is_served():
    # Description: This test verifies the mounted static files directory serves index.html.

    # Act
    response = client.get("/static/index.html")

    # Assert
    assert response.status_code == 200


def test_activities_router_is_registered():
    # Description: This test verifies the activities router is included in the app.

    # Act
    response = client.get("/activities")

    # Assert
    assert response.status_code == 200
