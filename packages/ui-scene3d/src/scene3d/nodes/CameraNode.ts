import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

export type CameraType = 'perspective' | 'orthographic';

export interface CameraNodeData extends SceneNodeData {
  type: 'camera';
  cameraType?: CameraType;
  fov: number;
  near: number;
  far: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export class CameraNode extends SceneNode {
  cameraType: CameraType;
  fov: number;
  near: number;
  far: number;
  left: number;
  right: number;
  top: number;
  bottom: number;

  constructor(data?: Partial<CameraNodeData>) {
    super({ ...data, type: 'camera' });
    this.cameraType = data?.cameraType ?? 'perspective';
    this.fov = data?.fov ?? 50;
    this.near = data?.near ?? 0.1;
    this.far = data?.far ?? 2000;
    this.left = data?.left ?? -0.77;
    this.right = data?.right ?? 0.77;
    this.top = data?.top ?? 1.0;
    this.bottom = data?.bottom ?? -1.0;
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'camera.fov':
        this.fov = value as number;
        this.notifyChange();
        return true;
      case 'camera.near':
        this.near = value as number;
        this.notifyChange();
        return true;
      case 'camera.far':
        this.far = value as number;
        this.notifyChange();
        return true;
      case 'camera.left':
        this.left = value as number;
        this.notifyChange();
        return true;
      case 'camera.right':
        this.right = value as number;
        this.notifyChange();
        return true;
      case 'camera.top':
        this.top = value as number;
        this.notifyChange();
        return true;
      case 'camera.bottom':
        this.bottom = value as number;
        this.notifyChange();
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): CameraNodeData {
    return {
      ...super.toData(),
      type: 'camera',
      cameraType: this.cameraType,
      fov: this.fov,
      near: this.near,
      far: this.far,
      left: this.left,
      right: this.right,
      top: this.top,
      bottom: this.bottom,
    };
  }
}
