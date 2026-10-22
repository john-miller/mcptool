import { useState, type ReactNode } from 'react';
import { formatBytes } from '../frames';
import type { ContentBlock, ResourceContents } from '../mcp';
import { openResource } from '../sessions';
import { JsonView } from './Json';

// Renders what a server sends back the way a host hands it to the model: content
// blocks, embedded resources, prompt messages.

export function ContentBlocks({ blocks }: { blocks: ContentBlock[] | undefined }) {
  if (!blocks?.length) return <div className="muted">No content blocks.</div>;
  return (
    <div className="blocks">
      {blocks.map((block, i) => (
        <ContentBlockView key={i} block={block} />
      ))}
    </div>
  );
}

export function ContentBlockView({ block }: { block: ContentBlock }) {
  let body: ReactNode;
  switch (block.type) {
    case 'text':
      body = <TextContent text={block.text ?? ''} />;
      break;
    case 'image':
      body = <img className="content-image" src={`data:${block.mimeType};base64,${block.data}`} alt="" />;
      break;
    case 'audio':
      body = <audio controls src={`data:${block.mimeType};base64,${block.data}`} />;
      break;
    case 'resource_link':
      body = (
        <div className="resource-link">
          <div className="min0">
            <div className="strong">{block.title ?? block.name}</div>
            <div className="mono muted ellipsis">{block.uri}</div>
            {block.description && <div className="muted">{block.description}</div>}
          </div>
          <button className="btn btn-sm" onClick={() => openResource(block.uri)}>
            Open
          </button>
        </div>
      );
      break;
    case 'resource':
      body = <ResourceContentsView contents={[block.resource]} />;
      break;
    default:
      body = <JsonView value={block} />;
  }
  return (
    <div className="block">
      <div className="block-head">
        <span className="tag">{block.type}</span>
        {block.mimeType && <span className="muted mono">{block.mimeType}</span>}
        {block.annotations && (
          <span className="muted mono ellipsis" title="Annotations">
            {JSON.stringify(block.annotations)}
          </span>
        )}
      </div>
      {body}
    </div>
  );
}

/** Plain text, or a JSON tree when the text happens to be JSON (very common for tools). */
export function TextContent({ text }: { text: string }) {
  const parsed = tryParseJson(text);
  const [asText, setAsText] = useState(false);
  if (parsed === undefined) return <pre className="text-content">{text}</pre>;
  return (
    <div>
      <div className="block-tools">
        <button className="btn btn-ghost btn-xs" onClick={() => setAsText(!asText)}>
          {asText ? 'View as JSON' : 'View as text'}
        </button>
      </div>
      {asText ? <pre className="text-content">{text}</pre> : <JsonView value={parsed} />}
    </div>
  );
}

function tryParseJson(text: string): unknown {
  const t = text.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

export function ResourceContentsView({ contents }: { contents: ResourceContents[] | undefined }) {
  if (!contents?.length) return <div className="muted">No contents.</div>;
  return (
    <div className="blocks">
      {contents.map((c, i) => (
        <div key={i} className="block">
          <div className="block-head">
            <span className="tag">{c.blob !== undefined ? 'blob' : 'text'}</span>
            <span className="mono muted ellipsis">{c.uri}</span>
            {c.mimeType && <span className="mono muted">{c.mimeType}</span>}
          </div>
          {c.text !== undefined ? (
            <TextContent text={c.text} />
          ) : c.blob !== undefined && c.mimeType?.startsWith('image/') ? (
            <img className="content-image" src={`data:${c.mimeType};base64,${c.blob}`} alt="" />
          ) : c.blob !== undefined ? (
            <div className="muted">
              Binary, {formatBytes(Math.floor((c.blob.length * 3) / 4))}.{' '}
              <a download={c.uri.split('/').pop() || 'resource'} href={`data:${c.mimeType ?? 'application/octet-stream'};base64,${c.blob}`}>
                Download
              </a>
            </div>
          ) : (
            <JsonView value={c} />
          )}
        </div>
      ))}
    </div>
  );
}

export function PromptMessages({ messages }: { messages: any[] | undefined }) {
  if (!messages?.length) return <div className="muted">No messages.</div>;
  return (
    <div className="stack">
      {messages.map((m, i) => (
        <div key={i} className={`message message-${m.role}`}>
          <div className="message-role">{m.role}</div>
          {(Array.isArray(m.content) ? m.content : [m.content]).map((c: any, j: number) => (
            <ContentBlockView key={j} block={c} />
          ))}
        </div>
      ))}
    </div>
  );
}
