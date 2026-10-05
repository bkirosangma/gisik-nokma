import type { KgSigma } from './program.js';

type AttachmentManager = { invalidateNode(id: string): void; clear(): void };

/**
 * §4.2 trap 1 (`knowledge-graph-sigma.html:817-820`). sigma@4.0.0-beta.7 drops EVERY label attachment on each state
 * change and reprocess, then re-rasterises asynchronously, so a card's second line blinked on every hover. Keep the
 * cache; drop a node's entry only when its subtitle really changes or it leaves the graph. `internals` is private in the
 * typings, hence the cast. If an upgrade removes it, mounting FAILS LOUDLY (§10): the case 27.264 would otherwise pass on
 * a blinking build only by luck.
 */
export function keepAttachmentCache(sigma: KgSigma, log: string[]): (ref: string) => void {
  const am = (sigma as unknown as { internals?: { attachmentManager?: AttachmentManager } }).internals?.attachmentManager;
  if (am === undefined) throw new Error('sigma internals.attachmentManager is missing: the label-attachment cache fix (spec C §4.2 trap 1) cannot apply to this Sigma version');
  const drop = am.invalidateNode.bind(am);
  am.invalidateNode = () => undefined;
  am.clear = () => undefined;
  return (ref) => {
    log.push(ref);
    drop(ref);
  };
}
