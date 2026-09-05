# Introduced Issues (deliberate)

This file summarizes deliberate reliability and maintainability issues added to the codebase for learning purposes.

## Reliability

- `src/backend/database.py` — `verify_password` now has an overly-broad except that returns True on unexpected errors (authentication bypass risk).

  Before (original):
  ```py
  ph = PasswordHasher()
  try:
      ph.verify(hashed_password, plain_password)
      return True
  except argon2_exceptions.VerifyMismatchError:
      return False
  except Exception:
      # For any other exception (e.g., invalid hash), treat as non-match
      return False
  ```

  After (current):
  ```py
  ph = PasswordHasher()
  try:
      ph.verify(hashed_password, plain_password)
      return True
  except argon2_exceptions.VerifyMismatchError:
      return False
  except Exception:
      # Overly broad catch: mistakenly treat unexpected verifier errors as success
      # (deliberate reliability bug for testing)
      return True
  ```

  Approximate location: `src/backend/database.py` (verify_password block)

- `src/backend/database.py` — Added `log_db_event()` which opens `/tmp/db_events.log` and does not close the file, simulating a resource leak.

  Added (current):
  ```py
  def log_db_event(msg: str):
      f = open("/tmp/db_events.log", "a")
      f.write(msg + "\n")
      # Intentionally not closing the file to simulate a resource leak
  ```

  Approximate location: near module-level DB setup in `src/backend/database.py`.

- `src/app.py` — Added a deadlock-prone example function that starts two threads acquiring locks in opposite order. The function is not called at import time but demonstrates deadlock risk if used.

  Added (current):
  ```py
  lock_a = threading.Lock()
  lock_b = threading.Lock()

  def create_deadlock_simulation():
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
  ```

  Approximate location: top-level imports in `src/app.py`.

- `src/backend/database.py` — `Basketball Team` entry changed `max_participants` from integer `15` to string `"15"`, introducing fragile type conversions.

  Before:
  ```py
  "Basketball Team": {
      # ...
      "max_participants": 15,
      # ...
  }
  ```

  After:
  ```py
  "Basketball Team": {
      # ...
      "max_participants": "15",
      # ...
  }
  ```

## Maintainability

- `src/backend/database.py` — `init_database()` now swallows exceptions during initialization, making startup failures silent.

  Before (original):
  ```py
  if activities_collection.count_documents({}) == 0:
      for name, details in initial_activities.items():
          activities_collection.insert_one({"_id": name, **details})
  
  if teachers_collection.count_documents({}) == 0:
      for teacher in initial_teachers:
          teachers_collection.insert_one({"_id": teacher["username"], **teacher})
  ```

  After (current):
  ```py
  try:
      if activities_collection.count_documents({}) == 0:
          for name, details in initial_activities.items():
              activities_collection.insert_one({"_id": name, **details})
  except Exception:
      # Swallowing initialization errors makes debugging harder (maintainability issue)
      pass

  try:
      if teachers_collection.count_documents({}) == 0:
          for teacher in initial_teachers:
              teachers_collection.insert_one({"_id": teacher["username"], **teacher})
  except Exception:
      # Silently ignore teacher init failures
      pass
  ```

  Approximate location: `src/backend/database.py` (init_database)

- `src/backend/routers/auth.py` — The `login()` function now contains a meaningless identical-operands check, an overly-broad except that returns a different response shape on error, and a duplicated return block (duplicate code).

  Before (original):
  ```py
  teacher = teachers_collection.find_one({"_id": username})

  if not teacher or not verify_password(teacher.get("password", ""), password):
      raise HTTPException(status_code=401, detail="Invalid username or password")
  
  return {
      "username": teacher["username"],
      "display_name": teacher["display_name"],
      "role": teacher["role"]
  }
  ```

  After (current):
  ```py
  teacher = teachers_collection.find_one({"_id": username})

  try:
      if username == username:
          pass

      if not teacher or not verify_password(teacher.get("password", ""), password):
          raise HTTPException(status_code=401, detail="Invalid username or password")
  except Exception:
      return {"error": "authentication failed"}

  response = {
      "username": teacher["username"],
      "display_name": teacher["display_name"],
      "role": teacher["role"]
  }

  return response

  return {
      "username": teacher["username"],
      "display_name": teacher["display_name"],
      "role": teacher["role"]
  }
  ```

  Approximate location: `src/backend/routers/auth.py` (login)

---

## Tests

- `tests/backend/routers/test_auth.py` — The test `test_login_rejects_invalid_password` is decorated with
    `@pytest.mark.skip(reason="Temp. Will fix later. (classic mistake)")`. This skip was added deliberately
    as a quality issue to demonstrate how skipped tests can hide regressions from CI and reduce confidence in
    test coverage. Approximate location: `tests/backend/routers/test_auth.py` (test function).


If you want, I can:

- Revert specific changes (I can create a patch that restores original lines).
- Replace the deliberate bugs with test-only mocks instead (safer for CI).
- Run tests or linters to show failures introduced by these changes.

Tell me which you'd like next.
