import { Menu } from '@base-ui/react/menu';
import { CATEGORIES, TILES, type TileId } from './tiles';

export interface AddTileMenuProps {
  /** Tiles already on the dashboard; the menu lists the others. */
  layout: readonly TileId[];
  onAdd: (id: TileId) => void;
}

/** `Add tile`: the tiles not on the dashboard, grouped by category. */
export function AddTileMenu({ layout, onAdd }: AddTileMenuProps) {
  const groups = CATEGORIES
    .map((c) => ({ ...c, tiles: TILES.filter((t) => t.category === c.id && !layout.includes(t.id)) }))
    .filter((g) => g.tiles.length > 0);
  return (
    <Menu.Root>
      <Menu.Trigger className="fsa-btn fsa-btn--secondary fsa-touch" disabled={groups.length === 0}>
        Add tile
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={4} className="lib-menu__positioner">
          <Menu.Popup className="lib-menu prog-add">
            {groups.map((g) => (
              <Menu.Group key={g.id} className="prog-add__group">
                <Menu.GroupLabel className="prog-add__label">{g.title}</Menu.GroupLabel>
                {g.tiles.map((t) => (
                  <Menu.Item key={t.id} className="lib-menu__item fsa-touch" onClick={() => onAdd(t.id)}>
                    {t.title}
                  </Menu.Item>
                ))}
              </Menu.Group>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
