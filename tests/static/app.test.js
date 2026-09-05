const fs = require("fs");
const path = require("path");

const INDEX_HTML_PATH = path.join(__dirname, "..", "..", "src", "static", "index.html");
const APP_JS_PATH = path.join(__dirname, "..", "..", "src", "static", "app.js");

// Flushes pending microtasks so async work inside app.js (fetch/json parsing) settles.
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Loads a fresh copy of the DOM and app.js, mocking fetch with the given activities/session data.
async function loadApp({ activities = {}, currentUser = null } = {}) {
  document.documentElement.innerHTML = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  window.localStorage.clear();
  if (currentUser) {
    window.localStorage.setItem("currentUser", JSON.stringify(currentUser));
  }

  global.fetch = jest.fn((url) => {
    if (String(url).startsWith("/auth/check-session")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(currentUser) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(activities) });
  });

  jest.resetModules();
  require(APP_JS_PATH);

  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

  // Two ticks: one for the fetch() promise, one for the response.json() promise.
  await flushPromises();
  await flushPromises();
}

describe("activity rendering", () => {
  test("renders a card with the correct category tag for a sports activity", async () => {
    // Description: This test verifies an activity name containing "Soccer" is tagged as Sports.

    // Arrange
    const activities = {
      "Soccer Team": {
        description: "Competitive team practice",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:30" },
        max_participants: 20,
        participants: ["a@school.edu"],
      },
    };

    // Act
    await loadApp({ activities });

    // Assert
    const card = document.querySelector(".activity-card");
    expect(card.querySelector(".activity-tag").textContent.trim()).toBe("Sports");
  });

  test("shows a no-results message when no activities are returned", async () => {
    // Description: This test verifies the empty state is displayed when the activities list is empty.

    // Act
    await loadApp({ activities: {} });

    // Assert
    expect(document.querySelector(".no-results")).not.toBeNull();
    expect(document.querySelectorAll(".activity-card").length).toBe(0);
  });

  test("marks an activity as full and disables registration for authenticated teachers", async () => {
    // Description: This test verifies the register button is disabled once an activity is at capacity.

    // Arrange
    const activities = {
      "Chess Club": {
        description: "Weekly strategy sessions",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 1,
        participants: ["existing@school.edu"],
      },
    };

    // Act
    await loadApp({ activities, currentUser: { username: "teacher1", display_name: "Teacher One" } });

    // Assert
    const registerButton = document.querySelector(".register-button");
    expect(registerButton).not.toBeNull();
    expect(registerButton.disabled).toBe(true);
    expect(registerButton.textContent.trim()).toBe("Activity Full");
  });
});

describe("filtering", () => {
  test("category filter hides activities that do not match the selected category", async () => {
    // Description: This test verifies clicking the Sports category filter hides non-sports activities.

    // Arrange
    const activities = {
      "Soccer Team": {
        description: "Competitive team practice",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:30" },
        max_participants: 20,
        participants: [],
      },
      "Debate Club": {
        description: "Academic competition practice",
        schedule_details: { days: ["Tuesday"], start_time: "15:00", end_time: "16:30" },
        max_participants: 20,
        participants: [],
      },
    };
    await loadApp({ activities });

    // Act
    document.querySelector('.category-filter[data-category="sports"]').dispatchEvent(new window.Event("click", { bubbles: true }));

    // Assert
    const cardNames = Array.from(document.querySelectorAll(".activity-card h4")).map((el) => el.textContent);
    expect(cardNames).toEqual(["Soccer Team"]);
  });

  test("search input filters activities by name", async () => {
    // Description: This test verifies typing into the search box filters the activity list by name.

    // Arrange
    const activities = {
      "Soccer Team": {
        description: "Competitive team practice",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:30" },
        max_participants: 20,
        participants: [],
      },
      "Debate Club": {
        description: "Academic competition practice",
        schedule_details: { days: ["Tuesday"], start_time: "15:00", end_time: "16:30" },
        max_participants: 20,
        participants: [],
      },
    };
    await loadApp({ activities });

    // Act
    const searchInput = document.getElementById("activity-search");
    searchInput.value = "debate";
    searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));

    // Assert
    const cardNames = Array.from(document.querySelectorAll(".activity-card h4")).map((el) => el.textContent);
    expect(cardNames).toEqual(["Debate Club"]);
  });

  test("day filter click requests activities scoped to the selected day", async () => {
    // Description: This test verifies clicking a day filter re-fetches activities with a day query parameter.

    // Arrange
    await loadApp({ activities: {} });
    fetch.mockClear();

    // Act
    document.querySelector('.day-filter[data-day="Monday"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("day=Monday"));
  });
});

