import { Matrix4, Vector3, Euler, Quaternion, type Object3D } from 'three';

export type NodeType =
  | 'mesh'
  | 'light'
  | 'camera'
  | 'group'
  | 'audio'
  | 'geometry-point'
  | 'geometry-segment'
  | 'geometry-line'
  | 'geometry-angle'
  | 'ui-root'
  | 'ui-widget';

export interface SceneNodeData {
  id: string;
  name: string;
  type: NodeType;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
  renderOrder?: number;
  userData?: string;
  metadata?: Record<string, unknown>;
  children?: SceneNodeData[];
}

export class SceneNode {
  id: string;
  name: string;
  type: NodeType;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  renderOrder: number;
  userData: string;
  parent: SceneNode | null = null;
  children: SceneNode[] = [];
  metadata: Record<string, unknown>;
  _onChange: (() => void) | null = null;
  _threeObject: Object3D | null = null;

  constructor(data: Partial<SceneNodeData> & { type: NodeType }) {
    this.id = data.id ?? crypto.randomUUID();
    this.name = data.name ?? `${data.type}-${this.id.slice(0, 6)}`;
    this.type = data.type;
    this.visible = data.visible ?? true;
    this.position = data.position ?? [0, 0, 0];
    this.rotation = data.rotation ?? [0, 0, 0];
    this.scale = data.scale ?? [1, 1, 1];
    this.castShadow = data.castShadow ?? false;
    this.receiveShadow = data.receiveShadow ?? false;
    this.frustumCulled = data.frustumCulled ?? true;
    this.renderOrder = data.renderOrder ?? 0;
    this.userData = data.userData ?? '';
    this.metadata = data.metadata ?? {};
  }

  protected notifyChange(): void {
    this._onChange?.();
  }

  addChild(node: SceneNode): void {
    node.parent = this;
    this.children.push(node);
    if (this._onChange) {
      const cb = this._onChange;
      node.traverse((n) => { n._onChange = cb; });
    }
    this.notifyChange();
  }

  removeChild(id: string): SceneNode | null {
    const index = this.children.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const [removed] = this.children.splice(index, 1);
    removed.parent = null;
    removed.traverse((n) => { n._onChange = null; });
    this.notifyChange();
    return removed;
  }

