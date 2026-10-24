/** DSH integration depends on capabilities, never on the host's version string. */
export class DshCapabilityError extends Error {
  readonly code = 'ARCHSIDE_DSH_CAPABILITY_MISSING';
  constructor(readonly capability: string) {
    super(`ArchSide：当前 DSH 缺少可用的${capability}，请更新插件以适配该接口`);
    this.name = 'DshCapabilityError';
  }
}

export function requireDshMethods(target: any, methods: readonly string[], capability: string): void {
  if (methods.some(method => typeof target?.[method] !== 'function')) throw new DshCapabilityError(capability);
}

export function optionalDshService(ctx: any, name: string): any {
  // Context.get is the Cordis service lookup API and does not make an optional
  // integration (e.g. the composer) a startup requirement for the whole panel.
  return typeof ctx.get === 'function' ? ctx.get(name) : ctx[name];
}
