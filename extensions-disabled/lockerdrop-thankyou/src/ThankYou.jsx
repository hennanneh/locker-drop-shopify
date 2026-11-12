import '@shopify/ui-extensions/preact';
import { render } from 'preact';

// ABSOLUTE-MINIMAL ISOLATION TEST — a single static banner, no hooks, no data,
// no `shopify` global. If this does not appear on the immediate Thank You page,
// the failure is in the extension host/plumbing, not our render logic.
export default function extension() {
  render(
    <s-banner tone="success" heading="LockerDrop test">
      If you can see this, the Thank You extension is mounting.
    </s-banner>,
    document.body
  );
}
