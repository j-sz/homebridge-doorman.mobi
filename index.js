"use strict";

const PLUGIN_NAME = "homebridge-doorman";
const ACCESSORY_NAME = "Doorman";

class DoormanAccessory {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.apiUrl = typeof config.apiUrl === "string" ? config.apiUrl.replace(/\/+$/, "") : "";
    this.doorId = Number(config.doorId);
    this.accessToken = config.accessToken;

    if (!this.apiUrl) {
      throw new Error("The apiUrl setting is required.");
    }
    if (!Number.isSafeInteger(this.doorId) || this.doorId < 1) {
      throw new Error("The doorId setting must be a positive integer.");
    }
    if (!this.accessToken && (!config.email || !config.password)) {
      throw new Error("Configure either accessToken or both email and password.");
    }

    const name = config.name || "Doorman";
    this.service = new this.Service.LockMechanism(name);
    this.service
      .getCharacteristic(this.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));
    this.service
      .getCharacteristic(this.Characteristic.LockTargetState)
      .onGet(this.getLockState.bind(this))
      .onSet(this.setLockState.bind(this));
  }

  getServices() {
    return [this.service];
  }

  async getLockState() {
    try {
      const assets = await this.request("/assets");
      if (!Array.isArray(assets)) {
        throw new Error("The Doorman API returned an invalid asset list.");
      }

      const door = assets.find(
        (asset) => Number(asset.id) === this.doorId && asset.record_type === "buzzer"
      );
      if (!door) {
        throw new Error(`Buzzer asset ${this.doorId} was not found for this account.`);
      }

      const state = this.toHomeKitState(door.status);
      this.updateState(state);
      return state;
    } catch (error) {
      this.log.error(`Unable to read Doorman lock state: ${error.message}`);
      throw error;
    }
  }

  async setLockState(targetState) {
    const status =
      targetState === this.Characteristic.LockTargetState.SECURED ? "locked" : "unlocked";

    try {
      const updatedDoor = await this.request(`/assets/${this.doorId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      const state = this.toHomeKitState(updatedDoor.status);
      this.updateState(state);
      this.log.info(`Doorman lock ${status}.`);
    } catch (error) {
      this.log.error(`Unable to set Doorman lock state: ${error.message}`);
      throw error;
    }
  }

  async request(path, options = {}, retryAfterLogin = true) {
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        ...options.headers,
      },
    });

    if (response.status === 401 && retryAfterLogin && this.config.email && this.config.password) {
      this.accessToken = undefined;
      await this.login();
      return this.request(path, options, false);
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Doorman API request failed with status ${response.status}.`);
    }
    return body;
  }

  async login() {
    const response = await fetch(`${this.apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.token !== "string") {
      throw new Error(body.error || `Doorman login failed with status ${response.status}.`);
    }
    this.accessToken = body.token;
  }

  toHomeKitState(status) {
    if (status === "locked") {
      return this.Characteristic.LockCurrentState.SECURED;
    }
    if (status === "unlocked") {
      return this.Characteristic.LockCurrentState.UNSECURED;
    }
    throw new Error(`Unexpected Doorman lock status: ${String(status)}.`);
  }

  updateState(state) {
    this.service.updateCharacteristic(this.Characteristic.LockCurrentState, state);
    this.service.updateCharacteristic(this.Characteristic.LockTargetState, state);
  }
}

module.exports = (api) => {
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, DoormanAccessory);
};

module.exports.DoormanAccessory = DoormanAccessory;
