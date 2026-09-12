export type SmartDisplayViewType = 'clock' | 'text' | 'metric' | 'image' | 'random-image' | 'weather';

export interface SmartDisplayView {
  id: string;
  type: SmartDisplayViewType;
  label?: string;
  /** type=text: main text shown on device */
  text?: string;
  /** type=text: secondary text below main */
  subtext?: string;
  /** type=metric: telemetry metric key to display */
  metricKey?: string;
  /** type=metric: unit suffix, e.g. "°C" */
  metricUnit?: string;
  /** type=metric: device name to fetch telemetry from (defaults to current device) */
  metricDevice?: string;
  /** type=image: path relative to data root, e.g. "Public/photo.jpg" */
  imagePath?: string;
  /** type=random-image: Immich shared album URL, e.g. https://photos.example.com/share/xyz */
  albumShareUrl?: string;
  /** type=random-image: speak the image description via TTS when the view is shown */
  ttsDescription?: boolean;
  /** type=weather: latitude of the location */
  weatherLat?: number;
  /** type=weather: longitude of the location */
  weatherLon?: number;
  /** type=weather: display name of the location */
  weatherLocationName?: string;
}

export interface SmartDisplayConfig {
  type: 'smart-display-config';
  /** Duration each view is shown, in milliseconds. Default: 15 minutes. */
  cycleDurationMs: number;
  views: SmartDisplayView[];
}

export const DEFAULT_SMART_DISPLAY_CONFIG: SmartDisplayConfig = {
  type: 'smart-display-config',
  cycleDurationMs: 15 * 60 * 1000,
  views: [],
};
