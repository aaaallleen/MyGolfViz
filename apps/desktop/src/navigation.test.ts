import { describe, expect, it } from 'vitest';
import { classifyNavigation, isTrustedPage } from './navigation';

const origin = 'http://127.0.0.1:50123';

describe('classifyNavigation', () => {
  it('allows the app origin', () => {
    expect(classifyNavigation('http://127.0.0.1:50123/#/sessions', origin)).toBe('allow');
  });

  it('sends other http(s) sites to the browser', () => {
    expect(classifyNavigation('https://github.com/aaaallleen/MyGolfViz', origin)).toBe('external');
  });

  it.each([
    'http://127.0.0.1:50124/',
    'file:///Users/x/a.csv',
    'javascript:alert(1)',
    'data:text/html,x',
    'not a url',
  ])('blocks %s', (target) => {
    expect(classifyNavigation(target, origin)).toBe('block');
  });

  it.each(['http://127.0.0.1:50123/', 'https://github.com/aaaallleen/MyGolfViz', 'file:///etc/hosts'])(
    'blocks %s while the app origin is unknown',
    (target) => {
      expect(classifyNavigation(target, null)).toBe('block');
    },
  );
});

describe('isTrustedPage', () => {
  const pages = ['/app/static/splash.html', '/app/static/error.html'];

  it.each([
    'http://127.0.0.1:50123/',
    'http://127.0.0.1:50123/sessions/1?x=1#y',
    'file:///app/static/splash.html',
    'file:///app/static/error.html?kind=crashed&title=x',
  ])('trusts %s', (url) => {
    expect(isTrustedPage(url, origin, pages)).toBe(true);
  });

  it.each([
    'http://127.0.0.1:50124/',
    'https://github.com/',
    'file:///app/static/other.html',
    'file:///etc/hosts',
    'data:text/html,x',
    'about:blank',
    'not a url',
  ])('does not trust %s', (url) => {
    expect(isTrustedPage(url, origin, pages)).toBe(false);
  });

  it('trusts only the local pages while the app origin is unknown', () => {
    expect(isTrustedPage('http://127.0.0.1:50123/', null, pages)).toBe(false);
    expect(isTrustedPage('file:///app/static/error.html', null, pages)).toBe(true);
  });
});
