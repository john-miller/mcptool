import { useMemo, useState } from 'react';
import { CLAIM_DESCRIPTIONS, decodeJwt, HEADER_DESCRIPTIONS, relativeTime, TIME_CLAIMS, tokenStatus, type DecodedJwt } from '../jwt';
import { JsonView } from './Json';

export interface TokenSource {
  label: string;
  load: () => Promise<string>;
}

export function JwtDecoder({
  initialToken = '',
  sources = [],
  onClose,
}: {
  initialToken?: string;
  sources?: TokenSource[];
  onClose: () => void;
}) {
  const [input, setInput] = useState(initialToken);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const result = useMemo((): { decoded?: DecodedJwt; error?: string } => {
    if (!input.trim()) return {};
    try {
      return { decoded: decodeJwt(input) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [input]);

  const loadFrom = async (source: TokenSource) => {
    setSourceError(null);
    try {
      setInput(await source.load());
    } catch (err) {
      setSourceError((err as Error).message);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label="JWT decoder" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <strong>JWT decoder</strong>
          <span className="muted small">Decoded in your browser. Nothing is sent anywhere.</span>
          <div className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialog-body">
          {sources.length > 0 && (
            <div className="row">
              <span className="muted small">Load from</span>
              {sources.map((s) => (
                <button key={s.label} className="btn btn-sm" onClick={() => loadFrom(s)}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {sourceError && <div className="field-error">{sourceError}</div>}
          <textarea
            className="input mono jwt-input"
            rows={4}
            autoFocus
            spellCheck={false}
            placeholder="Paste a JWT (a 'Bearer …' value works too)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {result.error && <div className="error-box jwt-error">{result.error}</div>}
          {result.decoded && <DecodedView decoded={result.decoded} />}
        </div>
      </div>
    </div>
  );
}

function DecodedView({ decoded }: { decoded: DecodedJwt }) {
  const [payloadView, setPayloadView] = useState<'claims' | 'json'>('claims');
  const status = tokenStatus(decoded.payload);
  const payloadIsObject = !!decoded.payload && typeof decoded.payload === 'object' && !Array.isArray(decoded.payload);

  return (
    <div className="jwt">
      <div className="jwt-encoded mono">
        <span className="jwt-h">{decoded.parts[0]}</span>.<span className="jwt-p">{decoded.parts[1]}</span>.
        <span className="jwt-s">{decoded.parts[2]}</span>
      </div>

      <div className="row jwt-status">
        <span className={`status ${status.state === 'valid' ? 'status-ok' : status.state === 'no-expiry' ? '' : 'status-err'}`}>
          {status.state === 'valid' ? 'Not expired' : status.state === 'expired' ? 'Expired' : status.state === 'not-yet-valid' ? 'Not yet valid' : 'No expiry'}
        </span>
        <span className="muted">{status.message}</span>
        <span className="spacer" />
        <span className="muted small" title="Verifying needs the issuer's public key or secret">
          Signature not verified
        </span>
      </div>

      <section className="jwt-section">
        <h4 className="jwt-label jwt-h">Header</h4>
        <ClaimsTable claims={decoded.header} descriptions={HEADER_DESCRIPTIONS} />
      </section>

      <section className="jwt-section">
        <div className="card-head">
          <h4 className="jwt-label jwt-p">Payload</h4>
          <div className="spacer" />
          {payloadIsObject && (
            <div className="tabs tabs-sm">
              <button className={payloadView === 'claims' ? 'is-active' : ''} onClick={() => setPayloadView('claims')}>
                Claims
              </button>
              <button className={payloadView === 'json' ? 'is-active' : ''} onClick={() => setPayloadView('json')}>
                JSON
              </button>
            </div>
          )}
        </div>
        {payloadIsObject && payloadView === 'claims' ? (
          <ClaimsTable claims={decoded.payload as Record<string, unknown>} descriptions={CLAIM_DESCRIPTIONS} />
        ) : typeof decoded.payload === 'string' ? (
          <pre className="text-content">{decoded.payload}</pre>
        ) : (
          <JsonView value={decoded.payload} openDepth={4} />
        )}
      </section>

      <section className="jwt-section">
        <h4 className="jwt-label jwt-s">Signature</h4>
        <div className="mono small jwt-sig">{decoded.signature || '(empty: unsigned token, alg "none")'}</div>
      </section>
    </div>
  );
}

function ClaimsTable({ claims, descriptions }: { claims: Record<string, unknown>; descriptions: Record<string, string> }) {
  return (
    <table className="claims">
      <tbody>
        {Object.entries(claims).map(([key, value]) => (
          <tr key={key}>
            <td className="mono claim-key">{key}</td>
            <td className="claim-value">
              <ClaimValue name={key} value={value} />
            </td>
            <td className="muted claim-desc">{descriptions[key] ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClaimValue({ name, value }: { name: string; value: unknown }) {
  if (TIME_CLAIMS.has(name) && typeof value === 'number') {
    const ms = value * 1000;
    return (
      <span>
        <span className="mono">{value}</span>
        <span className="claim-time">
          {new Date(ms).toLocaleString()} ({relativeTime(ms)})
        </span>
      </span>
    );
  }
  if (typeof value === 'string') return <span className="mono claim-str">{value}</span>;
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      return (
        <span className="param-chips">
          {value.map((v, i) => (
            <span key={i} className="param-chip mono">
              {v}
            </span>
          ))}
        </span>
      );
    }
    return <JsonView value={value} openDepth={1} copy={false} />;
  }
  return <span className="mono">{JSON.stringify(value)}</span>;
}
