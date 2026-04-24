const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

function createQuery(result) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    populate() {
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

async function createTestServer({ routerPath, mountPath, mocks }) {
  return loadModuleWithMocks(routerPath, mocks);
}

async function invokeRoute(router, { method, path: routePath, body = {}, params = {}, headers = {} }) {
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
    headers
  };

  let resolved = false;
  let responseBody;
  let responseText;
  let statusCode = 200;

  return new Promise((resolve, reject) => {
    function finish() {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve({ statusCode, body: responseBody, text: responseText });
    }

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        responseBody = payload;
        finish();
        return this;
      },
      send(payload) {
        responseText = payload;
        finish();
        return this;
      },
      end(payload) {
        responseText = payload;
        finish();
        return this;
      },
      setHeader() {},
      getHeader() {
        return undefined;
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

function createAdminRouteMocks(overrides = {}) {
  class MockUser {
    constructor(doc) {
      Object.assign(this, doc);
    }

    async save() {
      if (overrides.userSaveError) {
        throw overrides.userSaveError;
      }

      this._id = this._id || "user-new";
      return this;
    }

    static findOne(query) {
      if (overrides.userFindOne) {
        return createQuery(overrides.userFindOne(query));
      }

      return createQuery(null);
    }

    static find(query) {
      if (overrides.userFind) {
        return createQuery(overrides.userFind(query));
      }

      return createQuery([]);
    }

    static findById(id) {
      if (overrides.userFindById) {
        return createQuery(overrides.userFindById(id));
      }

      return createQuery({ _id: id, role: "student" });
    }

    static findByIdAndUpdate(id, payload) {
      if (overrides.userFindByIdAndUpdate) {
        return createQuery(overrides.userFindByIdAndUpdate(id, payload));
      }

      return createQuery({ _id: id, ...payload });
    }
  }

  class MockCourse {
    constructor(doc) {
      Object.assign(this, doc);
    }

    async save() {
      if (overrides.courseSaveError) {
        throw overrides.courseSaveError;
      }

      this._id = this._id || "course-new";
      return this;
    }
  }

  const mockDb = {
    User: MockUser,
    Course: MockCourse,
    Timetable: class MockTimetable {},
    Fee: {
      find(query) {
        if (overrides.feeFind) {
          return createQuery(overrides.feeFind(query));
        }

        return createQuery([]);
      },
      async insertMany(docs) {
        if (overrides.feeInsertMany) {
          return overrides.feeInsertMany(docs);
        }

        return docs;
      }
    },
    TakenCourse: class MockTakenCourse {},
    Announcement: class MockAnnouncement {}
  };

  return {
    "../db/index": mockDb,
    "../middleware/auth": (req, res, next) => {
      req.user = { id: "admin-1", role: "admin" };
      next();
    },
    "../middleware/admin": (req, res, next) => next(),
    "bcryptjs": {
      hash: async (value) => `hashed-${value}`
    },
    "jsonwebtoken": {
      sign: () => "token"
    },
    dotenv: {
      config: () => ({})
    }
  };
}

function createStudentRouteMocks(overrides = {}) {
  const mockDb = {
    User: class MockUser {},
    Course: {
      async findById(courseId) {
        if (overrides.courseFindById) {
          return overrides.courseFindById(courseId);
        }

        return { _id: courseId };
      }
    },
    TakenCourse: class MockTakenCourse {
      constructor(doc) {
        Object.assign(this, doc);
      }

      async save() {
        if (overrides.takenCourseSaveError) {
          throw overrides.takenCourseSaveError;
        }

        this._id = this._id || "taken-new";
        return this;
      }

      static async findOne(query) {
        if (overrides.takenCourseFindOne) {
          return overrides.takenCourseFindOne(query);
        }

        return null;
      }
    },
    Timetable: class MockTimetable {},
    Announcement: class MockAnnouncement {},
    Fee: class MockFee {}
  };

  class MockPDFDocument {}

  return {
    "../db/index": mockDb,
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
    pdfkit: MockPDFDocument,
    dotenv: {
      config: () => ({})
    }
  };
}

test("rejects duplicate student roll number", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/admin.js"),
    mocks: createAdminRouteMocks({
      userFindOne(query) {
        if (query.$or) {
          return { roll_no: "STU24001" };
        }

        return null;
      }
    })
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/students",
    body: {
      first_name: "A",
      last_name: "B",
      email: "fresh@example.com",
      password: "secret",
      roll_no: " stu24001 "
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.message, "Roll number already exists");
});

test("rejects duplicate student email", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/admin.js"),
    mocks: createAdminRouteMocks({
      userFindOne(query) {
        if (query.$or) {
          return { email: "student@example.com" };
        }

        return null;
      }
    })
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/students",
    body: {
      first_name: "A",
      last_name: "B",
      email: " Student@Example.com ",
      password: "secret",
      roll_no: "STU24005"
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.message, "Email already exists");
});

test("rejects duplicate professor employee id", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/admin.js"),
    mocks: createAdminRouteMocks({
      userFindOne(query) {
        if (query.$or) {
          return { employee_id: "EMP001" };
        }

        return null;
      }
    })
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/profs",
    body: {
      first_name: "Prof",
      last_name: "One",
      email: "prof.one@example.com",
      password: "secret",
      employee_id: " emp001 "
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.message, "Employee ID already exists");
});

test("requires roll number for student creation", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/admin.js"),
    mocks: createAdminRouteMocks()
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/students",
    body: {
      first_name: "A",
      last_name: "B",
      email: "student@example.com",
      password: "secret"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, "roll_no is required for students");
});

test("requires employee id for professor creation", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/admin.js"),
    mocks: createAdminRouteMocks()
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/profs",
    body: {
      first_name: "Prof",
      last_name: "One",
      email: "prof@example.com",
      password: "secret"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, "employee_id is required for professors");
});

test("rejects duplicate course code on course creation", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/admin.js"),
    mocks: createAdminRouteMocks({
      userFindOne(query) {
        if (query.role === "prof") {
          return { _id: "prof-1", role: "prof" };
        }

        return null;
      },
      courseSaveError: {
        code: 11000,
        keyPattern: { course_code: 1 }
      }
    })
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/courses",
    body: {
      course_code: " cs101 ",
      course_name: "Intro",
      credits: 4,
      professor: "prof-1"
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.body.message, "Course code already exists");
});

test("rejects duplicate student course registration", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/student.js"),
    mocks: createStudentRouteMocks({
      takenCourseFindOne() {
        return { _id: "taken-1" };
      }
    })
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/register-course/:courseId",
    params: { courseId: "course-1" }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, "Already registered in this course");
});

test("skips fee generation when fee demand already exists for the same student and term", async () => {
  const router = await createTestServer({
    routerPath: path.join(projectRoot, "route/admin.js"),
    mocks: createAdminRouteMocks({
      userFind(query) {
        if (query.role === "student") {
          return [{ _id: "student-1", roll_no: "STU24001" }];
        }

        return [];
      },
      feeFind() {
        return [{ student: "student-1" }];
      }
    })
  });

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/fees/generate",
    body: {
      semester: 4,
      academic_year: "2025-26",
      amount: 100000,
      due_date: "2026-05-01"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.createdCount, 0);
  assert.equal(response.body.message, "Fee demand already exists for all students in this semester");
});
