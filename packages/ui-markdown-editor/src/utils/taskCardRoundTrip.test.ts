/**
 * Karta zadania musi przeżyć obieg markdown → HTML → markdown.
 *
 * To jest miejsce, które psuje się po cichu: karta renderuje się poprawnie,
 * a przy zapisie znika albo zostawia po sobie goły JSON w treści. Objaw widać
 * dopiero po ponownym otwarciu pliku, więc test pilnuje obu kierunków.
 */

import { describe, expect, it } from 'vitest';

import { htmlToMarkdown, markdownToHtml } from './markdownConverter';

const FENCE = [
    '```taskcard',
    '{',
    '  "taskId": "task-42",',
    '  "taskName": "Zaprojektować zasilanie"',
    '}',
    '```',
].join('\n');

describe('karta zadania w markdownie', () => {
    it('fence zamienia się w węzeł HTML z zakodowanymi atrybutami', () => {
        const html = markdownToHtml(`Przed\n\n${FENCE}\n\nPo`);

        expect(html).toContain('data-type="task-card"');
        expect(html).toContain(`data-task-id="${encodeURIComponent('task-42')}"`);
        expect(html).toContain(`data-task-name="${encodeURIComponent('Zaprojektować zasilanie')}"`);
        // Sam JSON nie ma prawa zostać w treści — to on wyciekał, gdy fence
        // przechodził przez showdown bez ochrony.
        expect(html).not.toContain('"taskId"');
    });

    it('węzeł wraca do fence bez utraty danych', () => {
        const markdown = htmlToMarkdown(markdownToHtml(FENCE));

        expect(markdown).toContain('```taskcard');
        expect(markdown).toContain('"taskId": "task-42"');
        expect(markdown).toContain('"taskName": "Zaprojektować zasilanie"');
    });

    it('tekst wokół karty zostaje nietknięty', () => {
        const markdown = htmlToMarkdown(markdownToHtml(`Przed\n\n${FENCE}\n\nPo`));

        expect(markdown).toContain('Przed');
        expect(markdown).toContain('Po');
        expect(markdown).toContain('```taskcard');
    });

    it('uszkodzony JSON nie rozlewa się po sąsiednim markdownie', () => {
        const broken = '```taskcard\n{ to nie jest json\n```';
        const markdown = htmlToMarkdown(markdownToHtml(`Przed\n\n${broken}\n\nPo`));

        // Karta traci treść, ale zostaje kartą — sąsiedztwo przeżywa.
        expect(markdown).toContain('```taskcard');
        expect(markdown).toContain('Przed');
        expect(markdown).toContain('Po');
        expect(markdown).not.toContain('to nie jest json');
    });

    it('dwie karty obok siebie nie mieszają się identyfikatorami', () => {
        const second = FENCE
            .replace('task-42', 'task-7')
            .replace('Zaprojektować zasilanie', 'Zamówić części');

        const markdown = htmlToMarkdown(markdownToHtml(`${FENCE}\n\n${second}`));

        expect(markdown).toContain('"taskId": "task-42"');
        expect(markdown).toContain('"taskId": "task-7"');
        expect(markdown).toContain('"taskName": "Zamówić części"');
    });
});