describe("authentication", () => {
  test("shows the logged-in teacher's display name after a valid session is restored", async () => {
    // Description: This test verifies a saved session restores the authenticated UI on load.

    // Act
    await loadApp({ activities: {}, currentUser: { username: "teacher1", display_name: "Teacher One" } });

    // Assert
    expect(document.getElementById("user-info").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("display-name").textContent).toBe("Teacher One");
  });

  test("logout clears the authenticated state and shows the login button", async () => {
    // Description: This test verifies clicking logout restores the anonymous UI state.

    // Arrange
    await loadApp({ activities: {}, currentUser: { username: "teacher1", display_name: "Teacher One" } });

    // Act
    document.getElementById("logout-button").dispatchEvent(new window.Event("click", { bubbles: true }));

    // Assert
    expect(document.getElementById("login-button").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("user-info").classList.contains("hidden")).toBe(true);
  });

  test("logs out when the stored session is rejected by the server", async () => {
    // Description: This test verifies an invalid saved session (server responds not ok) triggers logout.

    // Arrange
    document.documentElement.innerHTML = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    window.localStorage.clear();
    window.localStorage.setItem("currentUser", JSON.stringify({ username: "teacher1", display_name: "Teacher One" }));

    global.fetch = jest.fn((url) => {
      if (String(url).startsWith("/auth/check-session")) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    jest.resetModules();
    require(APP_JS_PATH);
    document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(document.getElementById("login-button").classList.contains("hidden")).toBe(false);
    expect(window.localStorage.getItem("currentUser")).toBeNull();
  });

  test("logs out when the saved session data is malformed JSON", async () => {
    // Description: This test verifies corrupted localStorage data is handled gracefully via logout.

    // Arrange
    document.documentElement.innerHTML = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    window.localStorage.clear();
    window.localStorage.setItem("currentUser", "{not-valid-json");
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

    jest.resetModules();
    require(APP_JS_PATH);
    document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(document.getElementById("login-button").classList.contains("hidden")).toBe(false);
    expect(window.localStorage.getItem("currentUser")).toBeNull();
  });

  test("successful login updates the UI and closes the login modal", async () => {
    // Description: This test verifies submitting valid credentials logs the teacher in.

    // Arrange
    await loadApp({ activities: {} });
    fetch.mockImplementation((url) => {
      if (String(url).startsWith("/auth/login")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ username: "teacher1", display_name: "Teacher One" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    document.getElementById("login-button").dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("username").value = "teacher1";
    document.getElementById("password").value = "secret";

    // Act
    document.getElementById("login-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(document.getElementById("display-name").textContent).toBe("Teacher One");
    expect(document.getElementById("user-info").classList.contains("hidden")).toBe(false);
  });

  test("failed login shows an error message in the login modal", async () => {
    // Description: This test verifies invalid credentials display an error and do not log the user in.

    // Arrange
    await loadApp({ activities: {} });
    fetch.mockImplementation((url) => {
      if (String(url).startsWith("/auth/login")) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ detail: "Invalid username or password" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    document.getElementById("login-button").dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("username").value = "teacher1";
    document.getElementById("password").value = "wrong";

    // Act
    document.getElementById("login-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    const loginMessage = document.getElementById("login-message");
    expect(loginMessage.classList.contains("hidden")).toBe(false);
    expect(loginMessage.textContent).toBe("Invalid username or password");
    expect(document.getElementById("user-info").classList.contains("hidden")).toBe(true);
  });

  test("clicking outside the login modal closes it", async () => {
    // Description: This test verifies clicking the modal backdrop closes the login modal.

    // Arrange
    await loadApp({ activities: {} });
    const loginModal = document.getElementById("login-modal");
    document.getElementById("login-button").dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(loginModal.classList.contains("show")).toBe(true);

    // Act
    loginModal.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    // Assert
    expect(loginModal.classList.contains("show")).toBe(false);
  });
});

describe("activity categorization", () => {
  test.each([
    ["Art Club", "Creative painting sessions", "Arts"],
    ["Math Olympiad", "Academic study group", "Academic"],
    ["Volunteer Corps", "Community service program", "Community"],
    ["Robotics Club", "Programming and technology projects", "Technology"],
    ["Mystery Club", "A club about mysteries", "Academic"],
  ])("categorizes \"%s\" correctly", async (name, description, expectedLabel) => {
    // Description: This test verifies getActivityType maps varied names/descriptions to the correct category tag.

    // Arrange
    const activities = {
      [name]: {
        description,
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 10,
        participants: [],
      },
    };

    // Act
    await loadApp({ activities });

    // Assert
    const tag = document.querySelector(".activity-tag");
    expect(tag.textContent.trim()).toBe(expectedLabel);
  });

  test("falls back to the legacy schedule string when schedule_details is absent", async () => {
    // Description: This test verifies formatSchedule falls back to the plain "schedule" field.

    // Arrange
    const activities = {
      "Legacy Club": {
        description: "An activity using the old schedule format",
        schedule: "Fridays at noon",
        max_participants: 10,
        participants: [],
      },
    };

    // Act
    await loadApp({ activities });

    // Assert
    expect(document.querySelector(".activity-card p.tooltip").textContent).toContain("Fridays at noon");
  });
});

describe("time and day filters", () => {
  test("morning time filter re-fetches activities with start and end time params", async () => {
    // Description: This test verifies clicking the "before school" time filter requests the morning time range.

    // Arrange
    await loadApp({ activities: {} });
    fetch.mockClear();

    // Act
    document.querySelector('.time-filter[data-time="morning"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("start_time=06%3A00"));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("end_time=08%3A00"));
  });

  test("weekend time filter hides activities not scheduled on Saturday or Sunday", async () => {
    // Description: This test verifies the client-side weekend filter only shows Saturday/Sunday activities.

    // Arrange
    const activities = {
      "Weekday Club": {
        description: "Meets during the week",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 10,
        participants: [],
      },
      "Weekend Club": {
        description: "Meets on the weekend",
        schedule_details: { days: ["Saturday"], start_time: "10:00", end_time: "11:00" },
        max_participants: 10,
        participants: [],
      },
    };
    await loadApp({ activities });

    // Act
    document.querySelector('.time-filter[data-time="weekend"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    const cardNames = Array.from(document.querySelectorAll(".activity-card h4")).map((el) => el.textContent);
    expect(cardNames).toEqual(["Weekend Club"]);
  });

  test("search button click applies the search box value as the search query", async () => {
    // Description: This test verifies clicking the search button (instead of typing) filters results.

    // Arrange
    const activities = {
      "Soccer Team": {
        description: "Team practice",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 10,
        participants: [],
      },
    };
    await loadApp({ activities });
    document.getElementById("activity-search").value = "soccer";

    // Act
    document.getElementById("search-button").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

    // Assert
    expect(document.querySelectorAll(".activity-card").length).toBe(1);
  });
});

describe("registration flow", () => {
  test("registering a student shows a success message and refreshes the list", async () => {
    // Description: This test verifies submitting the signup form for an authenticated teacher succeeds.

    // Arrange
    const activities = {
      "Chess Club": {
        description: "Weekly strategy sessions",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 5,
        participants: [],
      },
    };
    await loadApp({ activities, currentUser: { username: "teacher1", display_name: "Teacher One" } });

    fetch.mockImplementation((url) => {
      if (String(url).includes("/signup")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: "Signed up successfully" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(activities) });
    });

    document.querySelector(".register-button").dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("email").value = "student@school.edu";

    // Act
    document.getElementById("signup-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    const messageDiv = document.getElementById("message");
    expect(messageDiv.classList.contains("hidden")).toBe(false);
    expect(messageDiv.textContent).toBe("Signed up successfully");
  });

  test("registration attempt without authentication shows an error and does not call the API", async () => {
    // Description: This test verifies the signup form is guarded against submission by anonymous users.

    // Arrange
    await loadApp({ activities: {} });
    fetch.mockClear();
    document.getElementById("email").value = "student@school.edu";

    // Act
    document.getElementById("signup-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    // Assert
    expect(document.getElementById("message").textContent).toBe(
      "You must be logged in as a teacher to register students.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("a failed registration shows the server-provided error message", async () => {
    // Description: This test verifies a rejected signup response surfaces the returned error detail.

    // Arrange
    const activities = {
      "Chess Club": {
        description: "Weekly strategy sessions",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 5,
        participants: [],
      },
    };
    await loadApp({ activities, currentUser: { username: "teacher1", display_name: "Teacher One" } });

    fetch.mockImplementation((url) => {
      if (String(url).includes("/signup")) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ detail: "Already registered" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(activities) });
    });

    document.querySelector(".register-button").dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("email").value = "student@school.edu";

    // Act
    document.getElementById("signup-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(document.getElementById("message").textContent).toBe("Already registered");
  });

  test("closing the registration modal via the close button hides it", async () => {
    // Description: This test verifies the close-modal button removes the "show" class from the registration modal.

    // Arrange
    const activities = {
      "Chess Club": {
        description: "Weekly strategy sessions",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 5,
        participants: [],
      },
    };
    await loadApp({ activities, currentUser: { username: "teacher1", display_name: "Teacher One" } });
    document.querySelector(".register-button").dispatchEvent(new window.Event("click", { bubbles: true }));
    const registrationModal = document.getElementById("registration-modal");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(registrationModal.classList.contains("show")).toBe(true);

    // Act
    document.querySelector(".close-modal").dispatchEvent(new window.Event("click", { bubbles: true }));

    // Assert
    expect(registrationModal.classList.contains("show")).toBe(false);
  });
});

describe("unregistration flow", () => {
  test("unregistering a student confirms and shows a success message", async () => {
    // Description: This test verifies the confirmation dialog flow leads to a successful unregister call.

    // Arrange
    const activities = {
      "Chess Club": {
        description: "Weekly strategy sessions",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 5,
        participants: ["student@school.edu"],
      },
    };
    await loadApp({ activities, currentUser: { username: "teacher1", display_name: "Teacher One" } });

    fetch.mockImplementation((url) => {
      if (String(url).includes("/unregister")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: "Unregistered successfully" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(activities) });
    });

    document.querySelector(".delete-participant").dispatchEvent(new window.Event("click", { bubbles: true }));

    // Act
    document.getElementById("confirm-button").dispatchEvent(new window.Event("click", { bubbles: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(document.getElementById("message").textContent).toBe("Unregistered successfully");
  });

  test("cancelling the confirmation dialog does not call the unregister API", async () => {
    // Description: This test verifies clicking Cancel on the confirmation dialog aborts the unregister action.

    // Arrange
    const activities = {
      "Chess Club": {
        description: "Weekly strategy sessions",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 5,
        participants: ["student@school.edu"],
      },
    };
    await loadApp({ activities, currentUser: { username: "teacher1", display_name: "Teacher One" } });
    document.querySelector(".delete-participant").dispatchEvent(new window.Event("click", { bubbles: true }));
    fetch.mockClear();

    // Act
    document.getElementById("cancel-button").dispatchEvent(new window.Event("click", { bubbles: true }));

    // Assert
    expect(fetch).not.toHaveBeenCalled();
  });

  test("unregistering without authentication shows an error and skips confirmation", async () => {
    // Description: This test verifies an anonymous user cannot trigger the unregister flow (no delete button rendered).

    // Arrange
    const activities = {
      "Chess Club": {
        description: "Weekly strategy sessions",
        schedule_details: { days: ["Monday"], start_time: "15:00", end_time: "16:00" },
        max_participants: 5,
        participants: ["student@school.edu"],
      },
    };

    // Act
    await loadApp({ activities });

    // Assert
    expect(document.querySelector(".delete-participant")).toBeNull();
    expect(document.querySelector(".auth-notice")).not.toBeNull();
  });
});

describe("error handling", () => {
  test("shows a failure message when fetching activities rejects", async () => {
    // Description: This test verifies a network failure while fetching activities displays a friendly error.

    // Arrange
    document.documentElement.innerHTML = fs.readFileSync(INDEX_HTML_PATH, "utf8");
    window.localStorage.clear();
    global.fetch = jest.fn(() => Promise.reject(new Error("network down")));

    // Act
    jest.resetModules();
    require(APP_JS_PATH);
    document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
    await flushPromises();
    await flushPromises();

    // Assert
    expect(document.getElementById("activities-list").textContent).toContain("Failed to load activities");
  });
});
