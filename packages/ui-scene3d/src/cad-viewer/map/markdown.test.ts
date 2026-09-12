import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders ATX headings h1..h6', () => {
    expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>');
    expect(renderMarkdown('###### Deep')).toBe('<h6>Deep</h6>');
  });

  it('escapes HTML in source before emitting', () => {
    expect(renderMarkdown('a < b & c > d')).toBe('<p>a &lt; b &amp; c &gt; d</p>');
  });

  it('renders bold, italic and inline code', () => {
    expect(renderMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>');
    expect(renderMarkdown('an *em* word')).toBe('<p>an <em>em</em> word</p>');
    expect(renderMarkdown('`code`')).toBe('<p><code>code</code></p>');
  });

  it('renders links and images with safe attributes', () => {
    expect(renderMarkdown('[t](http://x)')).toBe(
      '<p><a href="http://x" target="_blank" rel="noopener noreferrer">t</a></p>',
    );
    expect(renderMarkdown('![alt](http://img)')).toBe('<p><img alt="alt" src="http://img" /></p>');
  });

  it('renders fenced code blocks with escaping and no inline processing', () => {
    const out = renderMarkdown('```\n**not bold** <x>\n```');
    expect(out).toBe('<pre><code>**not bold** &lt;x&gt;</code></pre>');
  });

  it('renders unordered and ordered lists, closing tags correctly', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol>\n<li>a</li>\n<li>b</li>\n</ol>');
  });

  it('switches list type when transitioning ul -> ol', () => {
    const out = renderMarkdown('- a\n1. b');
    expect(out).toBe('<ul>\n<li>a</li>\n</ul>\n<ol>\n<li>b</li>\n</ol>');
  });

  it('renders blockquotes and horizontal rules', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote>quoted</blockquote>');
    expect(renderMarkdown('---')).toBe('<hr/>');
  });

  it('joins consecutive plain lines into one paragraph with <br/>', () => {
    expect(renderMarkdown('line1\nline2')).toBe('<p>line1<br/>line2</p>');
  });

  it('normalizes CRLF and treats blank lines as separators', () => {
    expect(renderMarkdown('a\r\n\r\nb')).toBe('<p>a</p>\n<p>b</p>');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
