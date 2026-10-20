import { createTypertRemoteInfo, type TypertRemoteMethodSpec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';

// The Client must explicitly mount its namespace; injecting remote.archside alone
// would leave the plugin waiting forever for a service nobody provides.
const session = z.object({ sessionId: z.string().min(1) });
const requests = {
  snapshot: session,
  saveLayout: session.extend({ layout: z.unknown() }),
  reference: session.extend({ id: z.string().min(1) }),
  asset: session.extend({ path: z.string().min(1) }),
};
const methods: Record<`archside/${string}`, TypertRemoteMethodSpec> = {};
for (const [method, schema] of Object.entries(requests)) {
  const codec = { mode: 'strict' as const, typeSymbol: `dsh-plugin-archside#${method}:request`, create: () => schema.strict() };
  methods[`archside/${method}`] = {
    service: 'archside', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', source: 'json', codec, strictCodec: codec }],
    result: { mode: 'strict', typeSymbol: `dsh-plugin-archside#${method}:result`, create: () => z.unknown() },
  };
}
export const ARCHSIDE_REMOTE = createTypertRemoteInfo({ package: 'dsh-plugin-archside', methods }, z);
