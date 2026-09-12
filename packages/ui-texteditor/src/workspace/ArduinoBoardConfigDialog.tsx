import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Select, MenuItem, FormControl, InputLabel,
  Typography, Chip, Box, Divider,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import type { VfsProjectContext } from '../vfs';

// ---------------------------------------------------------------------------
// Board option definitions (mirrors Arduino IDE Tools menu)
// ---------------------------------------------------------------------------

interface BoardOptionValue { value: string; label: string }
interface BoardOption { key: string; label: string; values: BoardOptionValue[]; defaultValue: string }
interface BoardOptionSet { baseFqbn: string; label: string; options: BoardOption[] }

const ESP32S3_PARTITION_SCHEMES: BoardOptionValue[] = [
  { value: 'default',           label: 'Default 4MB with SPIFFS (1.2MB APP/1.5MB SPIFFS)' },
  { value: 'defaultffat',       label: 'Default 4MB with FFAT (1.2MB APP/1.5MB FATFS)' },
  { value: 'default_8MB',       label: '8M Flash (3MB APP/1.5MB FAT)' },
  { value: 'minimal',           label: 'Minimal (1.3MB APP/700KB SPIFFS)' },
  { value: 'no_ota',            label: 'No OTA (2MB APP/2MB SPIFFS)' },
  { value: 'noota_3g',          label: 'No OTA (1MB APP/3MB SPIFFS)' },
  { value: 'noota_ffat',        label: 'No OTA (2MB APP/2MB FATFS)' },
  { value: 'noota_3gffat',      label: 'No OTA (1MB APP/3MB FATFS)' },
  { value: 'huge_app',          label: 'Huge APP (3MB No OTA/1MB SPIFFS)' },
  { value: 'min_spiffs',        label: 'Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)' },
  { value: 'fatflash',          label: '16M Flash (2MB APP/12.5MB FATFS)' },
  { value: 'app3M_fat9M_16MB',  label: '16M Flash (3MB APP/9MB FATFS)' },
  { value: 'rainmaker',         label: 'RainMaker 4MB' },
  { value: 'rainmaker_4MB_sec', label: 'RainMaker 4MB Secure' },
  { value: 'rainmaker_8MB',     label: 'RainMaker 8MB' },
];

const CPU_FREQS: BoardOptionValue[] = [
  { value: '240', label: '240MHz (WiFi)' },
  { value: '160', label: '160MHz (WiFi)' },
  { value: '80',  label: '80MHz (WiFi)' },
  { value: '40',  label: '40MHz' },
  { value: '20',  label: '20MHz' },
  { value: '10',  label: '10MHz' },
];

const DEBUG_LEVELS: BoardOptionValue[] = [
  { value: 'none',    label: 'None' },
  { value: 'error',   label: 'Error' },
  { value: 'warn',    label: 'Warn' },
  { value: 'info',    label: 'Info' },
  { value: 'debug',   label: 'Debug' },
  { value: 'verbose', label: 'Verbose' },
];

