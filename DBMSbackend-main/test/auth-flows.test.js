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
  let statusCode = 200;
  let responseBody;

  return new Promise((resolve, reject) => {
    function finish() {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve({ statusCode, body: responseBody });
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
      if (overrides.userSave) {
        return overrides.userSave(this);
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
  }

  return {
    "../db/index": {
      User: MockUser,
      Course: class MockCourse {},
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
    },
    "../middleware/auth": (req, res, next) => {
      req.user = { id: "admin-1", role: "admin" };
      next();
    },
    "../middleware/admin": (req, res, next) => next(),
    bcryptjs: {
      hash: async (value) => `hashed-${value}`,
      compare: async (value, hashedValue) => hashedValue === `hashed-${value}`
    },
    jsonwebtoken: {
      sign: (payload) => `token-for-${payload.role}`
    },
    dotenv: {
      config: () => ({})
    }
  };
}

function createStudentRouteMocks(overrides = {}) {
  class MockTakenCourse {
    constructor(doc) {
      Object.assign(this, doc);
    }

    async save() {
      if (overrides.takenCourseSave) {
        return overrides.takenCourseSave(this);
      }

      this._id = "taken-new";
      return this;
    }

    static async findOne(query) {
      if (overrides.takenCourseFindOne) {
        return overrides.takenCourseFindOne(query);
      }

      return null;
    }
  }

  return {
    "../db/index": {
      User: {
        findOne(query) {
          if (overrides.userFindOne) {
            return createQuery(overrides.userFindOne(query));
          }

          return createQuery(null);
        }
      },
      Course: {
        async findById(courseId) {
          if (overrides.courseFindById) {
            return overrides.courseFindById(courseId);
          }

          return { _id: courseId, course_code: "CS101" };
        }
      },
      TakenCourse: MockTakenCourse,
      Timetable: class MockTimetable {},
      Announcement: class MockAnnouncement {},
      Fee: class MockFee {}
    },
    "../middleware/auth": overrides.authMiddleware || ((req, res, next) => {
      req.user = { id: "student-1", role: "student" };
      next();
    }),
    "../middleware/student": (req, res, next) => next(),
    bcryptjs: {
      compare: async (value, hashedValue) => hashedValue === `hashed-${value}`
    },
    jsonwebtoken: {
      sign: (payload) => `token-for-${payload.role}`
    },
    pdfkit: class MockPDFDocument {},
    dotenv: {
      config: () => ({})
    }
  };
}

test("admin signup succeeds for a valid admin payload", async () => {
  const router = loadModuleWithMocks(
    path.join(projectRoot, "route/admin.js"),
    createAdminRouteMocks()
  );

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/signup",
    body: {
      first_name: "Admin",
      last_name: "User",
      email: "Admin@Example.com",
      password: "secret"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.message, "Admin registered");
});

test("admin signin normalizes email and returns a token", async () => {
  const router = loadModuleWithMocks(
    path.join(projectRoot, "route/admin.js"),
    createAdminRouteMocks({
      userFindOne(query) {
        assert.equal(query.email, "admin@example.com");
        return {
          _id: "admin-1",
          email: query.email,
          role: "admin",
          password: "hashed-secret"
        };
      }
    })
  );

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/signin",
    body: {
      email: " Admin@Example.com ",
      password: "secret"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.token, "token-for-admin");
});

test("student signin normalizes email and returns a token", async () => {
  const router = loadModuleWithMocks(
    path.join(projectRoot, "route/student.js"),
    createStudentRouteMocks({
      userFindOne(query) {
        assert.equal(query.email, "student@example.com");
        return {
          _id: "student-1",
          email: query.email,
          role: "student",
          password: "hashed-secret"
        };
      }
    })
  );

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/signin",
    body: {
      email: " Student@Example.com ",
      password: "secret"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.token, "token-for-student");
});

test("student auth rejects requests with a missing authorization header", async () => {
  const authenticateJWT = require(path.join(projectRoot, "middleware/auth.js"));
  const req = { headers: {} };
  let statusCode = 200;
  let responseBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseBody = payload;
      return this;
    }
  };

  authenticateJWT(req, res, () => {});

  assert.equal(statusCode, 400);
  assert.equal(responseBody.message, "Missing authorization header");
});

test("course registration succeeds when the student is not already enrolled", async () => {
  let savedEnrollment;
  const router = loadModuleWithMocks(
    path.join(projectRoot, "route/student.js"),
    createStudentRouteMocks({
      takenCourseSave(enrollment) {
        savedEnrollment = enrollment;
        enrollment._id = "taken-1";
        return enrollment;
      }
    })
  );

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/register-course/:courseId",
    params: { courseId: "course-99" }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.message, "Course registered");
  assert.equal(savedEnrollment.student, "student-1");
  assert.equal(savedEnrollment.course, "course-99");
});

test("fee generation creates demands for students without an existing record", async () => {
  let insertedFees = [];
  const router = loadModuleWithMocks(
    path.join(projectRoot, "route/admin.js"),
    createAdminRouteMocks({
      userFind(query) {
        if (query.role === "student") {
          return [
            { _id: "student-1", roll_no: "STU24001", first_name: "A", last_name: "B" },
            { _id: "student-2", roll_no: "STU24002", first_name: "C", last_name: "D" }
          ];
        }

        return [];
      },
      feeFind() {
        return [];
      },
      feeInsertMany(docs) {
        insertedFees = docs;
        return docs;
      }
    })
  );

  const response = await invokeRoute(router, {
    method: "POST",
    path: "/fees/generate",
    body: {
      semester: 4,
      academic_year: "2025-26",
      amount: 100000,
      due_date: "2026-05-01",
      remarks: "Tuition"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.createdCount, 2);
  assert.equal(insertedFees.length, 2);
  assert.equal(insertedFees[0].generated_by, "admin-1");
});
