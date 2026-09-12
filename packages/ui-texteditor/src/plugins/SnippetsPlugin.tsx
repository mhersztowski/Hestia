/**
 * Snippets Plugin
 *
 * Two-tab sidebar panel:
 *  - Snippets : text / code snippets loaded from /home/editorsnippets/*.json,
 *               inserted at cursor via Monaco's built-in snippet engine
 *               (supports VS Code-style ${1:placeholder} tabstops).
 *  - Templates: file/project skeletons loaded from
 *               /home/editorsnippets/templates/<name>/
 *               Each template directory must contain a template.json manifest
 *               and any number of files that get copied to a chosen destination.
 *
 * Snippet JSON format  (/home/editorsnippets/some-name.json):
 * ```json
 * [
 *   {
 *     "name": "WiFi Connect",
 *     "description": "Connect to WiFi in MicroPython",
 *     "language": "python",        // optional — omit or "*" for all languages
 *     "body": "import network\n..."  // VS Code snippet syntax supported
 *   }
 * ]
 * ```
 *
 * Template manifest  (/home/editorsnippets/templates/<name>/template.json):
 * ```json
 * { "name": "MicroPython Sensor", "description": "Basic sensor project" }
 * ```
 * All other files/subdirectories inside the template directory are copied
 * verbatim (preserving relative paths) when the user creates from template.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as monaco from 'monaco-editor';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SeedIcon from '@mui/icons-material/AutoFixHigh';
import CodeIcon from '@mui/icons-material/Code';
import type { FileSystemProvider, DirectoryEntry } from '@hestia/core';
import { FileType } from '@hestia/core';
import { defineEditorPlugin, globalEventBus } from '../monaco';

/* ── Types ────────────────────────────────────────────────────────────────────*/

interface EditorSnippet {
  name: string;
  description?: string;
  /** 'python' | 'cpp' | 'typescript' | 'javascript' | '*' | omit = all */
  language?: string;
  /** e.g. 'Arduino' | 'MicroPython' | 'Python' | 'Node.js' — shown as filter chip */
  category?: string;
  body: string;
}

interface SnippetGroup {
  /** filename without extension — used as group label */
  file: string;
  snippets: EditorSnippet[];
}

interface TemplateManifest {
  name: string;
  description?: string;
}

interface TemplateFile {
  /** relative path within the template directory */
  relativePath: string;
  content: Uint8Array;
}

interface Template {
  dirName: string;
  manifest: TemplateManifest;
  files: TemplateFile[];
}

/* ── Paths ────────────────────────────────────────────────────────────────────*/

const SNIPPETS_DIR = '/home/editorsnippets';
const TEMPLATES_DIR = '/home/editorsnippets/templates';

/* ── Language helpers ─────────────────────────────────────────────────────────*/

function langFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.ino') || lower.endsWith('.cpp') || lower.endsWith('.c') || lower.endsWith('.h')) return 'cpp';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.json')) return 'json';
  return '';
}

const LANG_LABEL: Record<string, string> = {
  python: 'Python', cpp: 'C/C++', typescript: 'TypeScript',
  javascript: 'JavaScript', markdown: 'Markdown', json: 'JSON',
};

const LANG_COLOR: Record<string, string> = {
  python: '#3572a5', cpp: '#f34b7d', typescript: '#3178c6',
  javascript: '#f0db4f', markdown: '#083fa1', json: '#cb7a35',
};

/* ── Category helpers ─────────────────────────────────────────────────────────*/

/** Derive a display category from a group file name when snippet.category is absent. */
function categoryFromGroup(groupName: string): string {
  const n = groupName.toLowerCase();
  if (n === 'arduino') return 'Arduino';
  if (n === 'micropython') return 'MicroPython';
  if (n === 'python') return 'Python';
  if (n === 'nodejs' || n === 'node') return 'Node.js';
  return groupName;
}

/** Resolve the effective category for a snippet (explicit > derived from group). */
function resolveCategory(snippet: EditorSnippet, groupName: string): string {
  return snippet.category?.trim() || categoryFromGroup(groupName);
}

const CATEGORY_COLOR: Record<string, string> = {
  'Arduino':     '#00979d',
  'MicroPython': '#2b5b84',
  'Python':      '#3572a5',
  'Node.js':     '#68a063',
};

/* ── Placeholder parsing ──────────────────────────────────────────────────────*/

interface SnippetField {
  index: number;
  /** Display label derived from the first occurrence of this index */
  label: string;
}

/** Extract unique ordered placeholder fields from a VS Code snippet body. */
function parsePlaceholders(body: string): SnippetField[] {
  const re = /\$\{(\d+):([^}]+)\}/g;
  const seen = new Map<number, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const idx = Number(m[1]);
    if (!seen.has(idx)) seen.set(idx, m[2]);
  }
  return [...seen.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, label]) => ({ index, label }));
}

/** Fill a snippet body by replacing all `${N:...}` with the provided values map. */
function fillSnippet(body: string, values: Map<number, string>): string {
  return body.replace(/\$\{(\d+):([^}]+)\}/g, (_, idxStr) => {
    return values.get(Number(idxStr)) ?? '';
  });
}

/* ── Monaco insert ────────────────────────────────────────────────────────────*/

function insertIntoEditor(editor: monaco.editor.ICodeEditor | null, text: string): void {
  if (!editor) {
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }
  const selection = editor.getSelection();
  const range = selection ?? new monaco.Range(1, 1, 1, 1);
  editor.executeEdits('snippets-plugin', [{ range, text, forceMoveMarkers: true }]);
  // Move cursor to end of inserted text
  const model = editor.getModel();
  if (model) {
    const lines = text.split('\n');
    const endLine = range.startLineNumber + lines.length - 1;
    const endCol = lines.length === 1
      ? range.startColumn + text.length
      : lines[lines.length - 1].length + 1;
    editor.setPosition({ lineNumber: endLine, column: endCol });
  }
  editor.focus();
}

/* ── VFS helpers ──────────────────────────────────────────────────────────────*/

async function readTextFile(vfs: FileSystemProvider, path: string): Promise<string> {
  const bytes = await vfs.readFile(path);
  return new TextDecoder().decode(bytes);
}

