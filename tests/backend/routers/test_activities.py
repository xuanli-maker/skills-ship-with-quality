from pathlib import Path
import sys
import copy
import pytest

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))

from backend.routers import activities as activities_router


class FakeUpdateResult:
    def __init__(self, modified_count: int):
        self.modified_count = modified_count


class FakeActivitiesCollection:
    def __init__(self, activities: dict):
        self.activities = activities

    def find(self, query: dict):
        values = list(self.activities.values())

        day_filter = query.get("schedule_details.days")
        if day_filter:
            target_day = day_filter["$in"][0]
            values = [
                activity
                for activity in values
                if target_day in activity["schedule_details"]["days"]
            ]

        end_time_filter = query.get("schedule_details.end_time")
        if end_time_filter:
            threshold = end_time_filter["$lte"]
            values = [
                activity
                for activity in values
                if activity["schedule_details"]["end_time"] < threshold
            ]

        start_time_filter = query.get("schedule_details.start_time")
        if start_time_filter:
            threshold = start_time_filter["$gte"]
            values = [
                activity
                for activity in values
                if activity["schedule_details"]["start_time"] >= threshold
            ]

        return [dict(activity) for activity in values]

    def find_one(self, query: dict):
        return self.activities.get(query.get("_id"))

    def update_one(self, query: dict, update: dict):
        activity = self.activities.get(query.get("_id"))
        if not activity:
            return FakeUpdateResult(0)

        push_payload = update.get("$push")
        if push_payload:
            for key, value in push_payload.items():
                if key not in activity:
                    activity[key] = []
                activity[key].append(value)

        pull_payload = update.get("$pull")
        if pull_payload:
            for key, value in pull_payload.items():
                if key in activity and value in activity[key]:
                    activity[key].remove(value)

        return FakeUpdateResult(1)

    def aggregate(self, pipeline):
        days = set()
        for activity in self.activities.values():
            for day in activity["schedule_details"]["days"]:
                days.add(day)
        return [{"_id": day} for day in sorted(days)]


class FakeTeachersCollection:
    def __init__(self, teachers: dict):
        self.teachers = teachers

    def find_one(self, query: dict):
        return self.teachers.get(query.get("_id"))


def _create_test_client_for_activities(activities_data: dict, teachers_data: dict) -> TestClient:
    activities_router.activities_collection = FakeActivitiesCollection(activities_data)
    activities_router.teachers_collection = FakeTeachersCollection(teachers_data)

    app = FastAPI()
    app.include_router(activities_router.router)
    return TestClient(app)


def test_get_activities_filters_by_day():
    # Description: This test verifies the activities endpoint filters by day.

    # Arrange
    client = _create_test_client_for_activities(
        {
            "Chess Club": {
                "_id": "Chess Club",
                "participants": ["a@school.edu"],
                "max_participants": 12,
                "schedule_details": {
                    "days": ["Monday"],
                    "start_time": "15:15",
                    "end_time": "16:45",
                },
            },
            "Drama Club": {
                "_id": "Drama Club",
                "participants": ["b@school.edu"],
                "max_participants": 20,
                "schedule_details": {
                    "days": ["Tuesday"],
                    "start_time": "15:30",
                    "end_time": "17:30",
                },
            },
        },
        {"teacher1": {"_id": "teacher1"}},
    )

    # Act
    response = client.get("/activities", params={"day": "Monday"})

    # Assert
    assert response.status_code == 200
    payload = response.json()
    assert "Chess Club" in payload
    assert "Drama Club" not in payload

