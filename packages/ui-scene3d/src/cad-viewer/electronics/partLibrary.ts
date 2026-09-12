import type { PartDef, PartCategory } from './types';

export type { PartDef };

// ── Helper: generate side pins for DIP/SIP components ──────────────────────

function leftRightPins(
  width: number, height: number, leftLabels: string[], rightLabels: string[],
): PartDef['pins'] {
  const pins: PartDef['pins'] = [];
  // Right-side pins sit on the body's last column — derived from width so a
  // wider package still places them on its actual right edge.
  const rightX = width - 1;
  for (let i = 0; i < height; i++) {
    if (leftLabels[i] !== undefined)
      pins.push({ id: `L${i}`, x: 0, y: i, label: leftLabels[i] });
    if (rightLabels[i] !== undefined)
      pins.push({ id: `R${i}`, x: rightX, y: i, label: rightLabels[i] });
  }
  return pins;
}

// ── Part definitions ────────────────────────────────────────────────────────

const breadboard830: PartDef = {
  id: 'breadboard-830',
  name: 'Breadboard 830',
  category: 'board',
  description: '830-point solderless breadboard with power rails',
  width: 65,
  height: 17,
  bodyColor: '#f5f0e8',
  bodyShape: 'breadboard',
  label: 'BB-830',
  // Pins: power rail endpoints + corner references
  // Individual hole snap is handled by the grid; we only mark special points here.
  pins: [
    { id: 'vcc-top-l',  x: 1,  y: 0,  label: '+' },
    { id: 'gnd-top-l',  x: 1,  y: 1,  label: '−' },
    { id: 'vcc-top-r',  x: 63, y: 0,  label: '+' },
    { id: 'gnd-top-r',  x: 63, y: 1,  label: '−' },
    { id: 'vcc-bot-l',  x: 1,  y: 15, label: '+' },
    { id: 'gnd-bot-l',  x: 1,  y: 16, label: '−' },
    { id: 'vcc-bot-r',  x: 63, y: 15, label: '+' },
    { id: 'gnd-bot-r',  x: 63, y: 16, label: '−' },
  ],
};

const arduinoNano: PartDef = {
  id: 'arduino-nano',
  name: 'Arduino Nano',
  category: 'microcontroller',
  description: 'ATmega328P-based Arduino Nano development board',
  width: 4,
  height: 16,
  bodyColor: '#0d47a1',
  bodyShape: 'dip',
  label: 'Arduino\nNano',
  pins: leftRightPins(4, 15,
    ['TX1','RX0','RST','GND','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12'],
    ['D13','3V3','REF','A0','A1','A2','A3','A4','A5','A6','A7','5V','RST','GND','VIN'],
  ),
};

const esp32DevKit: PartDef = {
  id: 'esp32-devkit',
  name: 'ESP32 DevKit V1',
  category: 'microcontroller',
  description: 'ESP32 dual-core Wi-Fi/BT development board, 38-pin',
  width: 4,

  height: 20,
  bodyColor: '#1a237e',
  bodyShape: 'dip',
  label: 'ESP32',
  pins: leftRightPins(4, 19,
    ['3V3','EN','VP','VN','D34','D35','D32','D33','D25','D26','D27','D14','D12','D13','GND','D15','D2','D4','RX2'],
    ['GND','D23','D22','TX0','RX0','D21','D19','D18','D5','D17','D16','D4','D0','D2','D15','D8','D7','D6','D5'],
  ),
};

const esp8266Wemos: PartDef = {
  id: 'wemos-d1-mini',
  name: 'Wemos D1 Mini',
  category: 'microcontroller',
  description: 'ESP8266-based Wi-Fi development board',
  width: 4,
  height: 10,
  bodyColor: '#1565c0',
  bodyShape: 'dip',
  label: 'D1 Mini',
  pins: leftRightPins(4, 8,
    ['RST','A0','D0','D5','D6','D7','D8','3V3'],
    ['TX','RX','D1','D2','D3','D4','GND','5V'],
  ),
};

