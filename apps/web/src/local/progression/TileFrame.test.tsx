import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { TileFrame } from './MetricTile';
import { TILES } from './tiles';

describe('TileFrame', () => {
  test('always renders the same five rows, in order, so tiles in a grid row line up', () => {
    const def = TILES.find((t) => t.id === 'gapping')!;
    const { container } = render(<TileFrame def={def} controls={null} body={<p>chart</p>} />);
    const article = screen.getByRole('article', { name: 'Club gapping' });
    expect([...article.children].map((c) => c.getAttribute('data-slot'))).toEqual(['head', 'headline', 'body', 'notes', 'footer']);
    // Empty rows stay in place (zero height) instead of letting later rows move up.
    expect(container.querySelector('[data-slot="headline"]')).toBeEmptyDOMElement();
    expect(container.querySelector('[data-slot="body"]')).toHaveTextContent('chart');
  });
});
