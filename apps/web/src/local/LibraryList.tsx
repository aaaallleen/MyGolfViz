import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Menu } from '@base-ui/react/menu';
import { formatSessionDate } from '@fsa/domain';
import type { SessionRow } from './api';
import { DeleteSessionDialog } from './DeleteSessionDialog';

export function ClubChips({ clubs }: { clubs: SessionRow['clubs'] }) {
  return (
    <div className="lib-chips">
      {clubs.map((c) => (
        <span key={c.club} className="lib-chip">{`${c.club} ${c.count}`}</span>
      ))}
    </div>
  );
}

function RowMenu({ session, onDeleted }: { session: SessionRow; onDeleted(id: string): void }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="lib-menu__btn fsa-touch" aria-label={`Actions for ${session.name}`}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="13" cy="8" r="1.5" /></svg>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4} className="lib-menu__positioner">
            <Menu.Popup className="lib-menu">
              <Menu.Item className="lib-menu__item fsa-touch" onClick={() => navigate(`/sessions/${session.id}`)}>Open</Menu.Item>
              <Menu.Item className="lib-menu__item lib-menu__item--danger fsa-touch" onClick={() => setConfirming(true)}>Delete session</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <DeleteSessionDialog session={session} open={confirming} onOpenChange={setConfirming} onDeleted={onDeleted} />
    </>
  );
}

export function LibraryList({ rows, onDeleted }: { rows: SessionRow[]; onDeleted(id: string): void }) {
  return (
    <section className="lib-card">
      <div className="lib-table-wrap">
        <table className="lib-table">
          <thead>
            <tr>
              <th scope="col">Session</th>
              <th scope="col">Date</th>
              <th scope="col">Shots</th>
              <th scope="col">Files</th>
              <th scope="col">Clubs</th>
              <th scope="col"><span className="lib-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="lib-name" to={`/sessions/${r.id}`}>{r.name}</Link></td>
                <td>{formatSessionDate(r.date, { setByYou: false })}</td>
                <td className="lib-num">{r.shotCount}</td>
                <td>{r.fileCount}</td>
                <td><ClubChips clubs={r.clubs} /></td>
                <td className="lib-actions"><RowMenu session={r} onDeleted={onDeleted} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
