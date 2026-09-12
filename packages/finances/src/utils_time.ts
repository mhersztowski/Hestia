import { format, parseISO, startOfMonth, isSameMonth } from 'date-fns';
import { pl } from 'date-fns/locale';

format(new Date(), 'dd.MM.yyyy');                    // '07.09.2026'
format(new Date(), 'LLLL yyyy', { locale: pl });     // 'wrzesień 2026' (Polish locale)
parseISO('2026-09-07');                              // Date
isSameMonth(a, b);                                   // grouping transactions by month