const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("node:path");

const studentRoutePath = path.join(__dirname, "..", "route/student.js");

function createQuery(result) {
  return {
    select() {
      return this;
    },
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve(result).catch(reject);
    }
  };
}

function loadModuleWithMocks(modulePath, mocks) {
  const originalLoad = Module._load;
  const resolvedModulePath = require.resolve(modulePath);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[resolvedModulePath];

  try {
    return require(resolvedModulePath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedModulePath];
  }
}

async function invokeRoute(router, { method, path: routePath, body = {}, params = {} }) {
  const layer = router.stack.find(
    (item) => item.route && item.route.path === routePath && item.route.methods[method.toLowerCase()]
  );

  if (!layer) {
    throw new Error(`Route not found for ${method} ${routePath}`);
  }

  const req = {
    method: method.toUpperCase(),
    url: routePath,
    originalUrl: routePath,
    path: routePath,
    body,
    params,
    headers: {}
  };

  let resolved = false;
  let statusCode = 200;
  let jsonBody;
  let sentHeaders = {};

  return new Promise((resolve, reject) => {
    function finish() {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve({ statusCode, jsonBody, headers: sentHeaders });
    }

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonBody = payload;
        finish();
        return this;
      },
      setHeader(name, value) {
        sentHeaders[name] = value;
      },
      getHeader(name) {
        return sentHeaders[name];
      },
      end() {
        finish();
      }
    };

    const handlers = layer.route.stack.map((item) => item.handle);
    let index = 0;

    function next(err) {
      if (err) {
        reject(err);
        return;
      }

      const handler = handlers[index++];
      if (!handler) {
        finish();
        return;
      }

      try {
        const result = handler(req, res, next);
        if (result && typeof result.then === "function") {
          result.then(() => {
            if (!resolved && index >= handlers.length) {
              finish();
            }
          }).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    }

    next();
  });
}

test("resume endpoint uses Ollama output to generate the PDF response", async () => {
  process.env.OLLAMA_HOST = "http://127.0.0.1:11434";
  process.env.OLLAMA_RESUME_MODEL = "llama3.2:3b";

  let capturedRequest;
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    capturedRequest = {
      url,
      options: {
        ...options,
        body: JSON.parse(options.body)
      }
    };

    return {
      ok: true,
      async json() {
        return {
          message: {
            content: JSON.stringify({
              summary: "AI-crafted summary for a student developer.",
              skills: ["JavaScript", "Node.js"],
              experience: ["Built backend APIs for academic workflows."],
              achievements: ["Completed strong coursework in databases."],
              coursework: ["CS301 - Database Systems | Grade: A"]
            })
          }
        };
      }
    };
  };

  class MockPDFDocument {
    constructor() {
      this.page = {
        width: 595,
        margins: { left: 42, right: 42 }
      };
      this.y = 0;
      this.info = {};
    }
    pipe() {
      return this;
    }
    rect() {
      return this;
    }
    fill() {
      return this;
    }
    fillColor() {
      return this;
    }
    font() {
      return this;
    }
    fontSize() {
      return this;
    }
    text() {
      return this;
    }
    moveDown() {
      return this;
    }
    save() {
      return this;
    }
    strokeColor() {
      return this;
    }
    lineWidth() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
    stroke() {
      return this;
    }
    restore() {
      return this;
    }
    end() {}
  }

  const router = loadModuleWithMocks(studentRoutePath, {
    pdfkit: MockPDFDocument,
    "../db/index": {
      User: {
        findById() {
          return createQuery({
            _id: "student-1",
            first_name: "Atharv",
            last_name: "Consul",
            email: "atharv@example.com",
            roll_no: "STU24001"
          });
        }
      },
      Course: class MockCourse {},
      TakenCourse: {
        find() {
          return createQuery([
            {
              course: {
                course_code: "CS301",
                course_name: "Database Systems",
                credits: 4,
                professor: { first_name: "Alan", last_name: "Turing" }
              },
              marks: 91,
              grade: "A"
            }
          ]);
        }
      },
      Timetable: class MockTimetable {},
      Announcement: class MockAnnouncement {},
      Fee: class MockFee {}
    },
    "../middleware/auth": (req, res, next) => {
      req.user = { id: "student-1", role: "student" };
      next();
    },
    "../middleware/student": (req, res, next) => next(),
    bcryptjs: {
      compare: async () => true
    },
    jsonwebtoken: {
      sign: () => "token"
    },
    dotenv: {
      config: () => ({})
    }
  });

  try {
    const response = await invokeRoute(router, {
      method: "POST",
      path: "/resume",
      body: {
        description: "Built APIs and worked on DBMS coursework.",
        target_role: "backend developer"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Content-Type"], "application/pdf");
    assert.match(response.headers["Content-Disposition"], /atharv-consul-resume\.pdf/);
    assert.equal(capturedRequest.url, "http://127.0.0.1:11434/api/chat");
    assert.equal(capturedRequest.options.body.model, "llama3.2:3b");
    assert.equal(capturedRequest.options.body.stream, false);
    assert.equal(capturedRequest.options.body.messages[1].role, "user");
    assert.match(capturedRequest.options.body.messages[1].content, /backend developer/);
    assert.match(capturedRequest.options.body.messages[1].content, /Database Systems/);
  } finally {
    global.fetch = originalFetch;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_RESUME_MODEL;
  }
});

test("resume preview returns structured JSON with manual inputs merged in", async () => {
  process.env.OLLAMA_HOST = "http://127.0.0.1:11434";
  process.env.OLLAMA_RESUME_MODEL = "llama3.2:3b";

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            summary: "Preview summary.",
            skills: ["MongoDB"],
            experience: ["Built DBMS APIs."],
            achievements: ["Strong coursework results."],
            coursework: []
          })
        }
      };
    }
  });

  const router = loadModuleWithMocks(studentRoutePath, {
    pdfkit: class MockPDFDocument {},
    "../db/index": {
      User: {
        findById() {
          return createQuery({
            _id: "student-1",
            first_name: "Atharv",
            last_name: "Consul",
            email: "atharv@example.com",
            roll_no: "STU24001"
          });
        }
      },
      Course: class MockCourse {},
      TakenCourse: {
        find() {
          return createQuery([]);
        }
      },
      Timetable: class MockTimetable {},
      Announcement: class MockAnnouncement {},
      Fee: class MockFee {}
    },
    "../middleware/auth": (req, res, next) => {
      req.user = { id: "student-1", role: "student" };
      next();
    },
    "../middleware/student": (req, res, next) => next(),
    bcryptjs: {
      compare: async () => true
    },
    jsonwebtoken: {
      sign: () => "token"
    },
    dotenv: {
      config: () => ({})
    }
  });

  try {
    const response = await invokeRoute(router, {
      method: "POST",
      path: "/resume",
      body: {
        description: "Built APIs and DB projects.",
        target_role: "full stack developer",
        resume_style: "classic",
        preview: true,
        manual_skills: ["React", "MongoDB"],
        manual_projects: [
          {
            name: "Placement Tracker",
            description: "Built a tracker for student applications."
          }
        ]
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.jsonBody.message, "Resume preview generated");
    assert.equal(response.jsonBody.resume_style, "classic");
    assert.equal(response.jsonBody.target_role, "full stack developer");
    assert.deepEqual(response.jsonBody.resume.skills.sort(), ["MongoDB", "React"]);
    assert.ok(response.jsonBody.resume.experience.some((item) => /Placement Tracker/.test(item)));
  } finally {
    global.fetch = originalFetch;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_RESUME_MODEL;
  }
});