const resistor: PartDef = {
  id: 'resistor',
  name: 'Resistor',
  category: 'passive',
  description: 'Generic through-hole resistor (axial)',
  width: 5,
  height: 1,
  bodyColor: '#c8a46e',
  bodyShape: 'resistor',
  label: 'R',
  pins: [
    { id: 'p1', x: 0, y: 0, label: 'P1' },
    { id: 'p2', x: 4, y: 0, label: 'P2' },
  ],
};

const ledRed: PartDef = {
  id: 'led-red',
  name: 'LED Red',
  category: 'active',
  description: 'Red 5mm through-hole LED',
  width: 3,
  height: 1,
  bodyColor: '#e53935',
  bodyShape: 'led',
  label: 'LED',
  indicatorColor: '#ff1744',
  pins: [
    { id: 'cathode', x: 0, y: 0, label: '−' },
    { id: 'anode',   x: 2, y: 0, label: '+' },
  ],
};

const ledGreen: PartDef = {
  id: 'led-green',
  name: 'LED Green',
  category: 'active',
  description: 'Green 5mm through-hole LED',
  width: 3,
  height: 1,
  bodyColor: '#43a047',
  bodyShape: 'led',
  label: 'LED',
  indicatorColor: '#00e676',
  pins: [
    { id: 'cathode', x: 0, y: 0, label: '−' },
    { id: 'anode',   x: 2, y: 0, label: '+' },
  ],
};

const ledBlue: PartDef = {
  id: 'led-blue',
  name: 'LED Blue',
  category: 'active',
  description: 'Blue 5mm through-hole LED',
  width: 3,
  height: 1,
  bodyColor: '#1e88e5',
  bodyShape: 'led',
  label: 'LED',
  indicatorColor: '#448aff',
  pins: [
    { id: 'cathode', x: 0, y: 0, label: '−' },
    { id: 'anode',   x: 2, y: 0, label: '+' },
  ],
};

const pushButton: PartDef = {
  id: 'push-button',
  name: 'Push Button',
  category: 'active',
  description: '6mm tactile push button, 4-pin',
  width: 3,
  height: 3,
  bodyColor: '#455a64',
  bodyShape: 'button',
  label: 'BTN',
  pins: [
    { id: 'a1', x: 0, y: 0, label: 'A1' },
    { id: 'a2', x: 2, y: 0, label: 'A2' },
    { id: 'b1', x: 0, y: 2, label: 'B1' },
    { id: 'b2', x: 2, y: 2, label: 'B2' },
  ],
};

const joystickPs: PartDef = {
  id: 'joystick-ps',
  name: 'Joystick (PS-style)',
  category: 'active',
  description: '2-axis analog thumbstick module with push-button (KY-023)',
  width: 5,
  height: 6,
  bodyColor: '#0d47a1',
  bodyShape: 'joystick',
  label: 'JOY',
  // 5-pin header on the bottom edge — y = h-1 so they render as bottom pins.
  pins: [
    { id: 'gnd', x: 0, y: 5, label: 'GND' },
    { id: 'vcc', x: 1, y: 5, label: '+5V' },
    { id: 'vrx', x: 2, y: 5, label: 'VRx' },
    { id: 'vry', x: 3, y: 5, label: 'VRy' },
    { id: 'sw',  x: 4, y: 5, label: 'SW' },
  ],
};

const capacitorCeramic: PartDef = {
  id: 'capacitor-ceramic',
  name: 'Capacitor (Ceramic)',
  category: 'passive',
  description: 'Ceramic disc capacitor',
  width: 3,
  height: 1,
  bodyColor: '#f9a825',
  bodyShape: 'capacitor',
  label: 'C',
  pins: [
    { id: 'p1', x: 0, y: 0, label: '1' },
    { id: 'p2', x: 2, y: 0, label: '2' },
  ],
};

const npnTransistor: PartDef = {
  id: 'npn-transistor',
  name: 'NPN Transistor',
  category: 'active',
  description: 'Generic NPN BJT (TO-92), e.g. 2N2222, BC547',
  width: 3,
  height: 2,
  bodyColor: '#37474f',
  bodyShape: 'transistor',
  label: 'NPN',
  pins: [
    { id: 'emitter',   x: 0, y: 1, label: 'E' },
    { id: 'base',      x: 1, y: 1, label: 'B' },
    { id: 'collector', x: 2, y: 1, label: 'C' },
  ],
};