async function ensureDir(vfs: FileSystemProvider, path: string): Promise<void> {
  try { await vfs.stat(path); } catch {
    try { await vfs.mkdir?.(path); } catch { /* ignore */ }
  }
}

/** Recursively list all file entries under `dir`, returning relative paths. */
async function listFilesRecursive(
  vfs: FileSystemProvider, dir: string, prefix = '',
): Promise<{ rel: string; bytes: Uint8Array }[]> {
  const result: { rel: string; bytes: Uint8Array }[] = [];
  let entries: DirectoryEntry[] = [];
  try { entries = await vfs.readDirectory(dir); } catch { return result; }
  for (const { name, type } of entries) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const full = `${dir}/${name}`;
    if (type === FileType.Directory) {
      result.push(...await listFilesRecursive(vfs, full, rel));
    } else {
      try {
        const bytes = await vfs.readFile(full);
        result.push({ rel, bytes });
      } catch { /* skip unreadable */ }
    }
  }
  return result;
}

/* ── Builtin / seed snippets ──────────────────────────────────────────────────*/

const SEED_FILES: Record<string, EditorSnippet[]> = {
  'micropython.json': [
    {
      name: 'WiFi Connect',
      description: 'Connect to WiFi network',
      category: 'MicroPython',
      language: 'python',
      body: "import network\nimport time\n\nwlan = network.WLAN(network.STA_IF)\nwlan.active(True)\nif not wlan.isconnected():\n    wlan.connect('${1:SSID}', '${2:PASSWORD}')\n    while not wlan.isconnected():\n        time.sleep(0.5)\nprint('IP:', wlan.ifconfig()[0])",
    },
    {
      name: 'MQTT Publish',
      description: 'Publish a value via umqtt.simple',
      category: 'MicroPython',
      language: 'python',
      body: "from umqtt.simple import MQTTClient\n\nclient = MQTTClient('${1:device_id}', '${2:broker_host}')\nclient.connect()\nclient.publish(b'${3:topic}', b'${4:payload}')\nclient.disconnect()",
    },
    {
      name: 'I2C Scan',
      description: 'Scan I2C bus for devices',
      category: 'MicroPython',
      language: 'python',
      body: "from machine import I2C, Pin\n\ni2c = I2C(${1:0}, scl=Pin(${2:22}), sda=Pin(${3:21}), freq=400000)\ndevices = i2c.scan()\nprint('I2C devices:', [hex(d) for d in devices])",
    },
    {
      name: 'ADC Read',
      description: 'Read analog value from ADC pin',
      category: 'MicroPython',
      language: 'python',
      body: "from machine import ADC, Pin\n\nadc = ADC(Pin(${1:34}))\nadc.atten(ADC.ATTN_11DB)    # 0-3.6 V\nadc.width(ADC.WIDTH_12BIT)  # 0-4095\n\nraw = adc.read()\nvoltage = raw / 4095 * 3.6\nprint(f'raw={raw}  voltage={voltage:.3f} V')",
    },
    {
      name: 'Timer Interval',
      description: 'Run a function on a periodic timer',
      category: 'MicroPython',
      language: 'python',
      body: "from machine import Timer\n\ndef on_tick(t):\n    ${1:pass}\n\ntim = Timer(${2:0})\ntim.init(period=${3:1000}, mode=Timer.PERIODIC, callback=on_tick)",
    },
    {
      name: 'SSD1306 OLED Hello',
      description: 'Show text on SSD1306 OLED display',
      category: 'MicroPython',
      language: 'python',
      body: "from machine import I2C, Pin\nimport ssd1306\n\ni2c = I2C(${1:0}, scl=Pin(${2:22}), sda=Pin(${3:21}))\noled = ssd1306.SSD1306_I2C(128, 64, i2c)\noled.fill(0)\noled.text('${4:Hello World}', 0, 0)\noled.show()",
    },
    {
      name: 'Deep Sleep',
      description: 'Enter deep sleep for N seconds',
      category: 'MicroPython',
      language: 'python',
      body: "import machine\n\nmachine.deepsleep(${1:10} * 1000)  # ms",
    },
  ],

  'arduino.json': [
    {
      name: 'Setup + Loop',
      description: 'Arduino sketch skeleton',
      category: 'Arduino',
      language: 'cpp',
      body: "void setup() {\n  Serial.begin(115200);\n  ${1:// init}\n}\n\nvoid loop() {\n  ${2:// main code}\n}",
    },
    {
      name: 'WiFi Connect (ESP32)',
      description: 'Connect to WiFi on ESP32',
      category: 'Arduino',
      language: 'cpp',
      body: "#include <WiFi.h>\n\nconst char* ssid     = \"${1:SSID}\";\nconst char* password = \"${2:PASSWORD}\";\n\nvoid connectWifi() {\n  WiFi.begin(ssid, password);\n  while (WiFi.status() != WL_CONNECTED) {\n    delay(500);\n    Serial.print(\".\");\n  }\n  Serial.println();\n  Serial.print(\"IP: \");\n  Serial.println(WiFi.localIP());\n}",
    },
    {
      name: 'Blink LED',
      description: 'Blink onboard LED',
      category: 'Arduino',
      language: 'cpp',
      body: "const int LED_PIN = ${1:2};\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(${2:500});\n  digitalWrite(LED_PIN, LOW);\n  delay(${2});\n}",
    },
    {
      name: 'Serial Debug',
      description: 'Serial.printf debug helper macro',
      category: 'Arduino',
      language: 'cpp',
      body: '#define DBG(fmt, ...) Serial.printf("[DBG] " fmt "\\n", ##__VA_ARGS__)',
    },
    {
      name: 'Read Analog',
      description: 'Read analog pin and map to range',
      category: 'Arduino',
      language: 'cpp',
      body: "int   raw    = analogRead(${1:34});                     // 0-4095\nfloat volt   = raw * (3.3f / 4095.0f);                // voltage\nint   mapped = map(raw, 0, 4095, ${2:0}, ${3:100});    // mapped value",
    },
    {
      name: 'MQTT Publish (PubSubClient)',
      description: 'Publish to MQTT broker with PubSubClient',
      category: 'Arduino',
      language: 'cpp',
      body: "#include <PubSubClient.h>\n#include <WiFi.h>\n\nWiFiClient wifiClient;\nPubSubClient mqtt(wifiClient);\n\nvoid setupMqtt() {\n  mqtt.setServer(\"${1:broker}\", ${2:1883});\n}\n\nvoid publishValue(float val) {\n  if (!mqtt.connected()) {\n    mqtt.connect(\"${3:device_id}\");\n  }\n  char buf[16];\n  snprintf(buf, sizeof(buf), \"%.2f\", val);\n  mqtt.publish(\"${4:topic}\", buf);\n}",
    },
    {
      name: 'millis() Timer',
      description: 'Non-blocking interval using millis()',
      category: 'Arduino',
      language: 'cpp',
      body: "unsigned long lastMs = 0;\nconst unsigned long INTERVAL = ${1:1000};\n\nvoid loop() {\n  if (millis() - lastMs >= INTERVAL) {\n    lastMs = millis();\n    ${2:// do something}\n  }\n}",
    },
  ],

  'python.json': [
    {
      name: 'HTTP GET',
      description: 'HTTP GET request with requests library',
      category: 'Python',
      language: 'python',
      body: "import requests\n\nr = requests.get('${1:https://api.example.com/data}')\nr.raise_for_status()\ndata = r.json()\nprint(data)",
    },
    {
      name: 'Read JSON File',
      description: 'Load a JSON file',
      category: 'Python',
      language: 'python',
      body: "import json\nfrom pathlib import Path\n\nwith Path('${1:data.json}').open() as f:\n    data = json.load(f)",
    },
    {
      name: 'Write JSON File',
      description: 'Save data to a JSON file',
      category: 'Python',
      language: 'python',
      body: "import json\nfrom pathlib import Path\n\nPath('${1:output.json}').write_text(\n    json.dumps(${2:data}, indent=2, ensure_ascii=False)\n)",
    },
    {
      name: 'Logging Setup',
      description: 'Configure standard logging',
      category: 'Python',
      language: 'python',
      body: "import logging\n\nlogging.basicConfig(\n    level=logging.${1:INFO},\n    format='%(asctime)s %(levelname)-8s %(name)s: %(message)s',\n)\nlog = logging.getLogger(__name__)",
    },
    {
      name: 'Argparse',
      description: 'CLI argument parser setup',
      category: 'Python',
      language: 'python',
      body: "import argparse\n\nparser = argparse.ArgumentParser(description='${1:Tool description}')\nparser.add_argument('${2:input}', help='${3:Input file}')\nparser.add_argument('--verbose', '-v', action='store_true')\nargs = parser.parse_args()",
    },
    {
      name: 'Context Manager',
      description: 'Custom context manager class',
      category: 'Python',
      language: 'python',
      body: "class ${1:Resource}:\n    def __enter__(self):\n        ${2:# setup}\n        return self\n\n    def __exit__(self, exc_type, exc_val, exc_tb):\n        ${3:# teardown}\n        return False",
    },
    {
      name: 'Dataclass',
      description: 'Python dataclass with type hints',
      category: 'Python',
      language: 'python',
      body: "from dataclasses import dataclass, field\n\n@dataclass\nclass ${1:MyData}:\n    ${2:name}: str\n    ${3:value}: float = 0.0\n    tags: list[str] = field(default_factory=list)",
    },
    {
      name: 'Async Main',
      description: 'asyncio entry point',
      category: 'Python',
      language: 'python',
      body: "import asyncio\n\nasync def main() -> None:\n    ${1:pass}\n\nif __name__ == '__main__':\n    asyncio.run(main())",
    },
  ],

  'nodejs.json': [
    {
      name: 'HTTP Server',
      description: 'Minimal Node.js HTTP server',
      category: 'Node.js',
      language: 'javascript',
      body: "const http = require('http');\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ ok: true }));\n});\n\nserver.listen(${1:3000}, () => {\n  console.log('Listening on http://localhost:${1:3000}');\n});",
    },
    {
      name: 'Express Route',
      description: 'Express.js GET/POST route handler',
      category: 'Node.js',
      language: 'javascript',
      body: "const express = require('express');\nconst router = express.Router();\n\nrouter.get('/${1:path}', async (req, res) => {\n  try {\n    const data = ${2:// fetch data};\n    res.json(data);\n  } catch (err) {\n    res.status(500).json({ error: err.message });\n  }\n});\n\nmodule.exports = router;",
    },
    {
      name: 'Read File (async)',
      description: 'Read a file with fs/promises',
      category: 'Node.js',
      language: 'javascript',
      body: "const { readFile } = require('fs/promises');\n\nconst text = await readFile('${1:file.txt}', 'utf-8');\nconsole.log(text);",
    },
    {
      name: 'fetch GET',
      description: 'HTTP GET with native fetch API',
      category: 'Node.js',
      language: 'javascript',
      body: "const res = await fetch('${1:https://api.example.com/data}');\nif (!res.ok) throw new Error(`HTTP ${res.status}`);\nconst data = await res.json();\nconsole.log(data);",
    },
    {
      name: 'Promise.all',
      description: 'Run async tasks in parallel',
      category: 'Node.js',
      language: 'javascript',
      body: "const [${1:result1}, ${2:result2}] = await Promise.all([\n  ${3:task1()},\n  ${4:task2()},\n]);",
    },
    {
      name: 'Child Process (spawn)',
      description: 'Spawn a child process and stream output',
      category: 'Node.js',
      language: 'javascript',
      body: "const { spawn } = require('child_process');\n\nconst proc = spawn('${1:node}', ['${2:script.js}'], { shell: true });\nproc.stdout.on('data', (d) => process.stdout.write(d));\nproc.stderr.on('data', (d) => process.stderr.write(d));\nproc.on('close', (code) => console.log('Exit:', code));",
    },
    {
      name: 'TypeScript Express App',
      description: 'Express entry point in TypeScript',
      category: 'Node.js',
      language: 'typescript',
      body: "import express from 'express';\n\nconst app = express();\napp.use(express.json());\n\napp.get('/${1:health}', (_req, res) => {\n  res.json({ ok: true });\n});\n\nconst PORT = Number(process.env.PORT ?? ${2:3000});\napp.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));",
    },
    {
      name: 'MQTT Publish (mqtt.js)',
      description: 'Publish to MQTT broker with mqtt package',
      category: 'Node.js',
      language: 'javascript',
      body: "const mqtt = require('mqtt');\n\nconst client = mqtt.connect('mqtt://${1:localhost}:${2:1883}');\nclient.on('connect', () => {\n  client.publish('${3:topic}', '${4:payload}', { qos: 1 }, (err) => {\n    if (err) console.error(err);\n    client.end();\n  });\n});",
    },
  ],
};

