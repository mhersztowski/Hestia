import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

export type AudioDistanceModel = 'linear' | 'inverse' | 'exponential';

export interface AudioNodeData extends SceneNodeData {
  type: 'audio';
  src: string;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  positional: boolean;
  rolloffFactor: number;
  maxDistance: number;
  refDistance: number;
  distanceModel: AudioDistanceModel;
  coneInnerAngle: number;
  coneOuterAngle: number;
  coneOuterGain: number;
}

export class AudioNode extends SceneNode {
  src: string;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  positional: boolean;
  rolloffFactor: number;
  maxDistance: number;
  refDistance: number;
  distanceModel: AudioDistanceModel;
  coneInnerAngle: number;
  coneOuterAngle: number;
  coneOuterGain: number;

  constructor(data?: Partial<AudioNodeData>) {
    super({ ...data, type: 'audio' });
    this.src = data?.src ?? '';
    this.volume = data?.volume ?? 1;
    this.loop = data?.loop ?? false;
    this.autoplay = data?.autoplay ?? false;
    this.positional = data?.positional ?? true;
    this.rolloffFactor = data?.rolloffFactor ?? 1;
    this.maxDistance = data?.maxDistance ?? 10000;
    this.refDistance = data?.refDistance ?? 1;
    this.distanceModel = data?.distanceModel ?? 'inverse';
    this.coneInnerAngle = data?.coneInnerAngle ?? 360;
    this.coneOuterAngle = data?.coneOuterAngle ?? 360;
    this.coneOuterGain = data?.coneOuterGain ?? 0;
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'audio.src':
        this.src = value as string;
        this.notifyChange();
        return true;
      case 'audio.volume':
        this.volume = value as number;
        this.notifyChange();
        return true;
      case 'audio.loop':
        this.loop = value as boolean;
        this.notifyChange();
        return true;
      case 'audio.autoplay':
        this.autoplay = value as boolean;
        this.notifyChange();
        return true;
      case 'audio.positional':
        this.positional = value as boolean;
        this.notifyChange();
        return true;
      case 'audio.rolloffFactor':
        this.rolloffFactor = value as number;
        this.notifyChange();
        return true;
      case 'audio.maxDistance':
        this.maxDistance = value as number;
        this.notifyChange();
        return true;
      case 'audio.refDistance':
        this.refDistance = value as number;
        this.notifyChange();
        return true;
      case 'audio.distanceModel':
        this.distanceModel = value as AudioDistanceModel;
        this.notifyChange();
        return true;
      case 'audio.coneInnerAngle':
        this.coneInnerAngle = value as number;
        this.notifyChange();
        return true;
      case 'audio.coneOuterAngle':
        this.coneOuterAngle = value as number;
        this.notifyChange();
        return true;
      case 'audio.coneOuterGain':
        this.coneOuterGain = value as number;
        this.notifyChange();
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): AudioNodeData {
    return {
      ...super.toData(),
      type: 'audio',
      src: this.src,
      volume: this.volume,
      loop: this.loop,
      autoplay: this.autoplay,
      positional: this.positional,
      rolloffFactor: this.rolloffFactor,
      maxDistance: this.maxDistance,
      refDistance: this.refDistance,
      distanceModel: this.distanceModel,
      coneInnerAngle: this.coneInnerAngle,
      coneOuterAngle: this.coneOuterAngle,
      coneOuterGain: this.coneOuterGain,
    };
  }
}
