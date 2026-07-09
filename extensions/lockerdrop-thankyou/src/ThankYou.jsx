import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// TEMPORARY DIAGNOSTIC BUILD — renders a visible debug panel showing exactly
// where the extension stops, so we can see inside the sandbox via screenshot.
// Revert to the normal self-hiding version once the root cause is found.
export default function extension() {
  render(<ThankYouBlock />, document.body);
}

const API_BASE = 'https://app.lockerdrop.it';

function ThankYouBlock() {
  const [dbg, setDbg] = useState({ step: 'mounted', detail: '' });

  useEffect(() => {
    const info = {};
    try {
      info.shopify = typeof shopify;
      const oc = (typeof shopify !== 'undefined') ? shopify.orderConfirmation : undefined;
      info.oc = oc ? (oc.value ? 'has-value' : 'no-value') : 'undefined';
      let gid = null;
      try { gid = oc?.value?.order?.id || oc?.value?.id || null; } catch (e) { info.ocErr = String(e && e.message); }
      info.gid = gid || 'null';
      const orderNumber = gid ? gid.toString().split('/').pop() : null;
      info.orderNumber = orderNumber || 'null';

      if (!orderNumber) {
        setDbg({ step: 'NO-ORDER-NUMBER', detail: JSON.stringify(info) });
        return;
      }

      setDbg({ step: 'fetching', detail: JSON.stringify(info) });
      (async () => {
        try {
          let token = null;
          try { token = await shopify.sessionToken.get(); info.token = token ? 'got' : 'null'; }
          catch (e) { info.tokenErr = String(e && e.message); }
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(`${API_BASE}/api/customer/order-status/${orderNumber}`, { headers });
          info.httpStatus = res.status;
          const body = await res.json().catch(() => ({}));
          info.isLocker = String(body && body.isLockerDropOrder);
          info.lockerName = (body && body.lockerName) || '';
          setDbg({ step: 'DONE', detail: JSON.stringify(info) });
        } catch (e) {
          info.fetchErr = String(e && e.message);
          setDbg({ step: 'FETCH-ERROR', detail: JSON.stringify(info) });
        }
      })();
    } catch (e) {
      setDbg({ step: 'EXCEPTION', detail: String(e && e.message) });
    }
  }, []);

  return (
    <s-section heading="LockerDrop (debug)">
      <s-stack gap="small-200">
        <s-text type="strong">step: {dbg.step}</s-text>
        <s-text>{dbg.detail}</s-text>
      </s-stack>
    </s-section>
  );
}
