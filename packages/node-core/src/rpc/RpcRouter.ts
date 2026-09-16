import type { z } from 'zod';
import type { RpcMethodDef, RpcResponse, RpcErrorResponse, AuthTokenPayload } from '@hestia/core';
import { rpcMethods, type RpcMethodName } from '@hestia/core';

export type RpcHandler<TDef extends RpcMethodDef> = (
  input: z.infer<TDef['input']>,
  ctx: RpcContext
) => Promise<z.infer<TDef['output']>>;

export interface RpcContext {
  user?: AuthTokenPayload;
}

export class RpcRouter {
  private handlers = new Map<string, { def: RpcMethodDef; handler: RpcHandler<any> }>();

  register<TName extends RpcMethodName>(
    name: TName,
    handler: RpcHandler<(typeof rpcMethods)[TName]>
  ): void {
    const def = rpcMethods[name];
    this.handlers.set(String(name), { def, handler });
  }

  getRegisteredMethods(): Array<{ name: string; def: RpcMethodDef }> {
    return Array.from(this.handlers.entries()).map(([name, { def }]) => ({ name, def }));
  }

  async dispatch(
    methodName: string,
    rawInput: unknown,
    ctx: RpcContext
  ): Promise<{ statusCode: number; body: RpcResponse | RpcErrorResponse }> {
    const entry = this.handlers.get(methodName);
    if (!entry) {
      return {
        statusCode: 404,
        body: { ok: false, error: `Unknown RPC method: ${methodName}`, code: 'METHOD_NOT_FOUND' },
      };
    }

    const inputResult = entry.def.input.safeParse(rawInput);
    if (!inputResult.success) {
      const details = inputResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return {
        statusCode: 400,
        body: { ok: false, error: `Validation error: ${details}`, code: 'VALIDATION_ERROR' },
      };
    }

    try {
      const result = await entry.handler(inputResult.data, ctx);
      return { statusCode: 200, body: { ok: true, result } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      return { statusCode: 500, body: { ok: false, error: message, code: 'HANDLER_ERROR' } };
    }
  }
}
