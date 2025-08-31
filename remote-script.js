/**
 * Shelly LoRa Garage Door Controller - Remote Script
 * v5.0 - Final Polished Version
 */

// --- CONFIGURATION ---
const CONFIG = {
  AES_KEY: '8A2E7B1C9D0F3A4B6C8E1D2F5A7B9C0D2E4F6A8B1C3D5E7F9A0B2C4D6E8F1A3B',
  TARGET_ID: "[INSERT_YOUR_CONTROLLER_SHELLY_MAC_HERE]",
  REMOTE_SWITCH_ID: 0,
  REMOTE_INPUT_ID: 0,
  DOOR_TRAVEL_TIME_MS: 12000,
  DOOR_START_CHECK_MS: 4000,
  HEARTBEAT_INTERVAL_SEC: 300,
  CHECKSUM_SIZE: 4
};

// --- DEFINITIONS ---
const STATES = { CLOSED: 0, OPENING: 1, OPEN: 2, CLOSING: 3, STOPPED: 4, ERROR: 5 };
const REVERSE_STATES = { 0: "CLOSED", 1: "OPENING", 2: "OPEN", 3: "CLOSING", 4: "STOPPED", 5: "ERROR" };
const CMD = { TRIGGER_MOTOR: 'tm', RAW_SENSOR_UPDATE: 'b', STATE_UPDATE: 's', REQUEST_STATUS: 'rs' };
const REVERSE_CMD = { 'tm': "TRIGGER_MOTOR", 'b': "RAW_SENSOR_UPDATE", 's': "STATE_UPDATE", 'rs': "REQUEST_STATUS" };

// --- STATE VARIABLES ---
let currentState = -1, lastDirection = null, travelTimer = null, debounceTimer = null;

// --- UTILITY FUNCTIONS ---
function fromHex(h) { const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) { b[i] = parseInt(h.substr(i * 2, 2), 16); } return b.buffer; }
function strToUint8(s) { let a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { a[i] = s.charCodeAt(i); } return a; }
function uint8ToStr(b) { let s = "", v = new Uint8Array(b); for (let i = 0; i < v.length; i++) { s += String.fromCharCode(v[i]); } return s; }
function generateChecksum(m) { let c = 0; for (let i = 0; i < m.length; i++) { c ^= m.charCodeAt(i); } let h = c.toString(16); while (h.length < CONFIG.CHECKSUM_SIZE) { h = '0' + h; } return h.slice(-CONFIG.CHECKSUM_SIZE); }
function verifyMessage(m) { if (m.length < CONFIG.CHECKSUM_SIZE) return null; const r = m.slice(0, CONFIG.CHECKSUM_SIZE), c = m.slice(CONFIG.CHECKSUM_SIZE), e = generateChecksum(c); return (r !== e) ? null : c; }

// --- CORE LOGIC & COMMUNICATION ---
function sendLoRaRPC(command, params) {
  const cmdCode = CMD[command];
  if (cmdCode === undefined) return;
  console.log("LoRa Send -> Command:", command, "Params:", params || "None");
  const payload = (params && params.length > 0) ? params.join(',') : "";
  const encodedRPC = payload ? (cmdCode + "|" + payload) : cmdCode;
  const msgWithChecksum = generateChecksum(encodedRPC) + encodedRPC;
  const key = fromHex(CONFIG.AES_KEY);
  const bufferToSend = strToUint8(msgWithChecksum);
  const encryptedBuffer = AES.encrypt(bufferToSend, key, { mode: 'CFB' });
  if (!encryptedBuffer) { console.log("Error: AES encryption failed."); return; }
  const b64Data = btoa(uint8ToStr(encryptedBuffer));
  Shelly.call("Lora.SendBytes", { id: 100, data: b64Data });
}

function updateState(newState, subStatus) {
  if (currentState === newState && !subStatus) return;
  if (travelTimer) { Timer.clear(travelTimer); travelTimer = null; }
  currentState = newState;
  console.log("State changed to:", REVERSE_STATES[currentState], "Sub-status:", subStatus || "None");
  let params = [currentState];
  if (subStatus) { params.push(subStatus); }
  sendLoRaRPC("STATE_UPDATE", params);
}

function startOpeningSequence() {
  lastDirection = 'up';
  updateState(STATES.OPENING);
  travelTimer = Timer.set(CONFIG.DOOR_START_CHECK_MS, false, function () {
    let status = Shelly.getComponentStatus("input:" + CONFIG.REMOTE_INPUT_ID);
    if (status.state === false) {
      console.log("Error Condition: Door failed to move off the closed sensor.");
      updateState(STATES.ERROR, "E1");
    } else {
      travelTimer = Timer.set(CONFIG.DOOR_TRAVEL_TIME_MS - CONFIG.DOOR_START_CHECK_MS, false, function () { updateState(STATES.OPEN); });
    }
  });
}