const BOARD_OPTION_SETS: BoardOptionSet[] = [
  {
    baseFqbn: 'esp32:esp32:esp32s3',
    label: 'ESP32-S3',
    options: [
      {
        key: 'CDCOnBoot',
        label: 'USB CDC On Boot',
        values: [
          { value: 'default', label: 'Disabled' },
          { value: 'cdc',     label: 'Enabled (required for native USB CDC)' },
        ],
        defaultValue: 'default',
      },
      {
        key: 'FlashMode',
        label: 'Flash Mode',
        values: [
          { value: 'qio',    label: 'QIO 80MHz' },
          { value: 'qio120', label: 'QIO 120MHz' },
          { value: 'dio',    label: 'DIO 80MHz' },
          { value: 'dout',   label: 'DOUT 80MHz' },
        ],
        defaultValue: 'qio',
      },
      {
        key: 'FlashSize',
        label: 'Flash Size',
        values: [
          { value: '4M',  label: '4MB (32Mb)' },
          { value: '8M',  label: '8MB (64Mb)' },
          { value: '16M', label: '16MB (128Mb)' },
          { value: '32M', label: '32MB (256Mb)' },
        ],
        defaultValue: '4M',
      },
      {
        key: 'PSRAM',
        label: 'PSRAM',
        values: [
          { value: 'disabled', label: 'Disabled' },
          { value: 'opi',      label: 'OPI PSRAM (required for S3R2/S3FH4R2 variants)' },
          { value: 'qspi',     label: 'QSPI PSRAM' },
        ],
        defaultValue: 'disabled',
      },
      {
        key: 'PartitionScheme',
        label: 'Partition Scheme',
        values: ESP32S3_PARTITION_SCHEMES,
        defaultValue: 'default',
      },
      {
        key: 'CPUFreq',
        label: 'CPU Frequency',
        values: CPU_FREQS,
        defaultValue: '240',
      },
      {
        key: 'UploadMode',
        label: 'Upload Mode',
        values: [
          { value: 'default', label: 'UART0 / Hardware CDC' },
          { value: 'cdc',     label: 'USB-OTG CDC (TinyUSB)' },
        ],
        defaultValue: 'default',
      },
      {
        key: 'DebugLevel',
        label: 'Core Debug Level',
        values: DEBUG_LEVELS,
        defaultValue: 'none',
      },
      {
        key: 'LoopCore',
        label: 'Arduino Runs On',
        values: [
          { value: '1', label: 'Core 1' },
          { value: '0', label: 'Core 0' },
        ],
        defaultValue: '1',
      },
      {
        key: 'EventsCore',
        label: 'Events Run On',
        values: [
          { value: '1', label: 'Core 1' },
          { value: '0', label: 'Core 0' },
        ],
        defaultValue: '1',
      },
    ],
  },
  {
    baseFqbn: 'esp32:esp32:esp32',
    label: 'ESP32',
    options: [
      {
        key: 'FlashMode',
        label: 'Flash Mode',
        values: [
          { value: 'qio',  label: 'QIO' },
          { value: 'qout', label: 'QOUT' },
          { value: 'dio',  label: 'DIO' },
          { value: 'dout', label: 'DOUT' },
        ],
        defaultValue: 'qio',
      },
      {
        key: 'FlashFreq',
        label: 'Flash Frequency',
        values: [
          { value: '80', label: '80MHz' },
          { value: '40', label: '40MHz' },
        ],
        defaultValue: '80',
      },
      {
        key: 'FlashSize',
        label: 'Flash Size',
        values: [
          { value: '2M',  label: '2MB (16Mb)' },
          { value: '4M',  label: '4MB (32Mb)' },
          { value: '8M',  label: '8MB (64Mb)' },
          { value: '16M', label: '16MB (128Mb)' },
          { value: '32M', label: '32MB (256Mb)' },
        ],
        defaultValue: '4M',
      },
      {
        key: 'PartitionScheme',
        label: 'Partition Scheme',
        values: ESP32S3_PARTITION_SCHEMES,
        defaultValue: 'default',
      },
      {
        key: 'CPUFreq',
        label: 'CPU Frequency',
        values: CPU_FREQS,
        defaultValue: '240',
      },
      {
        key: 'DebugLevel',
        label: 'Core Debug Level',
        values: DEBUG_LEVELS,
        defaultValue: 'none',
      },
    ],
  },
  {
    baseFqbn: 'esp8266:esp8266',
    label: 'ESP8266',
    options: [
      {
        key: 'CpuFrequency',
        label: 'CPU Frequency',
        values: [
          { value: '160', label: '160MHz' },
          { value: '80',  label: '80MHz' },
        ],
        defaultValue: '80',
      },
      {
        key: 'FlashSize',
        label: 'Flash Size',
        values: [
          { value: '512K',  label: '512K (no SPIFFS)' },
          { value: '1M64',  label: '1M (64K SPIFFS)' },
          { value: '1M128', label: '1M (128K SPIFFS)' },
          { value: '1M256', label: '1M (256K SPIFFS)' },
          { value: '4M1M',  label: '4M (1M SPIFFS)' },
          { value: '4M3M',  label: '4M (3M SPIFFS)' },
        ],
        defaultValue: '4M3M',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// FQBN helpers
// ---------------------------------------------------------------------------

function parseFqbn(fqbn: string): { base: string; options: Record<string, string> } {
  // Format: platform:arch:board  OR  platform:arch:board:key=val,key=val
  // The 4th colon separates the board name from options
  // Find 3rd colon: platform(0):arch(1):board(2):options(3)
  let count = 0;
  let splitAt = -1;
  for (let i = 0; i < fqbn.length; i++) {
    if (fqbn[i] === ':') { count++; if (count === 3) { splitAt = i; break; } }
  }
  if (splitAt === -1) return { base: fqbn, options: {} };
  const base = fqbn.slice(0, splitAt);
  const optStr = fqbn.slice(splitAt + 1);
  const options: Record<string, string> = {};
  for (const part of optStr.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) options[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
  }
  return { base, options };
}

function buildFqbn(base: string, options: Record<string, string>): string {
  const optStr = Object.entries(options).map(([k, v]) => `${k}=${v}`).join(',');
  return optStr ? `${base}:${optStr}` : base;
}

function findOptionSet(base: string): BoardOptionSet | null {
  // Match by exact base or by prefix (e.g. esp8266:esp8266:generic → esp8266:esp8266)
  return BOARD_OPTION_SETS.find(s => base.startsWith(s.baseFqbn)) ?? null;
}

// ---------------------------------------------------------------------------
// Default FQBN per board profile key (fallback when context has no fqbn)
// ---------------------------------------------------------------------------
const PROFILE_DEFAULT_FQBN: Record<string, string> = {
  uno:             'arduino:avr:uno',
  nano_328:        'arduino:avr:nano:cpu=atmega328',
  mega:            'arduino:avr:mega',
  leonardo:        'arduino:avr:leonardo',
  esp8266_huzzah:  'esp8266:esp8266:huzzah',
  esp8266_wemos_d1:'esp8266:esp8266:d1_mini',
  esp32_devkitc:   'esp32:esp32:esp32',
  esp32s3_devkitc: 'esp32:esp32:esp32s3',
  esp32s3_pico:    'esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=8M,PSRAM=opi',
  esp32s3_zero:    'esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=4M,PSRAM=opi',
};

// ---------------------------------------------------------------------------
// Dialog component
// ---------------------------------------------------------------------------

export interface ArduinoBoardConfigDialogProps {
  open: boolean;
  context: VfsProjectContext;
  onClose: () => void;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}

export function ArduinoBoardConfigDialog({ open, context, onClose, onSave }: ArduinoBoardConfigDialogProps) {
  const currentFqbn = context.fqbn
    ?? (context.boardProfileKey ? PROFILE_DEFAULT_FQBN[context.boardProfileKey] : undefined)
    ?? '';

  const [fqbn, setFqbn] = useState(currentFqbn);
  const [saving, setSaving] = useState(false);

  // Reset when dialog opens or context changes
  useEffect(() => {
    if (open) {
      setFqbn(
        context.fqbn
        ?? (context.boardProfileKey ? PROFILE_DEFAULT_FQBN[context.boardProfileKey] : undefined)
        ?? '',
      );
    }
  }, [open, context.fqbn, context.boardProfileKey]);

  const { base, options } = parseFqbn(fqbn);
  const optionSet = findOptionSet(base);

  const handleOptionChange = (key: string) => (e: SelectChangeEvent<string>) => {
    const newOptions = { ...options, [key]: e.target.value };
    // Remove option if it equals its default (keeps FQBN clean)
    const opt = optionSet?.options.find(o => o.key === key);
    if (opt && e.target.value === opt.defaultValue) delete newOptions[key];
    setFqbn(buildFqbn(base, newOptions));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ fqbn });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const getOptionValue = (opt: BoardOption): string => options[opt.key] ?? opt.defaultValue;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Board Configuration — {context.name}</DialogTitle>
      <DialogContent>
        {/* Current FQBN display */}
        <Box sx={{ mb: 2, mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">FQBN</Typography>
          <Chip
            label={fqbn || '(none)'}
            size="small"
            variant="outlined"
            sx={{ ml: 1, fontFamily: 'monospace', fontSize: 11, maxWidth: '100%' }}
          />
        </Box>

        {!optionSet && fqbn && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No configurable options for this board type. Edit the FQBN directly in project.json if needed.
          </Typography>
        )}

        {optionSet && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {optionSet.label} — Tools
            </Typography>
            <Divider />
            {optionSet.options.map(opt => (
              <FormControl key={opt.key} size="small" fullWidth>
                <InputLabel>{opt.label}</InputLabel>
                <Select
                  label={opt.label}
                  value={getOptionValue(opt)}
                  onChange={handleOptionChange(opt.key)}
                >
                  {opt.values.map(v => (
                    <MenuItem key={v.value} value={v.value}>
                      {v.label}
                      {v.value === opt.defaultValue && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          (default)
                        </Typography>
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !fqbn}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
