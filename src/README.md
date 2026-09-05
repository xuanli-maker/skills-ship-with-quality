# Mergington High School Activities API

A FastAPI application that allows students to view and sign up for
extracurricular activities, and lets teachers log in to manage them.
Activity and teacher data is persisted in MongoDB.

## Features

- View all available extracurricular activities, with optional filtering by day/time
- Sign up for or unregister from an activity
- Teacher login/session check for managing activities

## API Endpoints

| Method | Endpoint                                                              | Description                                                                |
| ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/activities`                                                         | Get all activities, optionally filtered by `day`, `start_time`, `end_time` |
| GET    | `/activities/days`                                                    | Get the list of distinct days activities are offered                       |
| POST   | `/activities/{activity_name}/signup?email=student@mergington.edu`     | Sign up for an activity                                                    |
| POST   | `/activities/{activity_name}/unregister?email=student@mergington.edu` | Remove a student from an activity                                          |
| POST   | `/auth/login?username=...&password=...`                               | Log in a teacher account                                                   |
| GET    | `/auth/check-session?username=...`                                    | Check whether a teacher session is valid                                   |

## How to Run the App

Prerequisites:

- Python 3 with dependencies from the repo root: `pip install -r requirements.txt`
- A MongoDB instance reachable at `mongodb://localhost:27017/` (the
  [devcontainer](../.devcontainer) installs and starts this automatically via
  `installMongoDB.sh` / `startMongoDB.sh`)

Since the app uses relative imports (`src/app.py` imports from `.backend`), it
must be started as a module with `uvicorn`, run from the **repository root**:

```
uvicorn src.app:app --reload
```

Then open your browser to:

- The app: http://localhost:8000
- API docs: http://localhost:8000/docs
- Alternative docs: http://localhost:8000/redoc

## How to Develop the App

The backend lives in `src/backend/` (routers in `src/backend/routers/`,
MongoDB access in `src/backend/database.py`), and the static front-end
(HTML/CSS/JS) lives in `src/static/`.

### Python (backend) tests

1. Install the test dependencies (from the repository root):

   ```
   pip install -r requirements.txt
   pip install -r requirements.dev.txt
   ```

2. Run the tests with `pytest`:

   ```
   pytest
   ```

   To include coverage output, run:

   ```
   pytest --cov=src --cov-report=xml:coverage/coverage-python.xml
   ```

3. Alternatively, in VS Code, open a test file under `tests/` and use the
   **Run Test** / **Debug Test** CodeLens links above each test function, or
   run tests from the **Testing** panel in the sidebar.

### JavaScript (front-end) tests

1. Install the dependencies (from the repository root):

   ```
   npm install
   ```

2. Run the tests with Jest:

   ```
   npx jest
   ```

   Coverage is collected automatically on every run (see `collectCoverage` in
   `jest.config.js`) and written to `coverage/coverage-javascript.xml`, with a
   text summary printed to the console.
