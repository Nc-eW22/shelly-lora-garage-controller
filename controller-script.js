/**
 * Shelly LoRa Garage Door Controller - Controller Script
 * v5.0 - Final Polished Version
 */

// --- SCRIPT CONFIGURATION ---
const CONFIG = {
  AES_KEY: '8A2E7B1C9D0F3A4B6C8E1D2F5A7B9C0D2E4F6A8B1C3D5E7F9A0B2C4D6E8F1A3B',
  CHECKSUM_SIZE: 4,
  TARGET_ID: "[INSERT_YOUR_REMOTE_SHELLY_MAC_HERE]",

  VC_ID: { TRIGGER: 201, STATUS: 200, ARROW: 201, SENSOR: 200 },
  
  REPLY_GRACE_MS: 5000,
  RETRY_DELAY_MS: 1200,

  ENABLE_PHYSICAL_OUTPUT_LINK: true,
  PHYSICAL_OUTPUT_ID: 0
};

// --- DEFINITIONS ---
const STATES = { CLOSED: 0, OPENING: 1, OPEN: 2, CLOSING: 3, STOPPED: 4, ERROR: 5 };

const STATE_DEFINITIONS = [
  { key: "closed",  title: " "       },
  { key: "opening", title: "Opening" },
  { key: "open",    title: " "       },
  { key: "closing", title: "Closing" },
  { key: "stopped", title: "Stopped" },
  { key: "error",   title: "Error"   }
];

const SUB_STATUSES = {
  "0": "✅", "1": "⬆️", "2": "🛑", "3": "⬇️", "4": "❌",
  "E1": "⚠️ ↑ Stall Open", "E2": "⚠️ ↓ Stall Close", "E3": "📡 E3: Comm Fail",
  "E4": "❗ E4: Seq Error", "E5": "... E5: No Reply"
};

const CMD = { TRIGGER_MOTOR: 'tm', RAW_SENSOR_UPDATE: 'b', STATE_UPDATE: 's', REQUEST_STATUS: 'rs' };
const REVERSE_CMD = {}; for(let key in CMD) { REVERSE_CMD[CMD[key]] = key; }

// --- STATE VARIABLES ---
let retryGuardTimer = null, isWaitingForReply = false, didRetry = false, vcTriggerHandle = null;

// --- UTILITY FUNCTIONS ---
function fromHex(h){const b=new Uint8Array(h.length/2);for(let i=0;i<b.length;i++){b[i]=parseInt(h.substr(i*2,2),16);}return b.buffer;}
function strToUint8(s){
  const a=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++){
    a[i]=s.charCodeAt(i);
  }
  return a;
}
function uint8ToStr(b){let s="",v=new Uint8Array(b);for(let i=0;i<v.length;i++)s+=String.fromCharCode(v[i]);return s;}
function generateChecksum(m){let c=0;for(let i=0;i<m.length;i++)c^=m.charCodeAt(i);let h=c.toString(16);while(h.length<CONFIG.CHECKSUM_SIZE)h='0'+h;return h.slice(-CONFIG.CHECKSUM_SIZE);}
function verifyMessage(m){if(m.length<CONFIG.CHECKSUM_SIZE)return null;const r=m.slice(0,CONFIG.CHECKSUM_SIZE),c=m.slice(CONFIG.CHECKSUM_SIZE),e=generateChecksum(c);return(r===e)?c:null;}

// --- CORE LOGIC & COMMUNICATION ---
function sendLoRaRPC(command, params) {
  console.log("[Controller] Sending:", command, params || []);
  const cmdCode = CMD[command];
  if (cmdCode === undefined) return;
  const payload = (params && params.length > 0) ? params.join(',') : "";
  const encodedRPC = payload ? (cmdCode + "|" + payload) : cmdCode;
  const msgWithChecksum = generateChecksum(encodedRPC) + encodedRPC;
  const key = fromHex(CONFIG.AES_KEY);
  const bufferToSend = strToUint8(msgWithChecksum);
  const encryptedBuffer = AES.encrypt(bufferToSend, key, { mode: 'CFB' });
  if (!encryptedBuffer) return;
  const b64Data = btoa(uint8ToStr(encryptedBuffer));
  Shelly.call("Lora.SendBytes", { id: 100, data: b64Data });
}

function armRetryGuard() {
  isWaitingForReply = true;
  didRetry = false;
  if (retryGuardTimer) { Timer.clear(retryGuardTimer); }
  retryGuardTimer = Timer.set(CONFIG.REPLY_GRACE_MS, false, function() {
    if (isWaitingForReply && !didRetry) {
      didRetry = true;
      Timer.set(CONFIG.RETRY_DELAY_MS, false, function() {
        if (isWaitingForReply) {
          console.log("[Controller] No reply received. Setting error state and retrying...");
          Shelly.call("Enum.Set", { id: CONFIG.VC_ID.STATUS, value: "error" });
          Shelly.call("Enum.Set", { id: CONFIG.VC_ID.ARROW, value: SUB_STATUSES["E5"] });
          sendLoRaRPC("TRIGGER_MOTOR");
        }
      });
    }
  });
}