@pytest.mark.skip(reason="Temp. Will fix later. (classic mistake)")
def test_signup_returns_success_for_authenticated_teacher():
    # Description: This test verifies signup returns success for an authenticated teacher.

    # Arrange
    client = _create_test_client_for_activities(
        {
            "Chess Club": {
                "_id": "Chess Club",
                "participants": ["existing@school.edu"],
                "max_participants": 12,
                "schedule_details": {
                    "days": ["Monday"],
                    "start_time": "15:15",
                    "end_time": "16:45",
                },
            }
        },
        {"teacher1": {"_id": "teacher1"}},
    )

    # Act
    response = client.post(
        "/activities/Chess Club/signup",
        params={"email": "new@school.edu", "teacher_username": "teacher1"},
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["message"] == "Signed up new@school.edu for Chess Club"


def test_get_activities_applies_end_time_filter_for_general_cases():
    # Description: This test verifies the general end-time filter behavior for non-boundary values.

    # Arrange
    client = _create_test_client_for_activities(
        {
            "Chess Club": {
                "_id": "Chess Club",
                "participants": ["a@school.edu"],
                "max_participants": 12,
                "schedule_details": {
                    "days": ["Monday"],
                    "start_time": "15:15",
                    "end_time": "16:45",
                },
            },
            "Debate Team": {
                "_id": "Debate Team",
                "participants": ["b@school.edu"],
                "max_participants": 12,
                "schedule_details": {
                    "days": ["Friday"],
                    "start_time": "15:30",
                    "end_time": "17:30",
                },
            },
        },
        {"teacher1": {"_id": "teacher1"}},
    )

    # Act
    response = client.get("/activities", params={"end_time": "17:00"})

    # Assert
    assert response.status_code == 200
    payload = response.json()
    assert "Chess Club" in payload
    assert "Debate Team" not in payload


# --- Additional coverage: filtering, days list, signup, unregister ---

_CHESS_CLUB = {
    "_id": "Chess Club",
    "participants": ["existing@school.edu"],
    "max_participants": 12,
    "schedule_details": {
        "days": ["Monday"],
        "start_time": "15:15",
        "end_time": "16:45",
    },
}

_DEBATE_TEAM = {
    "_id": "Debate Team",
    "participants": ["b@school.edu"],
    "max_participants": 12,
    "schedule_details": {
        "days": ["Friday"],
        "start_time": "15:30",
        "end_time": "17:30",
    },
}


def test_get_activities_applies_start_time_filter():
    # Description: This test verifies the start-time filter excludes earlier activities.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB), "Debate Team": copy.deepcopy(_DEBATE_TEAM)},
        {"teacher1": {"_id": "teacher1"}},
    )

    # Act
    response = client.get("/activities", params={"start_time": "15:30"})

    # Assert
    assert response.status_code == 200
    payload = response.json()
    assert "Debate Team" in payload
    assert "Chess Club" not in payload


def test_get_available_days_returns_sorted_unique_days():
    # Description: This test verifies /activities/days returns the sorted, unique set of scheduled days.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB), "Debate Team": copy.deepcopy(_DEBATE_TEAM)},
        {"teacher1": {"_id": "teacher1"}},
    )

    # Act
    response = client.get("/activities/days")

    # Assert
    assert response.status_code == 200
    assert response.json() == ["Friday", "Monday"]


def test_signup_requires_teacher_username():
    # Description: This test verifies signup is rejected when no teacher_username is supplied.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Chess Club/signup", params={"email": "new@school.edu"}
    )

    # Assert
    assert response.status_code == 401


def test_signup_rejects_unknown_teacher():
    # Description: This test verifies signup is rejected for an unrecognized teacher_username.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Chess Club/signup",
        params={"email": "new@school.edu", "teacher_username": "unknown"},
    )

    # Assert
    assert response.status_code == 401


def test_signup_rejects_unknown_activity():
    # Description: This test verifies signup returns 404 for an activity that does not exist.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Unknown Club/signup",
        params={"email": "new@school.edu", "teacher_username": "teacher1"},
    )

    # Assert
    assert response.status_code == 404


def test_signup_succeeds_for_authenticated_teacher():
    # Description: This test verifies signup succeeds and adds the student for an authenticated teacher.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Chess Club/signup",
        params={"email": "new@school.edu", "teacher_username": "teacher1"},
    )

    # Assert
    assert response.status_code == 200
    assert response.json()["message"] == "Signed up new@school.edu for Chess Club"


def test_unregister_requires_teacher_username():
    # Description: This test verifies unregister is rejected when no teacher_username is supplied.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Chess Club/unregister",
        params={"email": "existing@school.edu"},
    )

    # Assert
    assert response.status_code == 401


def test_unregister_rejects_unknown_teacher():
    # Description: This test verifies unregister is rejected for an unrecognized teacher_username.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Chess Club/unregister",
        params={"email": "existing@school.edu", "teacher_username": "unknown"},
    )

    # Assert
    assert response.status_code == 401


def test_unregister_rejects_unknown_activity():
    # Description: This test verifies unregister returns 404 for an activity that does not exist.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Unknown Club/unregister",
        params={"email": "existing@school.edu", "teacher_username": "teacher1"},
    )

    # Assert
    assert response.status_code == 404


def test_unregister_rejects_student_not_registered():
    # Description: This test verifies unregister returns 400 when the student is not signed up.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Chess Club/unregister",
        params={"email": "not-signed-up@school.edu", "teacher_username": "teacher1"},
    )

    # Assert
    assert response.status_code == 400


def test_unregister_succeeds_for_authenticated_teacher():
    # Description: This test verifies unregister succeeds and removes the student for an authenticated teacher.

    # Arrange
    client = _create_test_client_for_activities(
        {"Chess Club": copy.deepcopy(_CHESS_CLUB)}, {"teacher1": {"_id": "teacher1"}}
    )

    # Act
    response = client.post(
        "/activities/Chess Club/unregister",
        params={"email": "existing@school.edu", "teacher_username": "teacher1"},
    )

    # Assert
    assert response.status_code == 200
    assert (
        response.json()["message"]
        == "Unregistered existing@school.edu from Chess Club"
    )