test("resume preview removes placeholder project bullets and unsupported business achievements", async () => {
  process.env.OLLAMA_HOST = "http://127.0.0.1:11434";
  process.env.OLLAMA_RESUME_MODEL = "llama3.2:3b";

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            summary: "Grounded summary.",
            skills: ["Operating Systems"],
            experience: ["Student Description", "Academic Internships & Projects"],
            achievements: [
              "Generated a 35% increase in year-over-year revenue by overhauling the outbound sales strategy.",
              "Strong understanding of database fundamentals."
            ],
            coursework: ["CS201 - Database Management Systems"]
          })
        }
      };
    }
  });

  const router = loadModuleWithMocks(studentRoutePath, {
    pdfkit: class MockPDFDocument {},
    "../db/index": {
      User: {
        findById() {
          return createQuery({
            _id: "student-2",
            first_name: "Priya",
            last_name: "Nair",
            email: "priya@example.com",
            roll_no: "STU24002"
          });
        }
      },
      Course: class MockCourse {},
      TakenCourse: {
        find() {
          return createQuery([]);
        }
      },
      Timetable: class MockTimetable {},
      Announcement: class MockAnnouncement {},
      Fee: class MockFee {}
    },
    "../middleware/auth": (req, res, next) => {
      req.user = { id: "student-2", role: "student" };
      next();
    },
    "../middleware/student": (req, res, next) => next(),
    bcryptjs: {
      compare: async () => true
    },
    jsonwebtoken: {
      sign: () => "token"
    },
    dotenv: {
      config: () => ({})
    }
  });

  try {
    const response = await invokeRoute(router, {
      method: "POST",
      path: "/resume",
      body: {
        description: "Interested in software engineering and backend systems.",
        target_role: "software engineer",
        preview: true
      }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.jsonBody.resume.experience, []);
    assert.deepEqual(response.jsonBody.resume.achievements, ["Strong understanding of database fundamentals."]);
  } finally {
    global.fetch = originalFetch;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_RESUME_MODEL;
  }
});

test("resume endpoint returns 503 when Ollama is not reachable", async () => {
  process.env.OLLAMA_HOST = "http://127.0.0.1:11434";
  process.env.OLLAMA_RESUME_MODEL = "llama3.2:3b";

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };

  class MockPDFDocument {}

  const router = loadModuleWithMocks(studentRoutePath, {
    pdfkit: MockPDFDocument,
    "../db/index": {
      User: {
        findById() {
          return createQuery({
            _id: "student-1",
            first_name: "Atharv",
            last_name: "Consul",
            email: "atharv@example.com",
            roll_no: "STU24001"
          });
        }
      },
      Course: class MockCourse {},
      TakenCourse: {
        find() {
          return createQuery([]);
        }
      },
      Timetable: class MockTimetable {},
      Announcement: class MockAnnouncement {},
      Fee: class MockFee {}
    },
    "../middleware/auth": (req, res, next) => {
      req.user = { id: "student-1", role: "student" };
      next();
    },
    "../middleware/student": (req, res, next) => next(),
    bcryptjs: {
      compare: async () => true
    },
    jsonwebtoken: {
      sign: () => "token"
    },
    dotenv: {
      config: () => ({})
    }
  });

  try {
    const response = await invokeRoute(router, {
      method: "POST",
      path: "/resume",
      body: {
        description: "Built APIs and worked on DBMS coursework.",
        target_role: "backend developer"
      }
    });

    assert.equal(response.statusCode, 503);
    assert.equal(response.jsonBody.message, "Resume AI is unavailable. Make sure Ollama is running locally.");
  } finally {
    global.fetch = originalFetch;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_RESUME_MODEL;
  }
});