function cancelRetryWindow() {
  if (isWaitingForReply) {
    isWaitingForReply = false;
    if (retryGuardTimer) { Timer.clear(retryGuardTimer); retryGuardTimer = null; }
  }
}

function runRPC(encodedRPC) {
  const parts = encodedRPC.split('|');
  const cmd = REVERSE_CMD[parts[0]];
  if (!cmd) return;
  const payload = parts.slice(1);
  console.log("[Controller] Received:", cmd, payload);
  cancelRetryWindow();
  switch (cmd) {
    case "RAW_SENSOR_UPDATE": {
      const isSensorActive = (payload[0] === '0');
      Shelly.call("Boolean.Set", { id: CONFIG.VC_ID.SENSOR, value: !isSensorActive });
      if (CONFIG.ENABLE_PHYSICAL_OUTPUT_LINK) {
        Shelly.call("Switch.Set", { id: CONFIG.PHYSICAL_OUTPUT_ID, on: isSensorActive });
      }
      break;
    }
    case "STATE_UPDATE": {
      if (vcTriggerHandle) { vcTriggerHandle.setValue(false); }
      const params = payload[0].split(',');
      const stateIndex = parseInt(params[0]);
      if (isNaN(stateIndex) || stateIndex < 0 || stateIndex >= STATE_DEFINITIONS.length) return;
      const stateKey = STATE_DEFINITIONS[stateIndex].key;
      Shelly.call("Enum.Set", { id: CONFIG.VC_ID.STATUS, value: stateKey });
      let subStatus = "";
      if (stateIndex === STATES.ERROR && params.length > 1) {
        subStatus = SUB_STATUSES[params[1]] || "⚠️ Error";
      } else {
        subStatus = SUB_STATUSES[stateIndex.toString()] || " ";
      }
      Shelly.call("Enum.Set", { id: CONFIG.VC_ID.ARROW, value: subStatus });
      break;
    }
  }
}

// --- INITIALIZATION & EVENT HANDLERS ---
function configureVirtualComponents() {
  console.log("[Controller] Configuring virtual components...");
  let statusOptions = [], statusTitles = {};
  for (let i = 0; i < STATE_DEFINITIONS.length; i++) {
    let def = STATE_DEFINITIONS[i]; statusOptions.push(def.key); statusTitles[def.key] = def.title;
  }
  let subStatusOptions = [];
  for(let key in SUB_STATUSES) { subStatusOptions.push(SUB_STATUSES[key]); }
  Shelly.call("Enum.SetConfig", { id: CONFIG.VC_ID.STATUS, config: { name: "Garage Door Status", options: statusOptions, default_value: "error", meta: { ui: { view: "label", titles: statusTitles } } } });
  Shelly.call("Enum.SetConfig", { id: CONFIG.VC_ID.ARROW, config: { name: "Sub-Status", options: subStatusOptions, default_value: " ", meta: { ui: { view: "label" } } } });
  Shelly.call("Boolean.SetConfig", { id: CONFIG.VC_ID.TRIGGER, config: { name: "Garage Door Trigger", meta: { ui: { view: "toggle" } } } });
  Shelly.call("Boolean.SetConfig", { id: CONFIG.VC_ID.SENSOR, config: { name: "Sensor Status (Raw)", meta: { ui: { view: "label", webIcon: 3 } } } });
  Timer.set(1000, false, attachEventHandlers);
}

function attachEventHandlers() {
  Shelly.addEventHandler(function(ev) {
    if (ev.component === "lora:100" && ev.info.event === "lora_received") {
      console.log("[Controller] LoRa Packet Received. RSSI:", ev.info.rssi, "SNR:", ev.info.snr);
      const s = atob(ev.info.data);
      const k = fromHex(CONFIG.AES_KEY);
      const db = AES.decrypt(strToUint8(s), k, { mode: 'CFB' });
      if (!db) return;
      const dm = uint8ToStr(db);
      const fm = verifyMessage(dm);
      if (fm) runRPC(fm);
    }
  });
  vcTriggerHandle = Virtual.getHandle("boolean:" + CONFIG.VC_ID.TRIGGER);
  if (vcTriggerHandle) {
    vcTriggerHandle.on("change", function (ev) {
      let is_on = (typeof ev === 'object') ? ev.value : ev;
      if (is_on) {
        if (isWaitingForReply) { vcTriggerHandle.setValue(false); return; }
        sendLoRaRPC("TRIGGER_MOTOR");
        armRetryGuard();
      }
    });
  }
  console.log("Pinging remote device to check signal strength...");
  sendLoRaRPC("REQUEST_STATUS");
}

console.log("--- Shelly LoRa Garage Controller Script Initializing ---");
console.log("This device's MAC ID is:", Shelly.getDeviceInfo().mac);
Timer.set(2000, false, configureVirtualComponents);
console.log("--- Script Started ---");
