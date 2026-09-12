import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

export type LightType = 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere';

export interface LightNodeData extends SceneNodeData {
  type: 'light';
  lightType: LightType;
  color: string;
  groundColor?: string;
  intensity: number;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  shadowIntensity?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
  shadowRadius?: number;
}

export class LightNode extends SceneNode {
  lightType: LightType;
  color: string;
  groundColor: string;
  intensity: number;
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
  shadowIntensity: number;
  shadowBias: number;
  shadowNormalBias: number;
  shadowRadius: number;

  constructor(data?: Partial<LightNodeData>) {
    super({ ...data, type: 'light' });
    this.lightType = data?.lightType ?? 'directional';
    this.color = data?.color ?? '#ffffff';
    this.groundColor = data?.groundColor ?? '#444444';
    this.intensity = data?.intensity ?? 1;
    this.distance = data?.distance ?? 0;
    this.decay = data?.decay ?? 2;
    this.angle = data?.angle ?? Math.PI / 10;
    this.penumbra = data?.penumbra ?? 0;
    this.shadowIntensity = data?.shadowIntensity ?? 1;
    this.shadowBias = data?.shadowBias ?? 0;
    this.shadowNormalBias = data?.shadowNormalBias ?? 0;
    this.shadowRadius = data?.shadowRadius ?? 1;
  }

  setColor(color: string): void {
    this.color = color;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const light = this._threeObject as any;
    if (light?.color?.set) light.color.set(color);
    this.notifyChange();
  }

  setGroundColor(color: string): void {
    this.groundColor = color;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const light = this._threeObject as any;
    if (light?.groundColor?.set) light.groundColor.set(color);
    this.notifyChange();
  }

  setIntensity(intensity: number): void {
    this.intensity = intensity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const light = this._threeObject as any;
    if (light && 'intensity' in light) light.intensity = intensity;
    this.notifyChange();
  }

  setLightType(lightType: LightType): void {
    this.lightType = lightType;
    this.notifyChange();
  }

  override setProperty(property: string, value: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const light = this._threeObject as any;
    switch (property) {
      case 'light.color':
        this.setColor(value as string);
        return true;
      case 'light.groundColor':
        this.setGroundColor(value as string);
        return true;
      case 'light.intensity':
        this.setIntensity(value as number);
        return true;
      case 'light.distance':
        this.distance = value as number;
        if (light && 'distance' in light) light.distance = value;
        this.notifyChange();
        return true;
      case 'light.decay':
        this.decay = value as number;
        if (light && 'decay' in light) light.decay = value;
        this.notifyChange();
        return true;
      case 'light.angle':
        this.angle = value as number;
        if (light && 'angle' in light) light.angle = value;
        this.notifyChange();
        return true;
      case 'light.penumbra':
        this.penumbra = value as number;
        if (light && 'penumbra' in light) light.penumbra = value;
        this.notifyChange();
        return true;
      case 'light.shadowIntensity':
        this.shadowIntensity = value as number;
        if (light?.shadow && 'intensity' in light.shadow) light.shadow.intensity = value;
        this.notifyChange();
        return true;
      case 'light.shadowBias':
        this.shadowBias = value as number;
        if (light?.shadow) light.shadow.bias = value;
        this.notifyChange();
        return true;
      case 'light.shadowNormalBias':
        this.shadowNormalBias = value as number;
        if (light?.shadow) light.shadow.normalBias = value;
        this.notifyChange();
        return true;
      case 'light.shadowRadius':
        this.shadowRadius = value as number;
        if (light?.shadow) light.shadow.radius = value;
        this.notifyChange();
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): LightNodeData {
    return {
      ...super.toData(),
      type: 'light',
      lightType: this.lightType,
      color: this.color,
      groundColor: this.groundColor,
      intensity: this.intensity,
      distance: this.distance,
      decay: this.decay,
      angle: this.angle,
      penumbra: this.penumbra,
      shadowIntensity: this.shadowIntensity,
      shadowBias: this.shadowBias,
      shadowNormalBias: this.shadowNormalBias,
      shadowRadius: this.shadowRadius,
    };
  }
}