function startClosingSequence() {
  lastDirection = 'down';
  updateState(STATES.CLOSING);
  travelTimer = Timer.set(CONFIG.DOOR_TRAVEL_TIME_MS * 1.2, false, function () {
    console.log("Error Condition: Door failed to close within the expected time.");
    updateState(STATES.ERROR, "E2");
  });
}

function handleTrigger() {
  console.log("Motor trigger received in state:", REVERSE_STATES[currentState]);
  Shelly.call("Switch.Set", { id: CONFIG.REMOTE_SWITCH_ID, on: true });
  switch (currentState) {
    case STATES.CLOSED:
    case STATES.ERROR:
      startOpeningSequence();
      break;
    case STATES.OPEN:
      startClosingSequence();
      break;
    case STATES.STOPPED:
      if (lastDirection === 'up') { startClosingSequence(); }
      else { startOpeningSequence(); }
      break;
    case STATES.OPENING:
    case STATES.CLOSING:
      console.log("Info: Command received during travel, stopping motor.");
      updateState(STATES.STOPPED);
      break;
  }
}

function runRPC(encodedRPC) {
  const parts = encodedRPC.split('|');
  const cmd = REVERSE_CMD[parts[0]];
  console.log("LoRa Receive <- Command:", cmd);
  if (cmd === "TRIGGER_MOTOR") {
    handleTrigger();
  } else if (cmd === "REQUEST_STATUS") {
    console.log("Status requested by controller. Sending current state.");
    sendLoRaRPC("STATE_UPDATE", [currentState]);
  }
}

// --- EVENT HANDLERS ---
Shelly.addEventHandler(function (ev) {
  if (ev.info.event === "lora_received" && ev.component === "lora:100") {
    const s = atob(ev.info.data);
    const k = fromHex(CONFIG.AES_KEY);
    const db = AES.decrypt(strToUint8(s), k, { mode: 'CFB' });
    if (!db) { console.log("Error: AES decryption failed."); updateState(STATES.ERROR, "E3"); return; }
    const dm = uint8ToStr(db);
    const fm = verifyMessage(dm);
    if (fm) { runRPC(fm); }
    else { console.log("Error: Checksum mismatch."); updateState(STATES.ERROR, "E3"); }
  }
  else if (ev.component === "input:" + CONFIG.REMOTE_INPUT_ID) {
    let status = Shelly.getComponentStatus("input:" + CONFIG.REMOTE_INPUT_ID);
    if (status.state === true && currentState === STATES.ERROR && lastDirection === 'up') {
      console.log("Info: Slow start detected. Forgiving ERROR and resuming OPENING sequence.");
      updateState(STATES.OPENING);
      travelTimer = Timer.set(CONFIG.DOOR_TRAVEL_TIME_MS - CONFIG.DOOR_START_CHECK_MS, false, function () { updateState(STATES.OPEN); });
    }
    if (debounceTimer) Timer.clear(debounceTimer);
    debounceTimer = Timer.set(500, false, function () {
      let currentStatus = Shelly.getComponentStatus("input:" + CONFIG.REMOTE_INPUT_ID);
      const stateAsInt = currentStatus.state ? 1 : 0;
      sendLoRaRPC("RAW_SENSOR_UPDATE", [stateAsInt]);
      if (currentStatus.state === false) {
        if (currentState === STATES.OPENING || currentState === STATES.OPEN) {
          console.log("Error Condition: Sensor triggered unexpectedly while open/opening.");
          updateState(STATES.ERROR, "E4");
        } else {
          updateState(STATES.CLOSED);
        }
      }
    });
  }
});

// --- INITIALIZATION ---
function initializeState() {
  console.log("This device's MAC ID is:", Shelly.getDeviceInfo().mac);
  let status = Shelly.getComponentStatus("input:" + CONFIG.REMOTE_INPUT_ID);
  if (status.state === false) { currentState = STATES.CLOSED; }
  else { currentState = STATES.STOPPED; lastDirection = 'down'; }
  console.log("Initial state determined as:", REVERSE_STATES[currentState]);
}

function startHeartbeat() {
  if (CONFIG.HEARTBEAT_INTERVAL_SEC <= 0) return;
  console.log("Heartbeat started. Interval:", CONFIG.HEARTBEAT_INTERVAL_SEC, "sec.");
  Timer.set(CONFIG.HEARTBEAT_INTERVAL_SEC * 1000, true, function () {
    console.log("Sending heartbeat status update...");
    let status = Shelly.getComponentStatus("input:" + CONFIG.REMOTE_INPUT_ID);
    let stateAsInt = status.state ? 1 : 0;
    updateState(currentState); 
    sendLoRaRPC("RAW_SENSOR_UPDATE", [stateAsInt]);
  });
}

console.log("--- Shelly LoRa Garage Remote Script Initializing ---");
initializeState();
startHeartbeat();
console.log("--- Script Started ---");