const dht22: PartDef = {
  id: 'dht22',
  name: 'DHT22 Sensor',
  category: 'sensor',
  description: 'DHT22 temperature & humidity sensor',
  width: 4,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'DHT22',
  pins: [
    { id: 'vcc',  x: 0, y: 1, label: 'VCC' },
    { id: 'data', x: 0, y: 2, label: 'DATA' },
    { id: 'nc',   x: 0, y: 3, label: 'NC' },
    { id: 'gnd',  x: 0, y: 4, label: 'GND' },
  ],
};

const potentiometer: PartDef = {
  id: 'potentiometer',
  name: 'Potentiometer',
  category: 'passive',
  description: 'Single-turn through-hole potentiometer',
  width: 5,
  height: 3,
  bodyColor: '#546e7a',
  bodyShape: 'ic',
  label: 'POT',
  pins: [
    { id: 'p1',   x: 1, y: 2, label: 'P1' },
    { id: 'wiper', x: 2, y: 2, label: 'W' },
    { id: 'p2',   x: 3, y: 2, label: 'P2' },
  ],
};

const oledI2c: PartDef = {
  id: 'oled-i2c',
  name: 'OLED 0.96" I2C',
  category: 'display',
  description: '0.96" OLED display module, I2C, 128×64',
  width: 6,
  height: 8,
  bodyColor: '#1a1a2e',
  bodyShape: 'ic',
  label: 'OLED\n0.96"',
  // 4-pin header on the bottom edge — y = h-1 so they render as proper bottom pins.
  pins: [
    { id: 'gnd',  x: 1, y: 7, label: 'GND' },
    { id: 'vcc',  x: 2, y: 7, label: 'VCC' },
    { id: 'scl',  x: 3, y: 7, label: 'SCL' },
    { id: 'sda',  x: 4, y: 7, label: 'SDA' },
  ],
};


const esp32s3Pico: PartDef = {
  id: 'esp32-s3-pico',
  name: 'ESP32 S3 Pico',
  category: 'microcontroller',
  description: 'ESP32 dual-core Wi-Fi/BT development board, 38-pin',
  width: 7,
  height: 20,
  bodyColor: '#1a237e',
  bodyShape: 'dip',
  label: 'ESP32S3Pico',
  pins: leftRightPins(7, 20,
    ['GP11','GP12','GND','GP13','GP14','GP15','GP16','GND','GP17','GP18','GP33','GP34','GND','GP35','GP36','GP37','GP38','GND','GP39', 'GP40'],
    ['VBUS','VSYS','GND','3V3_EN','3V3(OUT)','GP10','GP9','GND','GP8','GP7','RUN','GP6','GND','GP5','GP4','GP2','GP1','GND','GP41', 'GP42'],
  ),
};

const ky_018: PartDef = {
  id: 'ky_018',
  name: 'KY-018 Sensor',
  category: 'sensor',
  description: 'KY-018 photoresistor Sensor',
  width: 4,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'KY-018',
  pins: [
    { id: 'S',  x: 0, y: 1, label: 'S' },
    { id: 'VCC', x: 0, y: 2, label: 'VCC' },
    { id: 'GND',   x: 0, y: 3, label: 'GND' },
  ],
};

const dht11: PartDef = {
  id: 'dht11',
  name: 'DHT11 Sensor',
  category: 'sensor',
  description: 'DHT11 temperature & humidity sensor',
  width: 4,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'DHT11',
  pins: [
    { id: 'VCC',  x: 0, y: 1, label: 'VCC' },
    { id: 'DATA', x: 0, y: 2, label: 'DATA' },
    { id: 'NC',   x: 0, y: 3, label: 'NC' },
    { id: 'GND',   x: 0, y: 4, label: 'GND' },
  ],
};

const hc_sr04: PartDef = {
  id: 'hc_sr04',
  name: 'HC-SR04 Sensor',
  category: 'sensor',
  description: 'HC-SR04 ultrasonic distance sensor',
  width: 4,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'HC-SR04',
  pins: [
    { id: 'VCC',  x: 0, y: 1, label: 'VCC' },
    { id: 'TRIG', x: 0, y: 2, label: 'TRIG' },
    { id: 'ECHO',   x: 0, y: 3, label: 'ECHO' },
    { id: 'GND',   x: 0, y: 4, label: 'GND' },
  ],
};

