import type { UserModel } from './UserModel';

export interface AuthTokenPayload {
  userId: string;
  userName: string;
  isAdmin: boolean;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  user: UserPublic;
}

export type UserPublic = Omit<UserModel, 'password'>;

export interface ApiKeyModel {
  id: string;
  name: string;
  prefix: string;
  hash: string;
  userId: string;
  userName: string;
  isAdmin: boolean;
  roles: string[];
  createdAt: number;
  lastUsedAt: number | null;
}

export type ApiKeyPublic = Omit<ApiKeyModel, 'hash'>;

export interface ApiKeyCreateResponse {
  key: ApiKeyPublic;
  rawKey: string;
}
