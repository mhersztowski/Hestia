import { Packet } from './Packet';
import { PacketType } from '@hestia/core';

export interface AutomateRunPayload {
  flowId: string;
  variables?: Record<string, unknown>;
}

export class AutomateRunPacket extends Packet {
  public readonly flowId: string;
  public readonly variables?: Record<string, unknown>;

  constructor(flowId: string, variables?: Record<string, unknown>, id?: string) {
    super(PacketType.AUTOMATE_RUN, id);
    this.flowId = flowId;
    this.variables = variables;
  }

  getPayload(): AutomateRunPayload {
    return {
      flowId: this.flowId,
      variables: this.variables,
    };
  }

  static fromPayload(payload: AutomateRunPayload, id?: string): AutomateRunPacket {
    return new AutomateRunPacket(payload.flowId, payload.variables, id);
  }
}