/* Example template seed data ─────────────────────────────────────────────────*/

interface SeedTemplate {
  dirName: string;
  manifest: TemplateManifest;
  files: { rel: string; content: string }[];
}

const SEED_TEMPLATES: SeedTemplate[] = [
  {
    dirName: 'micropython-sensor',
    manifest: {
      name: 'MicroPython Sensor',
      description: 'ESP32 sensor with WiFi + MQTT reporting',
    },
    files: [
      {
        rel: 'project.json',
        content: JSON.stringify(
          { id: '', name: 'MicroPython Sensor', platform: 'uPython', boardProfileKey: 'esp32s3_pico' },
          null, 2,
        ),
      },
      {
        rel: 'sketches/main/main.py',
        content: [
          '# MicroPython Sensor — generated from template',
          'import network, time',
          'from machine import ADC, Pin',
          'from umqtt.simple import MQTTClient',
          '',
          'WIFI_SSID = "YOUR_SSID"',
          'WIFI_PASS = "YOUR_PASSWORD"',
          'BROKER    = "192.168.0.1"',
          'TOPIC     = b"sensor/value"',
          '',
          'def connect_wifi():',
          '    wlan = network.WLAN(network.STA_IF)',
          '    wlan.active(True)',
          '    if not wlan.isconnected():',
          '        wlan.connect(WIFI_SSID, WIFI_PASS)',
          '        while not wlan.isconnected():',
          '            time.sleep(0.5)',
          "    print('IP:', wlan.ifconfig()[0])",
          '',
          'def main():',
          '    connect_wifi()',
          "    client = MQTTClient('sensor', BROKER)",
          '    client.connect()',
          '    adc = ADC(Pin(34))',
          '    adc.atten(ADC.ATTN_11DB)',
          '    while True:',
          '        raw = adc.read()',
          "        client.publish(TOPIC, str(raw).encode())",
          '        time.sleep(5)',
          '',
          'main()',
        ].join('\n'),
      },
      {
        rel: 'README.md',
        content: [
          '# MicroPython Sensor',
          '',
          'Connect an analog sensor to pin 34.',
          'Edit `WIFI_SSID`, `WIFI_PASS`, and `BROKER` in `main.py`.',
          '',
          '## Deploy',
          '1. Open project in editor.',
          '2. Press **Flash** to upload.',
        ].join('\n'),
      },
    ],
  },
  {
    dirName: 'arduino-esp32-starter',
    manifest: {
      name: 'Arduino ESP32 Starter',
      description: 'ESP32 with WiFi, MQTT and a blinking LED',
    },
    files: [
      {
        rel: 'project.json',
        content: JSON.stringify(
          { id: '', name: 'Arduino ESP32 Starter', platform: 'Arduino', boardProfileKey: 'esp32s3_pico' },
          null, 2,
        ),
      },
      {
        rel: 'sketches/firmware/firmware.ino',
        content: [
          '// Arduino ESP32 Starter — generated from template',
          '#include <WiFi.h>',
          '#include <PubSubClient.h>',
          '',
          'const char* SSID     = "YOUR_SSID";',
          'const char* PASSWORD = "YOUR_PASSWORD";',
          'const char* BROKER   = "192.168.0.1";',
          'const int   LED      = 2;',
          '',
          'WiFiClient   wifiClient;',
          'PubSubClient mqtt(wifiClient);',
          '',
          'void setup() {',
          '  Serial.begin(115200);',
          '  pinMode(LED, OUTPUT);',
          '  WiFi.begin(SSID, PASSWORD);',
          '  while (WiFi.status() != WL_CONNECTED) { delay(500); }',
          '  Serial.println(WiFi.localIP());',
          '  mqtt.setServer(BROKER, 1883);',
          '}',
          '',
          'void loop() {',
          '  if (!mqtt.connected()) mqtt.connect("esp32");',
          '  mqtt.loop();',
          '  digitalWrite(LED, !digitalRead(LED));',
          '  delay(1000);',
          '}',
        ].join('\n'),
      },
      {
        rel: 'README.md',
        content: [
          '# Arduino ESP32 Starter',
          '',
          'Edit `SSID`, `PASSWORD`, and `BROKER` in `firmware.ino`.',
          '',
          '## Build & Flash',
          '1. Open project in editor.',
          '2. Press **Compile** (F7) then **Flash** (F8).',
        ].join('\n'),
      },
    ],
  },
  {
    dirName: 'python-script',
    manifest: {
      name: 'Python Script',
      description: 'Python script with argparse, logging, and config',
    },
    files: [
      {
        rel: 'project.json',
        content: JSON.stringify(
          { id: '', name: 'Python Script', platform: 'Python' },
          null, 2,
        ),
      },
      {
        rel: 'sketches/main/main.py',
        content: [
          '"""Python script — generated from template."""',
          'import argparse',
          'import json',
          'import logging',
          'from pathlib import Path',
          '',
          'logging.basicConfig(',
          "    level=logging.INFO,",
          "    format='%(asctime)s %(levelname)-8s %(name)s: %(message)s',",
          ')',
          "log = logging.getLogger(__name__)",
          '',
          '',
          'def main(args: argparse.Namespace) -> None:',
          "    log.info('Starting with args: %s', args)",
          '    # TODO: implement',
          '',
          '',
          'if __name__ == "__main__":',
          "    parser = argparse.ArgumentParser(description=__doc__)",
          "    parser.add_argument('input', nargs='?', help='Input file')",
          "    parser.add_argument('--verbose', '-v', action='store_true')",
          '    _args = parser.parse_args()',
          '    if _args.verbose:',
          '        logging.getLogger().setLevel(logging.DEBUG)',
          '    main(_args)',
        ].join('\n'),
      },
      {
        rel: 'README.md',
        content: [
          '# Python Script',
          '',
          'Run with:',
          '```bash',
          'python main.py --help',
          '```',
        ].join('\n'),
      },
    ],
  },
];