  findById(id: string): SceneNode | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }

  traverse(callback: (node: SceneNode) => void): void {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }

  // ─── Local transform setters ──────────────────────────────

  setName(name: string): void {
    this.name = name;
    this.notifyChange();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this._threeObject) this._threeObject.visible = visible;
    this.notifyChange();
  }

  setPosition(position: [number, number, number]): void {
    this.position = position;
    this._threeObject?.position.set(...position);
    this.notifyChange();
  }

  setRotation(rotation: [number, number, number]): void {
    this.rotation = rotation;
    this._threeObject?.rotation.set(...rotation);
    this.notifyChange();
  }

  setScale(scale: [number, number, number]): void {
    this.scale = scale;
    this._threeObject?.scale.set(...scale);
    this.notifyChange();
  }

  protected _syncTransform(): void {
    if (!this._threeObject) return;
    this._threeObject.position.set(...this.position);
    this._threeObject.rotation.set(...this.rotation);
    this._threeObject.scale.set(...this.scale);
  }

  // ─── Matrix operations ────────────────────────────────────

  getLocalMatrix(): Matrix4 {
    const pos = new Vector3(...this.position);
    const euler = new Euler(...this.rotation);
    const quat = new Quaternion().setFromEuler(euler);
    const scl = new Vector3(...this.scale);
    return new Matrix4().compose(pos, quat, scl);
  }

  getWorldMatrix(): Matrix4 {
    if (this.parent) {
      return this.parent.getWorldMatrix().multiply(this.getLocalMatrix());
    }
    return this.getLocalMatrix();
  }

  setLocalMatrix(matrix: Matrix4): void {
    const pos = new Vector3();
    const quat = new Quaternion();
    const scl = new Vector3();
    matrix.decompose(pos, quat, scl);
    const euler = new Euler().setFromQuaternion(quat);
    this.position = pos.toArray() as [number, number, number];
    this.rotation = [euler.x, euler.y, euler.z];
    this.scale = scl.toArray() as [number, number, number];
    this._syncTransform();
    this.notifyChange();
  }

  setWorldMatrix(matrix: Matrix4): void {
    if (this.parent) {
      const parentWorldInverse = this.parent.getWorldMatrix().invert();
      const localMatrix = parentWorldInverse.multiply(matrix);
      this.setLocalMatrix(localMatrix);
    } else {
      this.setLocalMatrix(matrix);
    }
  }

  // ─── World-space getters / setters ─────────────────────────

  getWorldPosition(): [number, number, number] {
    const pos = new Vector3().setFromMatrixPosition(this.getWorldMatrix());
    return pos.toArray() as [number, number, number];
  }

  setWorldPosition(position: [number, number, number]): void {
    if (this.parent) {
      const parentWorldInverse = this.parent.getWorldMatrix().invert();
      const localPos = new Vector3(...position).applyMatrix4(parentWorldInverse);
      this.position = localPos.toArray() as [number, number, number];
    } else {
      this.position = position;
    }
    this._threeObject?.position.set(...this.position);
    this.notifyChange();
  }

  getWorldRotation(): [number, number, number] {
    const euler = new Euler().setFromRotationMatrix(this.getWorldMatrix());
    return [euler.x, euler.y, euler.z];
  }

  setWorldRotation(rotation: [number, number, number]): void {
    if (this.parent) {
      const parentPos = new Vector3();
      const parentQuat = new Quaternion();
      const parentScl = new Vector3();
      this.parent.getWorldMatrix().decompose(parentPos, parentQuat, parentScl);
      const worldQuat = new Quaternion().setFromEuler(new Euler(...rotation));
      const localQuat = parentQuat.invert().multiply(worldQuat);
      const localEuler = new Euler().setFromQuaternion(localQuat);
      this.rotation = [localEuler.x, localEuler.y, localEuler.z];
    } else {
      this.rotation = rotation;
    }
    this._threeObject?.rotation.set(...this.rotation);
    this.notifyChange();
  }

  getWorldScale(): [number, number, number] {
    const scl = new Vector3();
    this.getWorldMatrix().decompose(new Vector3(), new Quaternion(), scl);
    return scl.toArray() as [number, number, number];
  }

  setWorldScale(scale: [number, number, number]): void {
    if (this.parent) {
      const parentScale = this.parent.getWorldScale();
      this.scale = [
        scale[0] / parentScale[0],
        scale[1] / parentScale[1],
        scale[2] / parentScale[2],
      ];
    } else {
      this.scale = scale;
    }
    this._threeObject?.scale.set(...this.scale);
    this.notifyChange();
  }

  lookAt(target: [number, number, number]): void {
    const worldPos = this.getWorldPosition();
    const m = new Matrix4().lookAt(
      new Vector3(...worldPos),
      new Vector3(...target),
      new Vector3(0, 1, 0),
    );
    const euler = new Euler().setFromRotationMatrix(m);
    if (this.parent) {
      this.setWorldRotation([euler.x, euler.y, euler.z]);
    } else {
      this.rotation = [euler.x, euler.y, euler.z];
      this._threeObject?.rotation.set(...this.rotation);
      this.notifyChange();
    }
  }

  // ─── Generic property setter ──────────────────────────────

  setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'name':
        this.setName(value as string);
        return true;
      case 'visible':
        this.setVisible(value as boolean);
        return true;
      case 'position':
        this.setPosition(value as [number, number, number]);
        return true;
      case 'rotation':
        this.setRotation(value as [number, number, number]);
        return true;
      case 'scale':
        this.setScale(value as [number, number, number]);
        return true;
      case 'castShadow':
        this.castShadow = value as boolean;
        if (this._threeObject) this._threeObject.castShadow = value as boolean;
        this.notifyChange();
        return true;
      case 'receiveShadow':
        this.receiveShadow = value as boolean;
        if (this._threeObject) this._threeObject.receiveShadow = value as boolean;
        this.notifyChange();
        return true;
      case 'frustumCulled':
        this.frustumCulled = value as boolean;
        if (this._threeObject) this._threeObject.frustumCulled = value as boolean;
        this.notifyChange();
        return true;
      case 'renderOrder':
        this.renderOrder = value as number;
        if (this._threeObject) this._threeObject.renderOrder = value as number;
        this.notifyChange();
        return true;
      case 'userData':
        this.userData = value as string;
        this.notifyChange();
        return true;
      case '__regenerateId':
        this.id = crypto.randomUUID();
        this.notifyChange();
        return true;
      default:
        return false;
    }
  }

  toData(): SceneNodeData {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      position: [...this.position],
      rotation: [...this.rotation],
      scale: [...this.scale],
      castShadow: this.castShadow,
      receiveShadow: this.receiveShadow,
      frustumCulled: this.frustumCulled,
      renderOrder: this.renderOrder,
      userData: this.userData,
      metadata: { ...this.metadata },
      children: this.children.map((c) => c.toData()),
    };
  }
}