const tcrt5000: PartDef = {
  id: 'tcrt5000',
  name: 'TCRT5000 Sensor',
  category: 'sensor',
  description: 'TCRT5000 IR reflective sensor',
  width: 4,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'TCRT5000',
  pins: [
    { id: 'A0',  x: 0, y: 1, label: 'A0' },
    { id: 'D0', x: 0, y: 2, label: 'D0' },
    { id: 'GND',   x: 0, y: 3, label: 'GND' },
    { id: 'VCC',   x: 0, y: 4, label: 'VCC' },
  ],
};

const max72198: PartDef = {
  id: 'max72198',
  name: 'MAX72198',
  category: 'display',
  description: 'MAX72198 led matrix',
  width: 5,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'MAX72198',
  pins: [
    { id: 'CLK',  x: 0, y: 1, label: 'CLK' },
    { id: 'CS', x: 0, y: 2, label: 'CS' },
    { id: 'DIN',   x: 0, y: 3, label: 'DIN' },
    { id: 'GND',   x: 0, y: 4, label: 'GND' },
    { id: 'VCC',   x: 0, y: 5, label: 'VCC' },
  ],
};

const ath20_bmp280: PartDef = {
  id: 'ath20_bmp280',
  name: 'ATH20_BMP280 Sensor',
  category: 'sensor',
  description: 'ATH20_BMP280 sensor',
  width: 4,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'ATH20_BMP280',
  pins: [
    { id: 'VCC',  x: 0, y: 1, label: 'VCC' },
    { id: 'SDA', x: 0, y: 2, label: 'SDA' },
    { id: 'GND',   x: 0, y: 3, label: 'GND' },
    { id: 'SCL',   x: 0, y: 4, label: 'SCL' },
  ],
};

const lcd1602i2c: PartDef = {
  id: 'lcd1602i2c',
  name: 'LCD1602 I2C',
  category: 'display',
  description: 'LCD1602 display module, I2C',
  width: 6,
  height: 8,
  bodyColor: '#1a1a2e',
  bodyShape: 'ic',
  label: 'LCD1602',
  // 4-pin I²C header on the bottom edge — y = h-1 so they render as bottom pins.
  pins: [
    { id: 'SCL', x: 1, y: 7, label: 'SCL' },
    { id: 'SDA', x: 2, y: 7, label: 'SDA' },
    { id: 'VCC', x: 3, y: 7, label: 'VCC' },
    { id: 'GND', x: 4, y: 7, label: 'GND' },
  ],
};



// ── Registry ────────────────────────────────────────────────────────────────

export const PART_LIBRARY: PartDef[] = [
  breadboard830,
  arduinoNano,
  esp32DevKit,
  esp8266Wemos,
  resistor,
  ledRed,
  ledGreen,
  ledBlue,
  pushButton,
  joystickPs,
  capacitorCeramic,
  npnTransistor,
  dht22,
  potentiometer,
  oledI2c,
  esp32s3Pico,
  ky_018,
  dht11,
  hc_sr04,
  tcrt5000,
  max72198,
  ath20_bmp280,
  lcd1602i2c,
];

// Osadzone symbole (z PcbView) — runtime rejestr, persystencja: schema.embeddedParts.
const EMBEDDED_PARTS = new Map<string, PartDef>();

export function registerEmbeddedPart(def: PartDef): void {
  EMBEDDED_PARTS.set(def.id, def);
}

export function getPartDef(id: string): PartDef | undefined {
  return EMBEDDED_PARTS.get(id) ?? PART_LIBRARY.find(p => p.id === id);
}

export const CATEGORY_ORDER: PartCategory[] = [
  'board', 'microcontroller', 'sensor', 'display', 'active', 'passive', 'power',
];

export const CATEGORY_LABEL: Record<PartCategory, string> = {
  board: 'Boards',
  microcontroller: 'Microcontrollers',
  sensor: 'Sensors',
  display: 'Displays',
  active: 'Active',
  passive: 'Passive',
  power: 'Power',
};