/* ── Seed writer ──────────────────────────────────────────────────────────────*/

async function seedExamplesToVfs(vfs: FileSystemProvider): Promise<void> {
  await ensureDir(vfs, SNIPPETS_DIR);
  const enc = new TextEncoder();
  for (const [filename, snippets] of Object.entries(SEED_FILES)) {
    const path = `${SNIPPETS_DIR}/${filename}`;
    await vfs.writeFile?.(path, enc.encode(JSON.stringify(snippets, null, 2)), { create: true, overwrite: true });
  }
  await ensureDir(vfs, TEMPLATES_DIR);
  for (const tmpl of SEED_TEMPLATES) {
    const base = `${TEMPLATES_DIR}/${tmpl.dirName}`;
    await ensureDir(vfs, base);
    await vfs.writeFile?.(`${base}/template.json`, enc.encode(JSON.stringify(tmpl.manifest, null, 2)), { create: true, overwrite: true });
    for (const file of tmpl.files) {
      const parts = file.rel.split('/');
      for (let i = 1; i < parts.length; i++) {
        await ensureDir(vfs, `${base}/${parts.slice(0, i).join('/')}`);
      }
      await vfs.writeFile?.(`${base}/${file.rel}`, enc.encode(file.content), { create: true, overwrite: true });
    }
  }
}

