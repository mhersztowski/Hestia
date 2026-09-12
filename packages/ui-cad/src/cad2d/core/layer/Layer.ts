import type { LineType } from '../types';

export interface Layer {
  id: string;
  name: string;
  color: string;
  lineType: LineType;
  lineWidth: number;
  visible: boolean;
  locked: boolean;
}

export const DEFAULT_LAYER: Layer = {
  id: '0',
  name: '0',
  color: '#ffffff',
  lineType: 'solid',
  lineWidth: 1,
  visible: true,
  locked: false,
};
