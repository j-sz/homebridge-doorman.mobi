"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DoormanAccessory } = require("../index.js");

function createApi() {
  const characteristics = {
    LockCurrentState: { SECURED: 1, UNSECURED: 0 },
    LockTargetState: { SECURED: 1, UNSECURED: 0 },
  };
  class LockMechanism {
    constructor(name) {
      this.name = name;
      this.handlers = new Map();
      this.updates = [];
    }

    getCharacteristic(characteristic) {
      const handlers = {};
      this.handlers.set(characteristic, handlers);
      return {
        onGet: (handler) => {
          handlers.get = handler;
          return this.getCharacteristic(characteristic);
        },
        onSet: (handler) => {
          handlers.set = handler;
          return this.getCharacteristic(characteristic);
        },
      };
    }

    updateCharacteristic(characteristic, value) {
      this.updates.push([characteristic, value]);
    }
  }
  return { hap: { Service: { LockMechanism }, Characteristic: characteristics } };
}

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function createAccessory(config = {}) {
  return new DoormanAccessory(
    { info() {}, error() {} },
    {
      apiUrl: "https://doorman.example/api",
      doorId: 7,
      accessToken: "token",
      ...config,
    },
    createApi()
  );
}

test("reads a buzzer status as a secured HomeKit lock", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://doorman.example/api/assets");
    assert.equal(options.headers.Authorization, "Bearer token");
    return response(200, [{ id: 7, record_type: "buzzer", status: "locked" }]);
  };

  try {
    const accessory = createAccessory();
    assert.equal(await accessory.getLockState(), 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("updates the app when HomeKit unlocks the door", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://doorman.example/api/assets/7/status");
    assert.equal(options.method, "PUT");
    assert.deepEqual(JSON.parse(options.body), { status: "unlocked" });
    return response(200, { id: 7, status: "unlocked" });
  };

  try {
    const accessory = createAccessory();
    await accessory.setLockState(0);
    assert.deepEqual(accessory.service.updates, [
      [accessory.Characteristic.LockCurrentState, 0],
      [accessory.Characteristic.LockTargetState, 0],
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("logs in again once after an unauthorized API response", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push([url, options]);
    if (calls.length === 1) return response(401, { error: "Session expired" });
    if (calls.length === 2) return response(200, { token: "fresh-token" });
    return response(200, [{ id: 7, record_type: "buzzer", status: "unlocked" }]);
  };

  try {
    const accessory = createAccessory({ accessToken: undefined, email: "door@example.com", password: "secret" });
    assert.equal(await accessory.getLockState(), 0);
    assert.equal(calls[1][0], "https://doorman.example/api/auth/login");
    assert.equal(calls[2][1].headers.Authorization, "Bearer fresh-token");
  } finally {
    global.fetch = originalFetch;
  }
});