/* ── VFS loader ───────────────────────────────────────────────────────────────*/

async function loadSnippetsFromVfs(vfs: FileSystemProvider): Promise<SnippetGroup[]> {
  let entries: DirectoryEntry[] = [];
  try { entries = await vfs.readDirectory(SNIPPETS_DIR); } catch { return []; }
  const groups: SnippetGroup[] = [];
  for (const { name, type } of entries) {
    if (type !== FileType.File || !name.endsWith('.json')) continue;
    try {
      const text = await readTextFile(vfs, `${SNIPPETS_DIR}/${name}`);
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        groups.push({ file: name.replace(/\.json$/, ''), snippets: data as EditorSnippet[] });
      }
    } catch { /* skip malformed */ }
  }
  return groups;
}

async function loadTemplatesFromVfs(vfs: FileSystemProvider): Promise<Template[]> {
  let entries: DirectoryEntry[] = [];
  try { entries = await vfs.readDirectory(TEMPLATES_DIR); } catch { return []; }
  const templates: Template[] = [];
  for (const { name, type } of entries) {
    if (type !== FileType.Directory) continue;
    const base = `${TEMPLATES_DIR}/${name}`;
    let manifest: TemplateManifest = { name };
    try {
      const txt = await readTextFile(vfs, `${base}/template.json`);
      manifest = JSON.parse(txt) as TemplateManifest;
    } catch { /* use defaults */ }
    const rawFiles = await listFilesRecursive(vfs, base);
    const files = rawFiles
      .filter(({ rel }) => rel !== 'template.json')
      .map(({ rel, bytes }) => ({ relativePath: rel, content: bytes }));
    templates.push({ dirName: name, manifest, files });
  }
  return templates;
}

/* ── Snippet form dialog ──────────────────────────────────────────────────────*/

