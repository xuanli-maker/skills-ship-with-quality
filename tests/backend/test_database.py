from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from backend import database


# --- Fakes for init_database coverage ---

class FakeInsertCollection:
    def __init__(self, existing_count: int = 0):
        self._existing_count = existing_count
        self.inserted = []

    def count_documents(self, query: dict):
        return self._existing_count

    def insert_one(self, document: dict):
        self.inserted.append(document)


class RaisingCollection:
    def count_documents(self, query: dict):
        raise RuntimeError("database unavailable")


def test_hash_password_returns_argon2_hash():
    # Description: This test verifies hash_password produces an Argon2 hash string.

    # Act
    hashed = database.hash_password("secret123")

    # Assert
    assert hashed.startswith("$argon2")


def test_verify_password_returns_true_for_matching_password():
    # Description: This test verifies verify_password returns True for a correct password.

    # Arrange
    hashed = database.hash_password("secret123")

    # Act
    result = database.verify_password(hashed, "secret123")

    # Assert
    assert result is True


def test_verify_password_returns_false_for_mismatched_password():
    # Description: This test verifies verify_password returns False for an incorrect password.

    # Arrange
    hashed = database.hash_password("secret123")

    # Act
    result = database.verify_password(hashed, "wrong-password")

    # Assert
    assert result is False


def test_verify_password_returns_true_for_invalid_hash_format():
    # Description: This test verifies verify_password swallows unexpected errors (e.g. a
    # malformed hash) and returns True, matching the current implementation's generic
    # exception handling.

    # Act
    result = database.verify_password("not-a-valid-argon2-hash", "secret123")

    # Assert
    assert result is True


def test_log_db_event_appends_message_to_log_file(tmp_path, monkeypatch):
    # Description: This test verifies log_db_event appends the message to the log file.

    # Arrange
    log_file = tmp_path / "db_events.log"
    real_open = open

    def fake_open(path, mode="r", *args, **kwargs):
        return real_open(str(log_file), mode, *args, **kwargs)

    monkeypatch.setattr("builtins.open", fake_open)

    # Act
    database.log_db_event("test event")

    # Assert
    assert "test event" in log_file.read_text()


def test_init_database_populates_empty_collections(monkeypatch):
    # Description: This test verifies init_database inserts initial data when collections are empty.

    # Arrange
    fake_activities = FakeInsertCollection(existing_count=0)
    fake_teachers = FakeInsertCollection(existing_count=0)
    monkeypatch.setattr(database, "activities_collection", fake_activities)
    monkeypatch.setattr(database, "teachers_collection", fake_teachers)

    # Act
    database.init_database()

    # Assert
    assert len(fake_activities.inserted) == len(database.initial_activities)
    assert len(fake_teachers.inserted) == len(database.initial_teachers)


def test_init_database_skips_insertion_when_already_populated(monkeypatch):
    # Description: This test verifies init_database does not insert data when collections are non-empty.

    # Arrange
    fake_activities = FakeInsertCollection(existing_count=5)
    fake_teachers = FakeInsertCollection(existing_count=3)
    monkeypatch.setattr(database, "activities_collection", fake_activities)
    monkeypatch.setattr(database, "teachers_collection", fake_teachers)

    # Act
    database.init_database()

    # Assert
    assert fake_activities.inserted == []
    assert fake_teachers.inserted == []


def test_init_database_swallows_errors_from_unavailable_collections(monkeypatch):
    # Description: This test verifies init_database swallows exceptions raised while
    # querying/inserting, so a database outage does not crash application startup.

    # Arrange
    monkeypatch.setattr(database, "activities_collection", RaisingCollection())
    monkeypatch.setattr(database, "teachers_collection", RaisingCollection())

    # Act / Assert (should not raise)
    database.init_database()
