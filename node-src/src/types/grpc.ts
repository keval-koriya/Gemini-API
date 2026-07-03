import { GRPC } from '../constants.js';

export interface RPCData {
    rpcid: GRPC;
    payload: string;
    identifier: string;
}

export function serializeRPCData(data: RPCData): any[] {
    return [data.rpcid, data.payload, null, data.identifier];
}
