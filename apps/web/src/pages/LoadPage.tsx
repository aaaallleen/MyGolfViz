import { useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@fsa/ui';
import { PrivacyNotice } from '../components/PrivacyNotice';
import { FileDropZone } from '../components/FileDropZone';
import { PreviewList } from '../components/PreviewList';
import { SessionDetailsForm } from '../components/SessionDetailsForm';
import { REPO_URL } from '../mode';
import { useWorkingSet } from '../state/store';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function LoadPage() {
  const ws = useWorkingSet();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const loadRef = useRef<HTMLDivElement>(null);

  const included = ws.staged.filter((f) => f.include && f.parse.ok);
  const shotCount = included.reduce((n, f) => n + f.parse.shots.length, 0);

  const open = () => inputRef.current?.click();
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) void ws.addFiles(files);
  };

  return (
    <div className="load-page">
      <h1>Load Session CSV</h1>
      <input ref={inputRef} type="file" multiple accept=".csv,text/csv" aria-label="Load Session CSV" hidden onChange={onPick} />
      <div className="load-page__entry" ref={loadRef}>
        <Button variant="primary" onClick={open}>Load Session CSV</Button>
      </div>
      <FileDropZone onFiles={(files) => void ws.addFiles(files)} />
      <PrivacyNotice />
      <p><a className="load-page__local" href={`${REPO_URL}#local-app`}>Want saved history? Run Local App</a></p>

      <section className="load-page__details" aria-labelledby="details-h">
        <h2 id="details-h">Session details</h2>
        <SessionDetailsForm value={ws.details} onChange={ws.setDetails} />
        <p className="load-page__helper">Set by you. File names and CSV contents are never used for the name or date. Kept in this tab only.</p>
      </section>

      <section className="load-page__files">
        <div className="load-page__files-head">
          <h2>Files</h2>
          <Button onClick={open}>Add files</Button>
        </div>
        {ws.busy && <p role="status">Reading files…</p>}
        <PreviewList files={ws.staged} onInclude={ws.setInclude} onRemove={ws.removeStaged} />
      </section>

      <section className="load-page__footer">
        <div className="load-page__summary">{`${plural(included.length, 'file', 'files')} · ${plural(shotCount, 'shot', 'shots')} ready`}</div>
        <div className="load-page__actions">
          <Button
            onClick={() => {
              ws.clear();
              loadRef.current?.querySelector('button')?.focus();
            }}
          >
            Clear analysis
          </Button>
          <Button
            variant="primary"
            disabled={shotCount === 0}
            onClick={() => {
              ws.analyze();
              navigate('/overview');
            }}
          >
            Analyze files
          </Button>
        </div>
      </section>
    </div>
  );
}