function SnippetFormDialog({
  snippet,
  fields,
  onInsert,
  onClose,
}: {
  snippet: EditorSnippet;
  fields: SnippetField[];
  onInsert: (body: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Map<number, string>>(
    () => new Map(fields.map((f) => [f.index, f.label])),
  );
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => firstRef.current?.focus(), 50); }, []);

  const handleSubmit = () => {
    onInsert(fillSnippet(snippet.body, values));
    onClose();
  };

  return (
    <Dialog open onClose={onClose}
      PaperProps={{ sx: { background: '#1e1e2e', border: '1px solid #313244', minWidth: 360 } }}>
      <DialogTitle sx={{ fontSize: 13, fontWeight: 600, color: '#cba6f7', pb: 0.5 }}>
        {snippet.name}
      </DialogTitle>
      <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {snippet.description && (
          <Typography sx={{ fontSize: 11, color: '#6c7086' }}>{snippet.description}</Typography>
        )}
        {fields.map((f, i) => (
          <Box key={f.index}>
            <Typography sx={{ fontSize: 10, color: '#a6adc8', mb: 0.5 }}>{f.label}</Typography>
            <TextField
              inputRef={i === 0 ? firstRef : undefined}
              size="small"
              fullWidth
              value={values.get(f.index) ?? ''}
              onChange={(e) => setValues((prev) => new Map(prev).set(f.index, e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
              sx={{
                '& .MuiInputBase-root': { fontSize: 12, background: '#13131e', color: '#cdd6f4' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
                '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#cba6f7' },
              }}
            />
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button size="small" onClick={onClose}
          sx={{ fontSize: 11, color: '#6c7086', textTransform: 'none' }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSubmit}
          sx={{ fontSize: 11, textTransform: 'none', bgcolor: '#cba6f7', color: '#1e1e2e', '&:hover': { bgcolor: '#b894f5' } }}>
          Insert
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ── Panel ────────────────────────────────────────────────────────────────────*/

const PANEL_ID = 'builtin.snippets.panel';

interface CreateDialogState {
  template: Template;
  dest: string;
  creating: boolean;
  error: string;
}

function SnippetsPanel({ vfsProvider }: { vfsProvider: FileSystemProvider }) {
  const [tab, setTab] = useState<'snippets' | 'templates'>('snippets');
  const [language, setLanguage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [groups, setGroups] = useState<SnippetGroup[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [createDlg, setCreateDlg] = useState<CreateDialogState | null>(null);
  const [copyLabel, setCopyLabel] = useState<string>('');
  const [formSnippet, setFormSnippet] = useState<{ snippet: EditorSnippet; fields: SnippetField[] } | null>(null);
  const targetEditorRef = useRef<monaco.editor.ICodeEditor | null>(null);

  // Subscribe to model changes so language filter stays in sync
  useEffect(() => {
    const unsub = globalEventBus.on<{ uri: string }>('system:editor:modelChanged', ({ uri }) => {
      setLanguage(langFromUri(uri));
    });
    return () => unsub();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, t] = await Promise.all([
        loadSnippetsFromVfs(vfsProvider),
        loadTemplatesFromVfs(vfsProvider),
      ]);
      setGroups(g);
      setTemplates(t);
      setSeeded(g.length > 0 || t.length > 0);
    } finally {
      setLoading(false);
    }
  }, [vfsProvider]);

  useEffect(() => { load(); }, [load]);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      await seedExamplesToVfs(vfsProvider);
      await load();
    } finally {
      setSeeding(false);
    }
  }, [vfsProvider, load]);

  const handleInsert = useCallback((snippet: EditorSnippet) => {
    const editors = monaco.editor.getEditors();
    const active = editors.find((e) => e.hasTextFocus()) ?? editors[0] ?? null;
    const fields = parsePlaceholders(snippet.body);
    if (fields.length > 0) {
      targetEditorRef.current = active;
      setFormSnippet({ snippet, fields });
    } else {
      insertIntoEditor(active, snippet.body);
      if (!active) {
        setCopyLabel(snippet.name);
        setTimeout(() => setCopyLabel(''), 2000);
      }
    }
  }, []);

  const handleFormInsert = useCallback((body: string) => {
    const editor = targetEditorRef.current;
    targetEditorRef.current = null;
    insertIntoEditor(editor, body);
  }, []);

  const handleCopy = useCallback((snippet: EditorSnippet) => {
    navigator.clipboard.writeText(snippet.body).catch(() => {});
    setCopyLabel(snippet.name);
    setTimeout(() => setCopyLabel(''), 1800);
  }, []);

  const handleOpenCreateDialog = useCallback((template: Template) => {
    setCreateDlg({ template, dest: '/home/', creating: false, error: '' });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!createDlg) return;
    const { template, dest } = createDlg;
    setCreateDlg((d) => d ? { ...d, creating: true, error: '' } : d);
    const enc = new TextEncoder();
    try {
      await ensureDir(vfsProvider, dest);
      for (const file of template.files) {
        const parts = file.relativePath.split('/');
        for (let i = 1; i < parts.length; i++) {
          await ensureDir(vfsProvider, `${dest}/${parts.slice(0, i).join('/')}`);
        }
        await vfsProvider.writeFile?.(
          `${dest}/${file.relativePath}`,
          file.content.length ? file.content : enc.encode(''),
          { create: true, overwrite: false },
        );
      }
      setCreateDlg(null);
    } catch (err) {
      setCreateDlg((d) => d ? { ...d, creating: false, error: String(err) } : d);
    }
  }, [vfsProvider, createDlg]);

  // All unique categories from loaded snippets
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const s of g.snippets) {
        set.add(resolveCategory(s, g.file));
      }
    }
    return Array.from(set).sort();
  }, [groups]);

  // Filtered snippets — category filter takes precedence over language auto-filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const result: { group: string; snippet: EditorSnippet; category: string }[] = [];
    for (const g of groups) {
      for (const s of g.snippets) {
        const cat = resolveCategory(s, g.file);
        // Category filter (explicit selection) overrides language auto-filter
        if (selectedCategory !== null) {
          if (cat !== selectedCategory) continue;
        } else if (language && s.language && s.language !== '*' && s.language !== language) {
          continue;
        }
        if (q && !s.name.toLowerCase().includes(q) && !(s.description ?? '').toLowerCase().includes(q) && !s.body.toLowerCase().includes(q)) continue;
        result.push({ group: g.file, snippet: s, category: cat });
      }
    }
    return result;
  }, [groups, language, selectedCategory, search]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#181825', color: '#cdd6f4', fontSize: 11 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, gap: 0.5, borderBottom: '1px solid #313244', background: '#13131e' }}>
        <CodeIcon sx={{ fontSize: 14, color: '#cba6f7' }} />
        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#cba6f7' }}>Snippets</Typography>
        {language && (
          <Chip label={LANG_LABEL[language] ?? language} size="small"
            sx={{ fontSize: 9, height: 16, bgcolor: (LANG_COLOR[language] ?? '#444') + '33',
              color: LANG_COLOR[language] ?? '#cdd6f4', border: 'none' }} />
        )}
        <Tooltip title="Reload from VFS">
          <IconButton size="small" onClick={load} disabled={loading} sx={{ p: 0.25, color: '#6c7086' }}>
            <RefreshIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
        {!seeded && (
          <Tooltip title="Seed example snippets & templates to /home/editorsnippets/">
            <IconButton size="small" onClick={handleSeed} disabled={seeding} sx={{ p: 0.25, color: '#a6e3a1' }}>
              <SeedIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth"
        sx={{
          minHeight: 28, borderBottom: '1px solid #313244',
          '& .MuiTab-root': { minHeight: 28, fontSize: 10, textTransform: 'none', color: '#6c7086', py: 0 },
          '& .Mui-selected': { color: '#cba6f7' },
          '& .MuiTabs-indicator': { backgroundColor: '#cba6f7', height: 2 },
        }}
      >
        <Tab value="snippets" label={`Snippets${groups.length ? ` (${filtered.length})` : ''}`} />
        <Tab value="templates" label={`Templates${templates.length ? ` (${templates.length})` : ''}`} />
      </Tabs>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={18} sx={{ color: '#cba6f7' }} />
        </Box>
      )}

      {/* ── Snippets tab ── */}
      {!loading && tab === 'snippets' && (
        <>
          <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid #1e1e2e' }}>
            <TextField
              size="small" fullWidth placeholder="Search snippets…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{
                '& .MuiInputBase-root': { fontSize: 11, background: '#1e1e2e', color: '#cdd6f4', height: 26 },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
                '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#585b70' },
                '& input': { py: 0, px: 1 },
              }}
            />
          </Box>

          {/* Category filter chips */}
          {allCategories.length > 0 && (
            <Box sx={{
              display: 'flex', gap: 0.5, px: 1, py: 0.5,
              overflowX: 'auto', borderBottom: '1px solid #1e1e2e',
              flexShrink: 0,
              '&::-webkit-scrollbar': { height: 3 },
              '&::-webkit-scrollbar-thumb': { background: '#313244', borderRadius: 2 },
            }}>
              <Chip
                label="All"
                size="small"
                onClick={() => setSelectedCategory(null)}
                sx={{
                  fontSize: 9, height: 18, cursor: 'pointer', flexShrink: 0,
                  bgcolor: selectedCategory === null ? '#cba6f733' : '#1e1e2e',
                  color: selectedCategory === null ? '#cba6f7' : '#585b70',
                  border: selectedCategory === null ? '1px solid #cba6f755' : '1px solid #313244',
                  '&:hover': { bgcolor: '#cba6f720' },
                }}
              />
              {allCategories.map((cat) => {
                const active = selectedCategory === cat;
                const color = CATEGORY_COLOR[cat] ?? '#585b70';
                return (
                  <Chip
                    key={cat}
                    label={cat}
                    size="small"
                    onClick={() => setSelectedCategory(active ? null : cat)}
                    sx={{
                      fontSize: 9, height: 18, cursor: 'pointer', flexShrink: 0,
                      bgcolor: active ? color + '33' : '#1e1e2e',
                      color: active ? color : '#585b70',
                      border: active ? `1px solid ${color}55` : '1px solid #313244',
                      '&:hover': { bgcolor: color + '22' },
                    }}
                  />
                );
              })}
            </Box>
          )}

          {groups.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 11, color: '#6c7086', mb: 1 }}>
                No snippets found in<br />
                <code style={{ color: '#cba6f7' }}>/home/editorsnippets/</code>
              </Typography>
              <Button size="small" startIcon={<SeedIcon />} onClick={handleSeed} disabled={seeding}
                sx={{ fontSize: 10, color: '#a6e3a1', textTransform: 'none' }}>
                {seeding ? 'Seeding…' : 'Seed examples'}
              </Button>
            </Box>
          ) : filtered.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 11, color: '#6c7086' }}>No matching snippets.</Typography>
              {language && (
                <Typography sx={{ fontSize: 10, color: '#45475a', mt: 0.5 }}>
                  Language filter: <strong>{LANG_LABEL[language] ?? language}</strong>
                </Typography>
              )}
            </Box>
          ) : (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {filtered.map(({ group, snippet, category }, i) => (
                <SnippetCard
                  key={`${group}/${snippet.name}/${i}`}
                  snippet={snippet}
                  category={category}
                  copied={copyLabel === snippet.name}
                  onInsert={() => handleInsert(snippet)}
                  onCopy={() => handleCopy(snippet)}
                  onCategoryClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
                />
              ))}
            </Box>
          )}
        </>
      )}

      {/* ── Templates tab ── */}
      {!loading && tab === 'templates' && (
        <>
          {templates.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 11, color: '#6c7086', mb: 1 }}>
                No templates found in<br />
                <code style={{ color: '#cba6f7' }}>/home/editorsnippets/templates/</code>
              </Typography>
              <Button size="small" startIcon={<SeedIcon />} onClick={handleSeed} disabled={seeding}
                sx={{ fontSize: 10, color: '#a6e3a1', textTransform: 'none' }}>
                {seeding ? 'Seeding…' : 'Seed examples'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {templates.map((t) => (
                <TemplateCard key={t.dirName} template={t} onCreate={() => handleOpenCreateDialog(t)} />
              ))}
            </Box>
          )}
        </>
      )}

      {/* Footer hint */}
      {!loading && groups.length > 0 && (
        <Box sx={{ px: 1.5, py: 0.5, borderTop: '1px solid #1e1e2e', background: '#13131e' }}>
          <Typography sx={{ fontSize: 9, color: '#45475a' }}>
            Files in <code>/home/editorsnippets/</code> — click snippet to insert at cursor
          </Typography>
        </Box>
      )}

      {/* Snippet form dialog */}
      {formSnippet && (
        <SnippetFormDialog
          snippet={formSnippet.snippet}
          fields={formSnippet.fields}
          onInsert={handleFormInsert}
          onClose={() => setFormSnippet(null)}
        />
      )}

      {/* Create-from-template dialog */}
      {createDlg && (
        <Dialog open onClose={() => !createDlg.creating && setCreateDlg(null)}
          PaperProps={{ sx: { background: '#1e1e2e', border: '1px solid #313244', minWidth: 360 } }}>
          <DialogTitle sx={{ fontSize: 13, fontWeight: 600, color: '#cba6f7', pb: 0.5 }}>
            Create from template
          </DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <Typography sx={{ fontSize: 11, color: '#a6adc8', mb: 1.5 }}>
              <strong style={{ color: '#cdd6f4' }}>{createDlg.template.manifest.name}</strong>
              {createDlg.template.manifest.description && (
                <><br />{createDlg.template.manifest.description}</>
              )}
            </Typography>
            <Typography sx={{ fontSize: 10, color: '#6c7086', mb: 0.5 }}>
              Destination path (VFS)
            </Typography>
            <TextField
              size="small" fullWidth autoFocus
              value={createDlg.dest}
              onChange={(e) => setCreateDlg((d) => d ? { ...d, dest: e.target.value, error: '' } : d)}
              placeholder="/home/Projects/my-project"
              helperText={createDlg.error || `${createDlg.template.files.length} file(s) will be created`}
              error={!!createDlg.error}
              sx={{
                '& .MuiInputBase-root': { fontSize: 11, background: '#13131e', color: '#cdd6f4' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
                '& .MuiFormHelperText-root': { fontSize: 9, color: createDlg.error ? '#f38ba8' : '#6c7086' },
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 1.5 }}>
            <Button size="small" onClick={() => setCreateDlg(null)} disabled={createDlg.creating}
              sx={{ fontSize: 11, color: '#6c7086', textTransform: 'none' }}>
              Cancel
            </Button>
            <Button size="small" variant="contained" startIcon={<AddIcon />}
              onClick={handleCreate} disabled={createDlg.creating || !createDlg.dest.trim()}
              sx={{ fontSize: 11, textTransform: 'none', bgcolor: '#cba6f7', color: '#1e1e2e',
                '&:hover': { bgcolor: '#b894f5' } }}>
              {createDlg.creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────────────*/

function SnippetCard({
  snippet, category, copied, onInsert, onCopy, onCategoryClick,
}: {
  snippet: EditorSnippet;
  category: string;
  copied: boolean;
  onInsert: () => void;
  onCopy: () => void;
  onCategoryClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lang = snippet.language && snippet.language !== '*' ? snippet.language : null;
  const previewLines = snippet.body.split('\n').slice(0, 3).join('\n');
  const hasMore = snippet.body.split('\n').length > 3;
  const catColor = CATEGORY_COLOR[category] ?? '#585b70';

  return (
    <Box
      sx={{
        borderBottom: '1px solid #1e1e2e',
        '&:hover': { background: '#1e1e2e40' },
        cursor: 'pointer',
      }}
      onClick={onInsert}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', px: 1.5, pt: 0.75, pb: 0.25, gap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#cdd6f4', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {snippet.name}
          </Typography>
          {snippet.description && (
            <Typography sx={{ fontSize: 10, color: '#6c7086', lineHeight: 1.3 }}>
              {snippet.description}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center', flexShrink: 0 }}>
          {lang && (
            <Chip label={LANG_LABEL[lang] ?? lang} size="small"
              sx={{ fontSize: 8, height: 14, bgcolor: (LANG_COLOR[lang] ?? '#444') + '22',
                color: LANG_COLOR[lang] ?? '#cdd6f4', border: 'none' }} />
          )}
          <Tooltip title={`Filter: ${category}`}>
            <Chip
              label={category} size="small"
              onClick={(e) => { e.stopPropagation(); onCategoryClick(); }}
              sx={{
                fontSize: 8, height: 14, cursor: 'pointer',
                bgcolor: catColor + '22', color: catColor,
                border: `1px solid ${catColor}44`,
                '&:hover': { bgcolor: catColor + '44' },
              }}
            />
          </Tooltip>
          <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCopy(); }}
              sx={{ p: 0.25, color: copied ? '#a6e3a1' : '#45475a', '&:hover': { color: '#cdd6f4' } }}>
              <ContentCopyIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      {/* Code preview */}
      <Box
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        sx={{ mx: 1.5, mb: 0.75, borderRadius: 0.5, background: '#13131e', px: 1, py: 0.5, cursor: 'pointer' }}
      >
        <pre style={{ margin: 0, fontSize: 9, fontFamily: '"Fira Code","Cascadia Code",monospace', color: '#a6adc8', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
          {expanded ? snippet.body : (hasMore ? previewLines + '\n…' : previewLines)}
        </pre>
      </Box>
    </Box>
  );
}

function TemplateCard({ template, onCreate }: { template: Template; onCreate: () => void }) {
  return (
    <Box sx={{ borderBottom: '1px solid #1e1e2e', px: 1.5, py: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <FolderOpenIcon sx={{ fontSize: 13, color: '#f9e2af' }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#cdd6f4', flex: 1 }}>
          {template.manifest.name}
        </Typography>
        <Chip label={`${template.files.length} files`} size="small"
          sx={{ fontSize: 8, height: 14, bgcolor: '#313244', color: '#6c7086', border: 'none' }} />
      </Box>
      {template.manifest.description && (
        <Typography sx={{ fontSize: 10, color: '#6c7086', mb: 0.75 }}>
          {template.manifest.description}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mb: 0.5 }}>
        {template.files.slice(0, 6).map((f) => (
          <Chip key={f.relativePath} label={f.relativePath.split('/').pop()} size="small"
            sx={{ fontSize: 8, height: 14, bgcolor: '#1e1e2e', color: '#45475a', border: '1px solid #313244' }} />
        ))}
        {template.files.length > 6 && (
          <Chip label={`+${template.files.length - 6}`} size="small"
            sx={{ fontSize: 8, height: 14, bgcolor: '#1e1e2e', color: '#45475a', border: '1px solid #313244' }} />
        )}
      </Box>
      <Button size="small" startIcon={<AddIcon />} onClick={onCreate} fullWidth
        sx={{
          fontSize: 10, textTransform: 'none', color: '#cba6f7',
          border: '1px solid #cba6f744', '&:hover': { background: '#2d2040', border: '1px solid #cba6f7' },
        }}>
        Create from template…
      </Button>
    </Box>
  );
}

/* ── Plugin definition ────────────────────────────────────────────────────────*/

/**
 * Factory — pass the composite VFS provider so the plugin can load snippets
 * from the user's /home/editorsnippets/ directory.
 *
 * Usage in UserDataEditorPage:
 *   const snippetsPlugin = useMemo(() => createSnippetsPlugin(cfs), [cfs]);
 *   <MonacoMultiEditor plugins={[..., snippetsPlugin]} />
 */
export function createSnippetsPlugin(vfsProvider: FileSystemProvider) {
  // Capture in a ref so the React component closure always sees the current value
  const providerRef = { current: vfsProvider };

  const PanelComponent = () => <SnippetsPanel vfsProvider={providerRef.current} />;

  return defineEditorPlugin(
    {
      id: 'builtin.snippets',
      name: 'Snippets',
      version: '1.0.0',
      description: 'Text / code snippets and file templates loaded from /home/editorsnippets/',
      contributes: ['sidebar', 'commandpalette'],
    },

    (api) => {
      api.ui.sidebar.register({
        id: PANEL_ID,
        title: 'Snippets',
        icon: '{}',
        component: PanelComponent,
        order: 20,
      });

      api.ui.commandpalette.register({
        command: `${api.pluginId}:open`,
        title: 'Open Snippets Panel',
        category: 'Snippets',
      });

      api.commands.register('open', () => {
        api.ui.openSidebarPanel(PANEL_ID);
      });

      api.logger.info('Snippets plugin activated');
    },

    () => { /* disposables handled by PluginRegistry */ },
  );
}
