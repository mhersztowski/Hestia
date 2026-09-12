import { z } from 'zod';

export type AutocompleteSource = 'users' | 'userDevices';

export interface FieldMeta {
  autocomplete?: AutocompleteSource;
  dependsOn?: string;
}

export interface RpcMethodDef<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  name: string;
  description?: string;
  tags?: string[];
  input: TInput;
  output: TOutput;
  fieldMeta?: Record<string, FieldMeta>;
}

export function defineRpcMethod<
  TInput extends z.ZodTypeAny,
  TOutput extends z.ZodTypeAny,
>(def: RpcMethodDef<TInput, TOutput>): RpcMethodDef<TInput, TOutput> {
  return def;
}

export interface RpcResponse<T = unknown> {
  ok: true;
  result: T;
}

export interface RpcErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export type RpcInput<T extends RpcMethodDef> = z.infer<T['input']>;
export type RpcOutput<T extends RpcMethodDef> = z.infer<T['output']>;
